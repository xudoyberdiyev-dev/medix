"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { checkQty, type LineError } from "@/features/zone-transfers/api";

export type SupplierReturnSummary = components["schemas"]["SupplierReturnSummary"];
export type SupplierReturnDetail = components["schemas"]["SupplierReturnDetail"];
export type SupplierReturnStatus = SupplierReturnDetail["status"];
export type SupplierReturnReason = SupplierReturnDetail["reason"];
export type SupplierReturnRequest = components["schemas"]["SupplierReturnRequest"];
export type ReturnStockRow = components["schemas"]["ReturnStockRow"];

/** Ruxsatlar (T12): koʻrish — qy.view, yaratish — qy.create, tasdiqlash — qy.approve. */
export const QY_CREATE = "qy.create";
export const QY_APPROVE = "qy.approve";
export const QY_VIEW_KEYS = ["qy.view", QY_CREATE, QY_APPROVE];

/** Holat va sabablar tartibi; nomlari — lugʻatda `supplierReturns.status.*`, `supplierReturns.reason.*`. */
export const QY_STATUSES = ["PENDING", "POSTED", "REJECTED"] as const satisfies readonly SupplierReturnStatus[];
export const QY_REASONS = ["EXPIRING", "DAMAGED", "QUALITY", "SURPLUS", "OTHER"] as const satisfies readonly SupplierReturnReason[];

/** Kirim partiyalari qaysi zonalarda turibdi — zona tanlash uchun (takrorlarsiz, birinchi uchragan tartibda). */
export function zonesOf(stock: ReturnStockRow[]): ReturnStockRow["zone"][] {
  const seen = new Map<number, ReturnStockRow["zone"]>();
  for (const r of stock) if (!seen.has(r.zone.id)) seen.set(r.zone.id, r.zone);
  return [...seen.values()];
}

/** Kiritilgan miqdorlar (tanlangan zona qatorlari): musbat butun son, boʻsh miqdordan oshmaydi. Xato boʻlsa — `LineError`. */
export function returnLinesFrom(
  rows: ReturnStockRow[],
  qty: Record<number, string>,
): { lines: SupplierReturnRequest["lines"]; error: LineError | null } {
  const lines: SupplierReturnRequest["lines"] = [];
  for (const row of rows) {
    const raw = (qty[row.batchId] ?? "").trim();
    if (raw === "") continue;
    const n = checkQty(row, raw);
    if (typeof n !== "number") return { lines: [], error: n };
    lines.push({ batchId: row.batchId, qty: n });
  }
  return { lines, error: null };
}

export function useSupplierReturns(branchId: number | null, status: SupplierReturnStatus | null, page: number) {
  return useQuery({
    queryKey: ["supplier-returns", "list", branchId, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/supplier-returns", {
          params: { query: { branchId: branchId ?? undefined, status: status ?? undefined, page: page - 1, size: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useSupplierReturn(id: number | null) {
  return useQuery({
    queryKey: ["supplier-returns", "one", id],
    queryFn: () => unwrap(api.GET("/api/supplier-returns/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useReturnStock(receiptId: number | null) {
  return useQuery({
    queryKey: ["supplier-returns", "receipt-stock", receiptId],
    queryFn: () => unwrap(api.GET("/api/supplier-returns/receipt-stock", { params: { query: { receiptId: receiptId ?? 0 } } })),
    enabled: receiptId !== null,
  });
}

function useQyMutation<T>(fn: (v: T) => Promise<SupplierReturnDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["supplier-returns", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["supplier-returns", "list"] });
      await qc.invalidateQueries({ queryKey: ["supplier-returns", "receipt-stock"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
      await qc.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

export function useCreateSupplierReturn() {
  return useQyMutation((body: SupplierReturnRequest) => unwrap(api.POST("/api/supplier-returns", { body })));
}

export function useApproveSupplierReturn() {
  return useQyMutation((id: number) => unwrap(api.POST("/api/supplier-returns/{id}/approve", { params: { path: { id } } })));
}

export function useRejectSupplierReturn() {
  return useQyMutation((v: { id: number; reason: string }) =>
    unwrap(api.POST("/api/supplier-returns/{id}/reject", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
  );
}
