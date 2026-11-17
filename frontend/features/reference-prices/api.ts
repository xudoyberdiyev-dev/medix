"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** Referent narx bilan solishtirish (O14, egasi 17.11.2026). */
export type RefFile = components["schemas"]["RefFile"];
export type CompareDetail = components["schemas"]["CompareDetail"];
export type CompareSummary = components["schemas"]["CompareSummary"];
export type CompareLine = components["schemas"]["CompareLine"];
export type CompareRequest = components["schemas"]["CompareRequest"];
export type CompareMode = CompareRequest["mode"];
export type ReceiptRefWarning = components["schemas"]["ReceiptRefWarning"];

export const PRICES_REFERENCE = "prices.reference";
export const MAX_BYTES = 10 * 1024 * 1024;

const KEY = ["reference-prices"] as const;

export async function readRefFile(file: File): Promise<RefFile> {
  await ensureCsrf();
  return unwrap(
    api.POST("/api/reference-prices/read", {
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const fd = new FormData();
        fd.append("file", file);
        return fd;
      },
    }),
  );
}

export function useRefHistory(branchId: number | null, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "history", branchId],
    queryFn: () => unwrap(api.GET("/api/reference-prices", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled,
  });
}

export function useRefCompare(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => unwrap(api.GET("/api/reference-prices/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useRefProfile() {
  return useQuery({
    queryKey: [...KEY, "profile"],
    queryFn: async () => {
      const r = await api.GET("/api/reference-prices/profile");
      if (r.response.status === 204) return null;
      return unwrap(Promise.resolve(r));
    },
  });
}

export async function saveRefProfile(name: string, mapping: Record<string, string>) {
  await ensureCsrf();
  return unwrap(api.PUT("/api/reference-prices/profile", { body: { name, mapping } }));
}

export function useRunCompare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CompareRequest) => {
      await ensureCsrf();
      return unwrap(api.POST("/api/reference-prices/compare", { body }));
    },
    onSuccess: (d) => {
      qc.setQueryData([...KEY, "detail", d.summary.id], d);
      void qc.invalidateQueries({ queryKey: [...KEY, "history"] });
    },
  });
}

export function useMatchLine(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rowNo, productId }: { rowNo: number; productId: number }) => {
      await ensureCsrf();
      return unwrap(api.PUT("/api/reference-prices/{id}/lines/{rowNo}/match", { params: { path: { id, rowNo } }, body: { productId } }));
    },
    onSuccess: (d) => {
      qc.setQueryData([...KEY, "detail", id], d);
      void qc.invalidateQueries({ queryKey: [...KEY, "history"] });
    },
  });
}

/** Kirim kartochkasi: oxirgi referent narxdan qimmat mahsulotlar (bloklamaydi). */
export function useReceiptRefWarnings(receiptId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "receipt", receiptId],
    queryFn: () => unwrap(api.GET("/api/reference-prices/receipt/{receiptId}", { params: { path: { receiptId: receiptId ?? 0 } } })),
    enabled: enabled && receiptId !== null,
  });
}

export function exportUrl(id: number, status?: string): string {
  return `/api/reference-prices/${id}/export${status ? `?status=${status}` : ""}`;
}
