"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type WarehouseTransferSummary = components["schemas"]["WarehouseTransferSummary"];
export type WarehouseTransferDetail = components["schemas"]["WarehouseTransferDetail"];
export type WarehouseTransferStatus = WarehouseTransferDetail["status"];
export type WarehouseTransferRequest = components["schemas"]["WarehouseTransferRequest"];
export type ReceiveRequest = components["schemas"]["ReceiveRequest"];
export type TransferLine = WarehouseTransferDetail["lines"][number];

/** Ruxsatlar (T12): qoralama — transfer.ok, joʻnatish — transfer.send, qabul — transfer.receive, bekor qilish — transfer.cancel. */
export const TRANSFER_OK = "transfer.ok";
export const TRANSFER_SEND = "transfer.send";
export const TRANSFER_RECEIVE = "transfer.receive";
export const TRANSFER_CANCEL = "transfer.cancel";
export const OK_VIEW_KEYS = ["transfer.view", TRANSFER_OK, TRANSFER_SEND, TRANSFER_RECEIVE];

export const OK_STATUS_LABELS: Record<WarehouseTransferStatus, string> = {
  DRAFT: "Qoralama",
  IN_TRANSIT: "Yoʻlda",
  RECEIVED: "Qabul qilindi",
  CANCELLED: "Bekor qilindi",
};

/**
 * Qabul qatorlari: boʻsh maydon — toʻliq keldi; aks holda 0 … joʻnatilgan butun son.
 * Qaytaradi: serverga yuboriladigan qatorlar (faqat farqlilari), jami kamomad va xato matni.
 */
export function receiveLinesFrom(
  lines: TransferLine[],
  got: Record<number, string>,
): { lines: NonNullable<ReceiveRequest["lines"]>; shortage: number; error: string | null } {
  const out: NonNullable<ReceiveRequest["lines"]> = [];
  let shortage = 0;
  for (const l of lines) {
    const raw = (got[l.id] ?? "").trim();
    if (raw === "") continue;
    if (!/^\d+$/.test(raw))
      return { lines: [], shortage: 0, error: `${l.productName} · ${l.batchNumber}: miqdor butun son boʻlishi kerak` };
    const n = Number(raw);
    if (n > l.qty) return { lines: [], shortage: 0, error: `${l.productName} · ${l.batchNumber}: joʻnatildi ${l.qty}, kiritildi ${n}` };
    shortage += l.qty - n;
    if (n !== l.qty) out.push({ lineId: l.id, receivedQty: n });
  }
  return { lines: out, shortage, error: null };
}

export function useWarehouseTransfers(branchId: number | null, status: WarehouseTransferStatus | null, page: number) {
  return useQuery({
    queryKey: ["warehouse-transfers", "list", branchId, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/warehouse-transfers", {
          params: { query: { branchId: branchId ?? undefined, status: status ?? undefined, page: page - 1, size: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useWarehouseTransfer(id: number | null) {
  return useQuery({
    queryKey: ["warehouse-transfers", "one", id],
    queryFn: () => unwrap(api.GET("/api/warehouse-transfers/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useSourceZoneStock(zoneId: number | null) {
  return useQuery({
    queryKey: ["warehouse-transfers", "zone-stock", zoneId],
    queryFn: () => unwrap(api.GET("/api/warehouse-transfers/zone-stock", { params: { query: { zoneId: zoneId ?? 0 } } })),
    enabled: zoneId !== null,
  });
}

function useOkMutation<T>(fn: (v: T) => Promise<WarehouseTransferDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["warehouse-transfers", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["warehouse-transfers", "list"] });
      await qc.invalidateQueries({ queryKey: ["warehouse-transfers", "zone-stock"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useCreateWarehouseTransfer() {
  return useOkMutation((body: WarehouseTransferRequest) => unwrap(api.POST("/api/warehouse-transfers", { body })));
}

export function useSendWarehouseTransfer() {
  return useOkMutation((id: number) => unwrap(api.POST("/api/warehouse-transfers/{id}/send", { params: { path: { id } } })));
}

export function useReceiveWarehouseTransfer() {
  return useOkMutation((v: { id: number; body: ReceiveRequest }) =>
    unwrap(api.POST("/api/warehouse-transfers/{id}/receive", { params: { path: { id: v.id } }, body: v.body })),
  );
}

export function useCancelWarehouseTransfer() {
  return useOkMutation((id: number) => unwrap(api.POST("/api/warehouse-transfers/{id}/cancel", { params: { path: { id } } })));
}
