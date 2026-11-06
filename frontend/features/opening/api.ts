"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type OpeningSummary = components["schemas"]["OpeningSummary"];
export type OpeningDetail = components["schemas"]["OpeningDetail"];
export type OpeningLine = components["schemas"]["OpeningLine"];
export type OpeningStatus = OpeningDetail["status"];
export type OpeningImportResult = components["schemas"]["OpeningImportResult"];
export type OpeningRequest = components["schemas"]["OpeningRequest"];

/** Ruxsatlar (T12): yaratish — opening.create + opening.goods, oʻtkazish — opening.approve, oʻtkazilganni bekor qilish — opening.cancel. */
export const OPENING_CREATE = "opening.create";
export const OPENING_GOODS = "opening.goods";
export const OPENING_APPROVE = "opening.approve";
export const OPENING_CANCEL = "opening.cancel";

export const STATUS_LABELS: Record<OpeningStatus, string> = {
  DRAFT: "Qoralama",
  POSTED: "Oʻtkazildi",
  CANCELLED: "Bekor qilingan",
};

export function useOpenings(branchId: number | null, status: OpeningStatus | null, page: number) {
  return useQuery({
    queryKey: ["openings", "list", branchId, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/opening-balances", {
          params: { query: { branchId: branchId ?? undefined, status: status ?? undefined, page: page - 1, size: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useOpening(id: number | null) {
  return useQuery({
    queryKey: ["openings", "one", id],
    queryFn: () => unwrap(api.GET("/api/opening-balances/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

function useOpeningMutation<T>(fn: (v: T) => Promise<OpeningDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["openings", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["openings", "list"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export const useSaveOpening = () =>
  useOpeningMutation(({ id, body }: { id?: number; body: OpeningRequest }) =>
    id
      ? unwrap(api.PUT("/api/opening-balances/{id}", { params: { path: { id } }, body }))
      : unwrap(api.POST("/api/opening-balances", { body })),
  );

export const usePostOpening = () =>
  useOpeningMutation((id: number) => unwrap(api.POST("/api/opening-balances/{id}/post", { params: { path: { id } } })));

export const useCancelOpening = () =>
  useOpeningMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/opening-balances/{id}/cancel", { params: { path: { id } }, body: { reason } })),
  );

export async function uploadOpening(id: number, file: File, apply: boolean): Promise<OpeningImportResult> {
  await ensureCsrf();
  return unwrap(
    api.POST("/api/opening-balances/{id}/import", {
      params: { path: { id }, query: { apply } },
      // Fayl multipart sifatida yuboriladi; sxemadagi `file` maydoni — ikkilik.
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const fd = new FormData();
        fd.append("file", file);
        return fd;
      },
    }),
  );
}

/** Muharrirdagi qator (qiymatlar foydalanuvchi kiritganidek — saqlashda tekshiriladi). */
export interface DraftLine {
  productId: number;
  productCode: string;
  productName: string;
  zoneId: number;
  batchNumber: string;
  producedOn: string;
  expiryDate: string;
  cost: string;
  bonus: boolean;
  qty: string;
}

/** Summa (tannarx × soni) — satr pul, float ishlatilmaydi: tiyinlarda BigInt. */
export function lineTotal(cost: string, qty: number): bigint {
  const [whole, frac = ""] = cost.split(".");
  const tiyin = BigInt(whole || "0") * 100n + BigInt((frac + "00").slice(0, 2));
  return tiyin * BigInt(qty);
}

/** Tiyindan pul satriga: 143255250n → «1432552.50». */
export function tiyinToMoney(t: bigint): string {
  const s = t.toString().padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** Bir hujjatda (mahsulot, partiya, zona, bonus) takrorlanmaydi — serverdagi qoida bilan bir xil. */
export function duplicateKey(l: Pick<DraftLine, "productId" | "batchNumber" | "zoneId" | "bonus">): string {
  return `${l.productId}|${l.batchNumber.trim().toUpperCase()}|${l.bonus}|${l.zoneId}`;
}
