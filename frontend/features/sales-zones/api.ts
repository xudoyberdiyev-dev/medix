"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** Savdo zonalari (O6, egasi 13.11.2026): filialga tegishli, mijozning filial shartlarida tanlanadi. */
export type SalesZone = components["schemas"]["SalesZone"];
export type ZoneCustomer = components["schemas"]["ZoneCustomer"];

export const SALES_ZONES_VIEW = "salesZones.view";
export const SALES_ZONES_EDIT = "salesZones.edit";

const KEY = ["sales-zones"] as const;

/** Roʻyxat: `branchId` — bitta filial (yoʻq — doiradagi hammasi), `activeOnly` — tanlash uchun. */
export function useSalesZones(branchId: number | null = null, activeOnly = false, enabled = true) {
  return useQuery({
    queryKey: [...KEY, branchId, activeOnly],
    queryFn: () => unwrap(api.GET("/api/sales-zones", { params: { query: { branchId: branchId ?? undefined, activeOnly } } })),
    enabled,
  });
}

export function useZoneCustomers(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "customers", id],
    queryFn: () => unwrap(api.GET("/api/sales-zones/{id}/customers", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

function useInvalidating<T, R>(fn: (v: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export const useSaveSalesZone = () =>
  useInvalidating(({ id, ...body }: { id?: number; branchId: number; name: string; note?: string }) =>
    id ? unwrap(api.PUT("/api/sales-zones/{id}", { params: { path: { id } }, body })) : unwrap(api.POST("/api/sales-zones", { body })),
  );

export const useToggleSalesZone = () =>
  useInvalidating(({ id, active }: { id: number; active: boolean }) =>
    active
      ? unwrap(api.POST("/api/sales-zones/{id}/activate", { params: { path: { id } } }))
      : unwrap(api.POST("/api/sales-zones/{id}/deactivate", { params: { path: { id } } })),
  );

/** Tanlash variantlari: faol zonalar + (boʻlsa) mijozning hozirgi nofaol zonasi. */
export function zoneOptions(zones: SalesZone[] | undefined, current: { id: number; name: string } | null | undefined) {
  const out = (zones ?? []).filter((z) => z.active).map((z) => ({ value: String(z.id), label: z.name }));
  if (current && !out.some((o) => o.value === String(current.id))) out.push({ value: String(current.id), label: current.name });
  return out;
}
