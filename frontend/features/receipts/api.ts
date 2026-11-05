"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type ReceiptSummary = components["schemas"]["ReceiptSummary"];
export type ReceiptDetail = components["schemas"]["ReceiptDetail"];
export type ReceiptLine = components["schemas"]["ReceiptLine"];
export type ReceiptRequest = components["schemas"]["ReceiptRequest"];
export type ReceiptStatus = ReceiptDetail["status"];
export type DiffReason = NonNullable<ReceiptLine["diffReason"]>;
export type Resolution = NonNullable<ReceiptDetail["resolution"]>;

/** Ruxsatlar (T12). */
export const RECEIPT_CREATE = "receipt.create";
export const RECEIPT_ACCEPT = "receipt.accept";
export const RECEIPT_POST = "receipt.post";
export const RECEIPT_CANCEL = "receipt.cancel";
export const RECEIPT_CANCEL_POSTED = "receipt.cancelPosted";
export const BONUS_CONFIRM = "supplierBonus.confirm";

export const STATUS_LABELS: Record<ReceiptStatus, string> = {
  DRAFT: "Qoralama",
  ACCEPTED: "Qabul qilindi",
  POSTED: "Oʻtkazildi",
  CANCELLED: "Bekor qilingan",
};

export const DIFF_LABELS: Record<DiffReason, string> = {
  SHORT: "Kam keldi",
  EXCESS: "Ortiqcha keldi",
  DAMAGED: "Shikastlangan",
};

/** Qabuldagi farq sababi soniga qarab (server qoidasi bilan bir xil): shikastlangan bor — «Shikastlangan», kam — «Kam keldi». */
export function expectedReason(qty: number, received: number, damaged: number): DiffReason | null {
  if (damaged > 0) return "DAMAGED";
  if (received < qty) return "SHORT";
  if (received > qty) return "EXCESS";
  return null;
}

export function useReceipts(branchId: number | null, status: ReceiptStatus | null, page: number, enabled = true) {
  return useQuery({
    queryKey: ["receipts", "list", branchId, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/receipts", {
          params: { query: { branchId: branchId ?? undefined, status: status ?? undefined, page: page - 1, size: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useReceipt(id: number | null) {
  return useQuery({
    queryKey: ["receipts", "one", id],
    queryFn: () => unwrap(api.GET("/api/receipts/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

function useReceiptMutation<T>(fn: (v: T) => Promise<ReceiptDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["receipts", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["receipts", "list"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export const useSaveReceipt = () =>
  useReceiptMutation(({ id, body }: { id?: number; body: ReceiptRequest }) =>
    id ? unwrap(api.PUT("/api/receipts/{id}", { params: { path: { id } }, body })) : unwrap(api.POST("/api/receipts", { body })),
  );

export const useAcceptReceipt = () =>
  useReceiptMutation(
    ({
      id,
      lines,
    }: {
      id: number;
      lines: { lineId: number; receivedQty: number; damagedQty: number; diffReason?: DiffReason; zoneId?: number }[];
    }) => unwrap(api.POST("/api/receipts/{id}/accept", { params: { path: { id } }, body: { lines } })),
  );

export const usePostReceipt = () =>
  useReceiptMutation(({ id, resolution }: { id: number; resolution?: Resolution }) =>
    unwrap(api.POST("/api/receipts/{id}/post", { params: { path: { id } }, body: { resolution } })),
  );

export const useConfirmBonus = () =>
  useReceiptMutation((id: number) => unwrap(api.POST("/api/receipts/{id}/bonus", { params: { path: { id } } })));

export const useCancelReceipt = () =>
  useReceiptMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/receipts/{id}/cancel", { params: { path: { id } }, body: { reason } })),
  );

export async function searchSuppliers(q: string) {
  const page = await unwrap(api.GET("/api/counterparties", { params: { query: { q, role: "SUPPLIER", size: 20 } } }));
  return page.items.map((c) => ({ value: String(c.id), label: c.name, sub: c.tin }));
}
