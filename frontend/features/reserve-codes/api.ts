"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** O10c «Zaxira kodlar»: «Zaxira kodlarga» egali buyurtmalar yetkazilganda tushgan markirovka kodlari. */
export type ReserveCode = components["schemas"]["ReserveCode"];
export type ReserveStatus = ReserveCode["status"];

export const ZCODES_VIEW = "zcodes.view";
export const ZCODES_EDIT = "zcodes.edit";

export type ReserveFilter = {
  status: ReserveStatus | null;
  branchId: number | null;
  from: string | null;
  to: string | null;
  q: string;
};

function query(f: ReserveFilter) {
  return {
    status: f.status ?? undefined,
    branchId: f.branchId ?? undefined,
    from: f.from ?? undefined,
    to: f.to ?? undefined,
    q: f.q.trim() || undefined,
  };
}

export function useReserveCodes(f: ReserveFilter, page: number, size: number) {
  return useQuery({
    queryKey: ["reserve-codes", f, page, size],
    queryFn: () => unwrap(api.GET("/api/reserve-codes", { params: { query: { ...query(f), page: page - 1, size } } })),
    placeholderData: keepPreviousData,
  });
}

/** Excel manzili (joriy filtrlar bilan). */
export function reserveExportUrl(f: ReserveFilter): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query(f))) if (v !== undefined) p.set(k, String(v));
  const qs = p.toString();
  return `/api/reserve-codes/export${qs ? `?${qs}` : ""}`;
}

/** «Ishlatildi deb belgilash» (use) yoki «Hisobdan chiqarish» (writeOff) — izoh bilan. */
export function useCloseReserveCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: number; action: "use" | "writeOff"; note: string }) => {
      await ensureCsrf();
      const opts = { params: { path: { id: v.id } }, body: { note: v.note } };
      return v.action === "use"
        ? unwrap(api.POST("/api/reserve-codes/{id}/use", opts))
        : unwrap(api.POST("/api/reserve-codes/{id}/write-off", opts));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reserve-codes"] }),
  });
}
