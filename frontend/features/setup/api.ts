"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type SetupStatus = components["schemas"]["SetupStatus"];
export type Branch = components["schemas"]["Branch"];
export type Warehouse = components["schemas"]["Warehouse"];
export type Employee = components["schemas"]["Employee"];
export type Role = components["schemas"]["Role"];
export type BranchRequest = components["schemas"]["BranchRequest"];
export type WarehouseRequest = components["schemas"]["WarehouseRequest"];
export type EmployeeRequest = components["schemas"]["EmployeeRequest"];

export const SETUP_KEY = ["setup"] as const;

export function useSetupStatus() {
  return useQuery({ queryKey: SETUP_KEY, queryFn: () => unwrap(api.GET("/api/setup")) });
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => unwrap(api.GET("/api/roles")) });
}

function useSetupMutation<TBody, TResult>(fn: (body: TBody) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TBody) => {
      await ensureCsrf();
      return fn(body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETUP_KEY }),
  });
}

export type CompanyRequest = components["schemas"]["CompanyRequest"];
export type Company = components["schemas"]["Company"];

export function useSaveCompany() {
  return useSetupMutation((body: CompanyRequest) => unwrap(api.PUT("/api/setup/company", { body })));
}

/** Logotip: PNG yoki SVG, 2 MB gacha (server ham tekshiradi). */
export function useUploadLogo() {
  return useSetupMutation((file: File) =>
    unwrap(
      api.PUT("/api/setup/company/logo", {
        body: { file: file as unknown as string },
        bodySerializer: () => {
          const fd = new FormData();
          fd.append("file", file);
          return fd;
        },
      }),
    ),
  );
}

export function useRemoveLogo() {
  return useSetupMutation<void, Company>(() => unwrap(api.DELETE("/api/setup/company/logo")));
}

/** Logotip URL — versiya bilan (kesh yangilanishi uchun); null — logotip yoʻq. */
export function logoUrl(company: Pick<Company, "logoVersion"> | null | undefined): string | null {
  return company?.logoVersion != null ? `/api/company/logo?v=${company.logoVersion}` : null;
}

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Brauzerdagi tekshiruv (server baribir mazmun boʻyicha tekshiradi). */
export function logoProblem(file: { name: string; type: string; size: number }): "badType" | "tooBig" | null {
  const ok = file.type === "image/png" || file.type === "image/svg+xml" || /\.(png|svg)$/i.test(file.name);
  if (!ok) return "badType";
  if (file.size > LOGO_MAX_BYTES) return "tooBig";
  return null;
}

export function useCreateBranch() {
  return useSetupMutation((body: BranchRequest) => unwrap(api.POST("/api/setup/branches", { body })));
}

export function useUpdateBranch() {
  return useSetupMutation(({ id, body }: { id: number; body: BranchRequest }) =>
    unwrap(api.PUT("/api/setup/branches/{id}", { params: { path: { id } }, body })),
  );
}

export function useCreateWarehouse() {
  return useSetupMutation((body: WarehouseRequest) => unwrap(api.POST("/api/setup/warehouses", { body })));
}

export function useCreateEmployee() {
  return useSetupMutation((body: EmployeeRequest) => unwrap(api.POST("/api/setup/employees", { body })));
}

export function useCompleteSetup() {
  return useSetupMutation<void, SetupStatus>(() => unwrap(api.POST("/api/setup/complete")));
}

/** Usta qaysi qadamdan davom etadi: birinchi bajarilmagan qadam. */
export function firstIncompleteStep(s: SetupStatus): number {
  if (!s.company) return 0;
  if (s.branches.length === 0) return 1;
  if (s.branches.some((b) => !s.warehouses.some((w) => w.branchId === b.id))) return 2;
  return 3;
}
