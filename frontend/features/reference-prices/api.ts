"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** O14 (egasi 17.11.2026): referent narx bilan solishtirish. */
export type RefList = components["schemas"]["RefList"];
export type RefCompareResult = components["schemas"]["RefCompareResult"];
export type RefCompareRow = components["schemas"]["RefCompareRow"];
export type RefRowInput = components["schemas"]["RefRowInput"];
export type RefStatus = RefCompareRow["status"];
export type CompareMode = RefCompareResult["mode"];
export type ImportFile = components["schemas"]["ImportFile"];

export const PRICES_REFERENCE = "prices.reference";
export const SPECIAL_COST = "special.cost";

const KEY = ["reference-prices"] as const;

export function useRefLists(enabled = true) {
  return useQuery({ queryKey: [...KEY, "lists"], queryFn: () => unwrap(api.GET("/api/reference-prices")), enabled });
}

export interface CompareParams {
  mode: CompareMode;
  priceTypeId?: number;
  receiptId?: number;
  branchId?: number;
}

export function useRefCompare(id: number, p: CompareParams, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "compare", id, p],
    queryFn: () => unwrap(api.GET("/api/reference-prices/{id}/compare", { params: { path: { id }, query: p } })),
    enabled,
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

export async function readRefFile(file: File): Promise<ImportFile> {
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

export async function saveRefProfile(name: string, mapping: Record<string, string>) {
  await ensureCsrf();
  return unwrap(api.PUT("/api/reference-prices/profile", { body: { name, mapping } }));
}

export function useUploadRef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { fileName: string; rows: RefRowInput[] }) => {
      await ensureCsrf();
      return unwrap(api.POST("/api/reference-prices", { body }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMatchRow(listId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { rowId: number; productId: number | null }) => {
      await ensureCsrf();
      await unwrap(
        api.PUT("/api/reference-prices/{id}/rows/{rowId}/product", {
          params: { path: { id: listId, rowId: v.rowId } },
          body: { productId: v.productId ?? undefined },
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReceiptWarnings(receiptId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "receipt", receiptId],
    queryFn: () => unwrap(api.GET("/api/reference-prices/receipt-warnings", { params: { query: { receiptId: receiptId ?? 0 } } })),
    enabled: enabled && receiptId !== null,
  });
}

/** Eksport havolasi (brauzer yuklab oladi). */
export function exportUrl(id: number, p: CompareParams, status?: RefStatus): string {
  const q = new URLSearchParams({ mode: p.mode });
  if (p.priceTypeId) q.set("priceTypeId", String(p.priceTypeId));
  if (p.receiptId) q.set("receiptId", String(p.receiptId));
  if (p.branchId) q.set("branchId", String(p.branchId));
  if (status) q.set("status", status);
  return `/api/reference-prices/${id}/export?${q.toString()}`;
}
