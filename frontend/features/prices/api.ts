"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type PriceRow = components["schemas"]["PriceRow"];
export type PriceChangeDetail = components["schemas"]["PriceChangeDetail"];
export type PriceChangeSummary = components["schemas"]["PriceChangeSummary"];
export type PriceChangeStatus = PriceChangeDetail["status"];
export type MarkupLine = components["schemas"]["MarkupLine"];

/** Narx oʻrnatadiganlar (server ham tekshiradi). */
export const PRICE_SETTERS = ["DIRECTOR", "ADMIN", "PURCHASER", "BRANCH_MANAGER"];

export const STATUS_LABELS: Record<PriceChangeStatus, string> = {
  DRAFT: "Qoralama",
  PENDING_APPROVAL: "Direktor tasdigʻida",
  APPROVED: "Tasdiqlangan",
  REJECTED: "Rad etilgan",
  CANCELLED: "Bekor qilingan",
};

export function usePrices(branchId: number | null, q: string, page: number, size: number) {
  return useQuery({
    queryKey: ["prices", branchId, q, page, size],
    queryFn: () =>
      unwrap(api.GET("/api/prices", { params: { query: { branchId: branchId ?? 0, q: q.trim() || undefined, page: page - 1, size } } })),
    enabled: branchId !== null,
    placeholderData: keepPreviousData,
  });
}

export function usePriceChanges(branchId: number | null, status: PriceChangeStatus | null, page: number) {
  return useQuery({
    queryKey: ["price-changes", "list", branchId, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/price-changes", {
          params: { query: { branchId: branchId ?? undefined, status: status ?? undefined, page: page - 1, size: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function usePriceChange(id: number | null) {
  return useQuery({
    queryKey: ["price-changes", "one", id],
    queryFn: () => unwrap(api.GET("/api/price-changes/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export interface DraftLine {
  productId: number;
  productCode: string;
  productName: string;
  priceTypeId: number;
  oldPrice?: string | null;
  newPrice: string;
}

export interface DraftBody {
  branchId: number;
  effectiveFrom: string;
  note?: string;
  lines: { productId: number; priceTypeId: number; newPrice: string }[];
}

function usePcMutation<T>(fn: (v: T) => Promise<PriceChangeDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["price-changes", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["price-changes", "list"] });
      await qc.invalidateQueries({ queryKey: ["prices"] });
    },
  });
}

export const useSaveDraft = () =>
  usePcMutation(({ id, body }: { id?: number; body: DraftBody }) =>
    id ? unwrap(api.PUT("/api/price-changes/{id}", { params: { path: { id } }, body })) : unwrap(api.POST("/api/price-changes", { body })),
  );

export const useSubmit = () =>
  usePcMutation((id: number) => unwrap(api.POST("/api/price-changes/{id}/submit", { params: { path: { id } } })));

export const useApprove = () =>
  usePcMutation(({ id, pin }: { id: number; pin: string }) =>
    unwrap(api.POST("/api/price-changes/{id}/approve", { params: { path: { id } }, body: { pin } })),
  );

export const useReject = () =>
  usePcMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/price-changes/{id}/reject", { params: { path: { id } }, body: { reason } })),
  );

export const useCancel = () =>
  usePcMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/price-changes/{id}/cancel", { params: { path: { id } }, body: { reason } })),
  );

export async function computeMarkup(body: {
  branchId: number;
  productIds: number[];
  priceTypeId: number;
  base: "CURRENT_SAME_TYPE" | "BASE_PRICE";
  percent: number;
  rounding: number;
}): Promise<MarkupLine[]> {
  await ensureCsrf();
  return unwrap(api.POST("/api/price-changes/markup", { body }));
}

export async function searchProducts(q: string) {
  const page = await unwrap(api.GET("/api/products", { params: { query: { q, size: 20 } } }));
  return page.items.map((p) => ({ value: String(p.id), label: p.name, sub: p.code, meta: p.manufacturer ?? undefined }));
}

/** Oʻzgarish foizi (koʻrsatish uchun): eski → yangi; eski yoʻq — null. */
export function percentChange(oldPrice: string | null | undefined, newPrice: string): number | null {
  if (!oldPrice || !/^\d+(\.\d+)?$/.test(newPrice)) return null;
  const o = Number(oldPrice);
  if (o === 0) return null;
  return Math.round(((Number(newPrice) - o) / o) * 10000) / 100;
}
