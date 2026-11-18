"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type KkSummary = components["schemas"]["ExpectedReceiptSummary"];
export type KkDetail = components["schemas"]["ExpectedReceiptDetail"];
export type KkLine = KkDetail["lines"][number];
export type KkStatus = KkDetail["status"];
export type KkPaymentKind = KkDetail["paymentKind"];
export type KkRequest = components["schemas"]["ExpectedReceiptRequest"];
export type KkReceiveRequest = components["schemas"]["KkReceiveRequest"];
export type InTransitRow = components["schemas"]["InTransitRow"];

/** Ruxsatlar (O15): koʻrish — kk.view, yaratish/tahrirlash — kk.create, tasdiqlash (qarz yoziladi), bekor qilish — kk.approve. */
export const KK_CREATE = "kk.create";
export const KK_APPROVE = "kk.approve";
export const KK_VIEW_KEYS = ["kk.view", KK_CREATE, KK_APPROVE];

/** Holatlar tartibi; nomlari — lugʻatda `expectedReceipts.status.*`. */
export const KK_STATUSES = ["DRAFT", "IN_TRANSIT", "PARTIAL", "RECEIVED", "CANCELLED"] as const satisfies readonly KkStatus[];
export const KK_PAYMENTS = ["CREDIT", "PREPAID", "CASH"] as const satisfies readonly KkPaymentKind[];

export const KK_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const KK_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Yuk xati fayli: PDF/JPG/PNG, ≤ 10 MB. Xato kaliti yoki `null`. */
export function checkKkFile(file: { name: string; type: string; size: number }): "type" | "size" | null {
  const n = file.name.toLowerCase();
  const byName = n.endsWith(".pdf") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png");
  if (!KK_FILE_TYPES.includes(file.type === "image/jpg" ? "image/jpeg" : file.type) && !byName) return "type";
  if (file.size === 0 || file.size > KK_MAX_FILE_BYTES) return "size";
  return null;
}

/** Qatorlar jami (narx — «12500.50» satr, tiyinlarda hisoblanadi): narxsiz qator boʻlsa `missing`. */
export function kkTotal(lines: { qty: number; price: string | null | undefined }[]): { cents: bigint; missing: boolean } {
  let cents = 0n;
  let missing = false;
  for (const l of lines) {
    const p = (l.price ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(p)) {
      missing = true;
      continue;
    }
    const [i, f = ""] = p.split(".");
    cents += (BigInt(i) * 100n + BigInt((f + "00").slice(0, 2))) * BigInt(l.qty);
  }
  return { cents, missing };
}

export function centsToMoney(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

/** Qabul qilish formasi uchun: qolgan soni boʻlgan qatorlar. */
export function receivableLines(lines: KkLine[]): KkLine[] {
  return lines.filter((l) => l.remainingQty > 0);
}

/** Yoʻldagi tovar matni: «Yoʻlda: 500 (kutilmoqda 21.11)». */
export function inTransitOf(rows: InTransitRow[] | undefined, productId: number): InTransitRow | undefined {
  return rows?.find((r) => r.productId === productId);
}

export interface KkFilter {
  branchId: number | null;
  status: KkStatus | null;
  open: boolean;
  late: boolean;
  page: number;
}

export function useExpectedReceipts(f: KkFilter, enabled = true) {
  return useQuery({
    queryKey: ["expected-receipts", "list", f],
    queryFn: () =>
      unwrap(
        api.GET("/api/expected-receipts", {
          params: {
            query: {
              branchId: f.branchId ?? undefined,
              status: f.status ?? undefined,
              open: f.open || undefined,
              late: f.late || undefined,
              page: f.page - 1,
              size: 50,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useExpectedReceipt(id: number | null) {
  return useQuery({
    queryKey: ["expected-receipts", "one", id],
    queryFn: () => unwrap(api.GET("/api/expected-receipts/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

/** Yoʻldagi tovar (KK Yoʻlda / Qisman) — mahsulotlar boʻyicha; sotuvga olinmaydi. */
export function useInTransit(productIds: number[] | null, enabled = true, branchId: number | null = null) {
  const ids = productIds ? [...new Set(productIds)].sort((a, b) => a - b).slice(0, 500) : null;
  return useQuery({
    queryKey: ["expected-receipts", "in-transit", ids, branchId],
    queryFn: () =>
      unwrap(
        api.GET("/api/expected-receipts/in-transit", {
          params: { query: { productId: ids ?? undefined, branchId: branchId ?? undefined } },
        }),
      ),
    enabled: enabled && (ids === null || ids.length > 0),
    staleTime: 60_000,
  });
}

function useKkMutation<T>(fn: (v: T) => Promise<KkDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["expected-receipts", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["expected-receipts"] });
      await qc.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

export function useSaveExpectedReceipt() {
  return useKkMutation(({ id, body }: { id?: number; body: KkRequest }) =>
    id
      ? unwrap(api.PUT("/api/expected-receipts/{id}", { params: { path: { id } }, body }))
      : unwrap(api.POST("/api/expected-receipts", { body })),
  );
}

export function useApproveExpectedReceipt() {
  return useKkMutation((id: number) => unwrap(api.POST("/api/expected-receipts/{id}/approve", { params: { path: { id } } })));
}

export function useCancelExpectedReceipt() {
  return useKkMutation((v: { id: number; reason: string }) =>
    unwrap(api.POST("/api/expected-receipts/{id}/cancel", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
  );
}

export function useCloseExpectedReceipt() {
  return useKkMutation((v: { id: number; reason: string }) =>
    unwrap(api.POST("/api/expected-receipts/{id}/close", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
  );
}

export function useReceiveExpectedReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: number; body: KkReceiveRequest }) => {
      await ensureCsrf();
      return unwrap(api.POST("/api/expected-receipts/{id}/receive", { params: { path: { id: v.id } }, body: v.body }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["expected-receipts"] });
      await qc.invalidateQueries({ queryKey: ["receipts", "list"] });
    },
  });
}

export function useUploadKkFile() {
  return useKkMutation(async ({ id, file }: { id: number; file: File }) =>
    unwrap(
      api.POST("/api/expected-receipts/{id}/files", {
        params: { path: { id } },
        body: { file: file as unknown as string },
        bodySerializer: () => {
          const fd = new FormData();
          fd.append("file", file);
          return fd;
        },
      }),
    ),
  );
}

export const kkFileUrl = (fileId: number) => `/api/expected-receipts/files/${fileId}`;
