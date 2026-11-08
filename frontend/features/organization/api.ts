"use client";

import { toCyrillic } from "@/i18n/translit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Branch = components["schemas"]["Branch"];
export type Warehouse = components["schemas"]["Warehouse"];
export type Zone = components["schemas"]["Zone"];
export type ZoneType = Zone["type"];
export type CreateBranchRequest = components["schemas"]["CreateBranchRequest"];
export type UpdateBranchRequest = components["schemas"]["UpdateBranchRequest"];

/** Zona turi nomi joriy interfeys tilida (`<html lang>`; ro'yxat/oyna ichida, hook'siz ishlatish uchun). */
export function zoneLabel(type: ZoneType): string {
  const lang = typeof document === "undefined" ? "uz-Latn" : document.documentElement.lang;
  if (lang === "ru") return ZONE_LABELS_RU[type];
  if (lang === "uz-Cyrl") return toCyrillic(ZONE_LABELS[type]);
  return ZONE_LABELS[type];
}

const ZONE_LABELS_RU: Record<ZoneType, string> = {
  RECEIVING: "Приёмка",
  MAIN: "Основное хранение",
  QUARANTINE: "Карантин",
  SHIPPING: "Отгрузка",
  COLD: "Холод",
  SAFE: "Сейф",
};

/** Asl (uz-Latn) nomlar — standart zona nomi bilan solishtirish uchun ham. */
export const ZONE_LABELS: Record<ZoneType, string> = {
  RECEIVING: "Qabul",
  MAIN: "Asosiy saqlash",
  QUARANTINE: "Karantin",
  SHIPPING: "Joʻnatish",
  COLD: "Sovuq",
  SAFE: "Seyf",
};

/** Ombor yaratilgandan keyin qoʻshish mumkin boʻlgan zonalar (majburiylari doim bor). */
export const OPTIONAL_ZONES: ZoneType[] = ["COLD", "SAFE"];

export function missingOptionalZones(w: Warehouse): ZoneType[] {
  return OPTIONAL_ZONES.filter((t) => !w.zones.some((z) => z.type === t));
}

const BRANCHES = ["branches"] as const;
const WAREHOUSES = ["warehouses"] as const;

export function useBranchList() {
  return useQuery({ queryKey: BRANCHES, queryFn: () => unwrap(api.GET("/api/branches")) });
}

export function useWarehouses() {
  return useQuery({ queryKey: WAREHOUSES, queryFn: () => unwrap(api.GET("/api/warehouses")) });
}

function useMutationWith<T, R>(key: readonly string[], fn: (v: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export const useCreateBranch = () => useMutationWith(BRANCHES, (body: CreateBranchRequest) => unwrap(api.POST("/api/branches", { body })));

export const useUpdateBranch = () =>
  useMutationWith(BRANCHES, ({ id, body }: { id: number; body: UpdateBranchRequest }) =>
    unwrap(api.PUT("/api/branches/{id}", { params: { path: { id } }, body })),
  );

export const useDeactivateBranch = () =>
  useMutationWith(BRANCHES, ({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/branches/{id}/deactivate", { params: { path: { id } }, body: { reason } })),
  );

export const useActivateBranch = () =>
  useMutationWith(BRANCHES, (id: number) => unwrap(api.POST("/api/branches/{id}/activate", { params: { path: { id } } })));

export const useCreateWarehouse = () =>
  useMutationWith(WAREHOUSES, (body: { branchId: number; name: string; address?: string; extraZones?: ZoneType[] }) =>
    unwrap(api.POST("/api/warehouses", { body })),
  );

export const useUpdateWarehouse = () =>
  useMutationWith(WAREHOUSES, ({ id, name, address }: { id: number; name: string; address?: string }) =>
    unwrap(api.PUT("/api/warehouses/{id}", { params: { path: { id } }, body: { name, address } })),
  );

export const useAddZone = () =>
  useMutationWith(WAREHOUSES, ({ id, type }: { id: number; type: ZoneType }) =>
    unwrap(api.POST("/api/warehouses/{id}/zones", { params: { path: { id } }, body: { type } })),
  );

export const useRenameZone = () =>
  useMutationWith(WAREHOUSES, ({ id, zoneId, name }: { id: number; zoneId: number; name: string }) =>
    unwrap(api.PUT("/api/warehouses/{id}/zones/{zoneId}", { params: { path: { id, zoneId } }, body: { name } })),
  );

export const useDeactivateWarehouse = () =>
  useMutationWith(WAREHOUSES, ({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/warehouses/{id}/deactivate", { params: { path: { id } }, body: { reason } })),
  );

export const useActivateWarehouse = () =>
  useMutationWith(WAREHOUSES, (id: number) => unwrap(api.POST("/api/warehouses/{id}/activate", { params: { path: { id } } })));

/** Qidiruv: nom, kod, STIR yoki yuridik nom boʻyicha. */
export function filterBranches(list: Branch[], query: string): Branch[] {
  const q = query.trim().toLocaleLowerCase("uz");
  if (!q) return list;
  return list.filter((b) => [b.name, b.code, b.tin, b.legalName].some((v) => v.toLocaleLowerCase("uz").includes(q)));
}

/** Omborlarni filial boʻyicha guruhlash (filiallar tartibida). */
export function groupByBranch(branches: Branch[], warehouses: Warehouse[]): { branch: Branch; warehouses: Warehouse[] }[] {
  return branches
    .map((branch) => ({ branch, warehouses: warehouses.filter((w) => w.branchId === branch.id) }))
    .filter((g) => g.warehouses.length > 0 || g.branch.active);
}
