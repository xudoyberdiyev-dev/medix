"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { checkQty, type LineError } from "@/features/zone-transfers/api";

export type WriteOffSummary = components["schemas"]["WriteOffSummary"];
export type WriteOffDetail = components["schemas"]["WriteOffDetail"];
export type WriteOffStatus = WriteOffDetail["status"];
export type WriteOffReason = WriteOffDetail["reason"];
export type WriteOffRequest = components["schemas"]["WriteOffRequest"];
export type WriteOffStockRow = components["schemas"]["WriteOffStockRow"];

/** Ruxsatlar (T12): koʻrish — hc.view, yaratish — hc.create, tasdiqlash — hc.approve, 5 000 000 dan katta — hc.director. */
export const HC_CREATE = "hc.create";
export const HC_APPROVE = "hc.approve";
export const HC_DIRECTOR = "hc.director";
export const HC_VIEW_KEYS = ["hc.view", HC_CREATE, HC_APPROVE];

/** T12 hcDirApprove — server bilan bir xil (tannarx summasi shundan KATTA boʻlsa — Direktor). */
export const HC_DIRECTOR_LIMIT = "5000000.00";

/** Holat va sabablar tartibi (filtr uchun); nomlari — lugʻatda `writeOffs.status.*`, `writeOffs.reason.*`. */
export const HC_STATUSES = ["PENDING", "POSTED", "REJECTED"] as const satisfies readonly WriteOffStatus[];
export const HC_REASONS = ["EXPIRED", "DAMAGED", "SHORTAGE", "OTHER"] as const satisfies readonly WriteOffReason[];

/** Kiritilgan miqdorlar: musbat butun son, boʻsh miqdordan oshmaydi. Xato boʻlsa — `LineError`. */
export function linesFrom(
  stock: WriteOffStockRow[],
  qty: Record<number, string>,
): { lines: WriteOffRequest["lines"]; error: LineError | null } {
  const lines: WriteOffRequest["lines"] = [];
  for (const row of stock) {
    const raw = (qty[row.batchId] ?? "").trim();
    if (raw === "") continue;
    const n = checkQty(row, raw);
    if (typeof n !== "number") return { lines: [], error: n };
    lines.push({ batchId: row.batchId, qty: n });
  }
  return { lines, error: null };
}

/** Muddati oʻtgan partiyalar — «Muddati oʻtgan» sababi uchun boʻsh miqdorni bir bosishda toʻldirish. */
export function fillExpired(stock: WriteOffStockRow[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const r of stock) if (r.expired && r.free > 0) out[r.batchId] = String(r.free);
  return out;
}

export function useWriteOffs(branchId: number | null, status: WriteOffStatus | null, reason: WriteOffReason | null, page: number) {
  return useQuery({
    queryKey: ["write-offs", "list", branchId, status, reason, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/write-offs", {
          params: {
            query: {
              branchId: branchId ?? undefined,
              status: status ?? undefined,
              reason: reason ?? undefined,
              page: page - 1,
              size: 50,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useWriteOff(id: number | null) {
  return useQuery({
    queryKey: ["write-offs", "one", id],
    queryFn: () => unwrap(api.GET("/api/write-offs/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useWriteOffStock(zoneId: number | null) {
  return useQuery({
    queryKey: ["write-offs", "zone-stock", zoneId],
    queryFn: () => unwrap(api.GET("/api/write-offs/zone-stock", { params: { query: { zoneId: zoneId ?? 0 } } })),
    enabled: zoneId !== null,
  });
}

function useHcMutation<T>(fn: (v: T) => Promise<WriteOffDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["write-offs", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["write-offs", "list"] });
      await qc.invalidateQueries({ queryKey: ["write-offs", "zone-stock"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useCreateWriteOff() {
  return useHcMutation((body: WriteOffRequest) => unwrap(api.POST("/api/write-offs", { body })));
}

export function useApproveWriteOff() {
  return useHcMutation((id: number) => unwrap(api.POST("/api/write-offs/{id}/approve", { params: { path: { id } } })));
}

export function useRejectWriteOff() {
  return useHcMutation((v: { id: number; reason: string }) =>
    unwrap(api.POST("/api/write-offs/{id}/reject", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
  );
}
