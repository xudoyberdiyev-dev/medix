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

export const ZK_STATUS_LABELS: Record<ZoneTransferStatus, string> = {
  PENDING: "Tasdiqda",
  POSTED: "Oʻtkazildi",
  REJECTED: "Rad etildi",
};

/** Karantindan sotuvga ochiq zonaga — tasdiq kerak (server bilan bir xil qoida). */
export function needsApproval(fromType: string | undefined, toType: string | undefined): boolean {
  return fromType === "QUARANTINE" && (toType === "MAIN" || toType === "COLD" || toType === "SAFE");
}

/** Kiritilgan miqdorlar: musbat butun son, boʻsh miqdordan oshmaydi. Xato boʻlsa — matn. */
export function linesFrom(
  stock: ZoneStockRow[],
  qty: Record<number, string>,
): { lines: ZoneTransferRequest["lines"]; error: string | null } {
  const lines: ZoneTransferRequest["lines"] = [];
  for (const row of stock) {
    const raw = (qty[row.batchId] ?? "").trim();
    if (raw === "") continue;
    if (!/^\d+$/.test(raw) || Number(raw) <= 0)
      return { lines: [], error: `${row.productName} · ${row.batchNumber}: miqdor musbat butun son boʻlishi kerak` };
    const n = Number(raw);
    if (n > row.free) return { lines: [], error: `${row.productName} · ${row.batchNumber}: boʻsh ${row.free}, kiritildi ${n}` };
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
