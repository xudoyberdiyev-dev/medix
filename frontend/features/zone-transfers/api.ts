"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type ZoneTransferSummary = components["schemas"]["ZoneTransferSummary"];
export type ZoneTransferDetail = components["schemas"]["ZoneTransferDetail"];
export type ZoneTransferStatus = ZoneTransferDetail["status"];
export type ZoneTransferRequest = components["schemas"]["ZoneTransferRequest"];
export type ZoneStockRow = components["schemas"]["ZoneStockRow"];

/** Ruxsatlar (T12): yaratish — transfer.zk, karantindan sotuvga ochiq zonaga koʻchirishni tasdiqlash — transfer.quar. */
export const TRANSFER_ZK = "transfer.zk";
export const TRANSFER_QUAR = "transfer.quar";
export const TRANSFER_VIEW_KEYS = ["transfer.view", TRANSFER_ZK, TRANSFER_QUAR];

/** Holatlar tartibi (filtr uchun); nomlari — lugʻatda `zoneTransfers.status.*`. */
export const ZK_STATUSES = ["DRAFT", "PENDING", "POSTED", "REJECTED", "CANCELLED"] as const satisfies readonly ZoneTransferStatus[];

/** Qator xatosi — matni lugʻatda `zoneTransfers.lineError.*` (komponentda `useLineErrorText`). */
export type LineError =
  | { code: "notPositiveInt"; product: string; batch: string }
  | { code: "overFree"; product: string; batch: string; free: number; got: number };

/** Kiritilgan miqdorni tekshiradi: musbat butun son, boʻsh miqdordan oshmaydi. */
export function checkQty(row: { productName: string; batchNumber: string; free: number }, raw: string): LineError | number {
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) return { code: "notPositiveInt", product: row.productName, batch: row.batchNumber };
  const n = Number(raw);
  if (n > row.free) return { code: "overFree", product: row.productName, batch: row.batchNumber, free: row.free, got: n };
  return n;
}

/** Karantindan sotuvga ochiq zonaga — tasdiq kerak (server bilan bir xil qoida). */
export function needsApproval(fromType: string | undefined, toType: string | undefined): boolean {
  return fromType === "QUARANTINE" && (toType === "MAIN" || toType === "COLD" || toType === "SAFE");
}

/** Kiritilgan miqdorlar: musbat butun son, boʻsh miqdordan oshmaydi. Xato boʻlsa — `LineError`. */
export function linesFrom(
  stock: ZoneStockRow[],
  qty: Record<number, string>,
): { lines: ZoneTransferRequest["lines"]; error: LineError | null } {
  const lines: ZoneTransferRequest["lines"] = [];
  for (const row of stock) {
    const raw = (qty[row.batchId] ?? "").trim();
    if (raw === "") continue;
    const n = checkQty(row, raw);
    if (typeof n !== "number") return { lines: [], error: n };
    lines.push({ batchId: row.batchId, qty: n });
  }
  return { lines, error: null };
}

export function useZoneTransfers(branchId: number | null, status: ZoneTransferStatus | null, page: number) {
  return useQuery({
    queryKey: ["zone-transfers", "list", branchId, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/zone-transfers", {
          params: { query: { branchId: branchId ?? undefined, status: status ?? undefined, page: page - 1, size: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useZoneTransfer(id: number | null) {
  return useQuery({
    queryKey: ["zone-transfers", "one", id],
    queryFn: () => unwrap(api.GET("/api/zone-transfers/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useZoneStock(zoneId: number | null) {
  return useQuery({
    queryKey: ["zone-transfers", "zone-stock", zoneId],
    queryFn: () => unwrap(api.GET("/api/zone-transfers/zone-stock", { params: { query: { zoneId: zoneId ?? 0 } } })),
    enabled: zoneId !== null,
  });
}

function useZkMutation<T>(fn: (v: T) => Promise<ZoneTransferDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["zone-transfers", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["zone-transfers", "list"] });
      await qc.invalidateQueries({ queryKey: ["zone-transfers", "zone-stock"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useCreateZoneTransfer() {
  return useZkMutation((body: ZoneTransferRequest) => unwrap(api.POST("/api/zone-transfers", { body })));
}

export function useApproveZoneTransfer() {
  return useZkMutation((id: number) => unwrap(api.POST("/api/zone-transfers/{id}/approve", { params: { path: { id } } })));
}

export function useRejectZoneTransfer() {
  return useZkMutation((v: { id: number; reason: string }) =>
    unwrap(api.POST("/api/zone-transfers/{id}/reject", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
  );
}

/** Qoralama: yaratish (raqam oladi, tovar joyida), tahrirlash, oʻtkazish (yoki tasdiqqa yuborish), bekor qilish. */
export function useCreateZoneTransferDraft() {
  return useZkMutation((body: ZoneTransferRequest) => unwrap(api.POST("/api/zone-transfers/drafts", { body })));
}

export function useUpdateZoneTransferDraft() {
  return useZkMutation((v: { id: number; body: ZoneTransferRequest }) =>
    unwrap(api.PUT("/api/zone-transfers/{id}", { params: { path: { id: v.id } }, body: v.body })),
  );
}

export function useSubmitZoneTransfer() {
  return useZkMutation((id: number) => unwrap(api.POST("/api/zone-transfers/{id}/submit", { params: { path: { id } } })));
}

export function useCancelZoneTransfer() {
  return useZkMutation((id: number) => unwrap(api.POST("/api/zone-transfers/{id}/cancel", { params: { path: { id } } })));
}
