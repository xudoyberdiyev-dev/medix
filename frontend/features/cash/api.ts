import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type CashOp = components["schemas"]["CashOp"];
export type CashOpStatus = CashOp["status"];
export type Transfer = components["schemas"]["Transfer"];
export type Statement = components["schemas"]["Statement"];
export type Move = components["schemas"]["Move"];
export type ClosePreview = components["schemas"]["ClosePreview"];
export type DayClose = components["schemas"]["DayClose"];

export const CASH_IO = "cash.io";
export const CASH_APPROVE = "cash.approve";
export const CASH_CANCEL = "cash.cancel";
export const CASH_CLOSE = "cash.close";
export const CASH_CLOSE_DIFF = "cash.closeDiff";

/** Kassadan shu summadan katta chiqim Filial rahbari tasdigʻini talab qiladi (SPEC 5.5). */
export const APPROVAL_LIMIT = "2000000.00";

export const OP_STATUS: Record<CashOpStatus, string> = {
  PENDING: "Tasdiqlashda",
  POSTED: "Oʻtkazilgan",
  REJECTED: "Rad etilgan",
  CANCELLED: "Bekor qilingan",
};

export const DOC_TITLE: Record<string, string> = {
  MT: "Mijozdan toʻlov",
  YT: "Yetkazib beruvchiga toʻlov",
  KO: "Kassa operatsiyasi",
  BO: "Bank operatsiyasi",
  IO: "Oʻtkazma",
  FIO: "Filiallararo toʻlov",
};

export function useCashOps(branchId: number | null, status: CashOpStatus | null) {
  return useQuery({
    queryKey: ["cash-ops", branchId, status],
    queryFn: () => unwrap(api.GET("/api/cash-ops", { params: { query: { branchId: branchId as number, status: status ?? undefined } } })),
    enabled: branchId != null,
  });
}

export function useTransfers(branchId: number | null) {
  return useQuery({
    queryKey: ["money-transfers", branchId],
    queryFn: () => unwrap(api.GET("/api/money-transfers", { params: { query: { branchId: branchId as number } } })),
    enabled: branchId != null,
  });
}

export function useStatement(accountId: number | null, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ["money-accounts", "statement", accountId, from, to],
    queryFn: () =>
      unwrap(
        api.GET("/api/money-accounts/{id}/statement", {
          params: { path: { id: accountId as number }, query: { from: from ?? undefined, to: to ?? undefined } },
        }),
      ),
    enabled: accountId != null,
  });
}

export function useClosePreview(accountId: number | null, date: string | null) {
  return useQuery({
    queryKey: ["cash-close", "preview", accountId, date],
    queryFn: () =>
      unwrap(api.GET("/api/cash-close/preview", { params: { query: { accountId: accountId as number, date: date ?? undefined } } })),
    enabled: accountId != null,
  });
}

export function useDayCloses(branchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["cash-close", "list", branchId],
    queryFn: () => unwrap(api.GET("/api/cash-close", { params: { query: { branchId: branchId as number } } })),
    enabled: enabled && branchId != null,
  });
}

// ===== Pul hisobi tiyinlarda (float yoʻq) =====

export function toCents(s: string): bigint {
  const t = s.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return 0n;
  const [i, f = ""] = t.split(".");
  const neg = i.startsWith("-");
  const v = BigInt(neg ? i.slice(1) : i) * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -v : v;
}

export function fromCents(v: bigint): string {
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${a.slice(0, -2)}.${a.slice(-2)}`;
}

/** Kupyuralar sanogʻi: Σ nominal × soni + mayda pul. Natija — kanonik satr («1350000.00»). */
export function countedTotal(counts: Record<number, string>, coins: string): string {
  let total = toCents(coins || "0");
  for (const [nominal, count] of Object.entries(counts)) {
    const n = /^\d+$/.test(count.trim()) ? BigInt(count.trim()) : 0n;
    total += BigInt(nominal) * 100n * n;
  }
  return fromCents(total);
}

export function isOverApprovalLimit(amount: string): boolean {
  return toCents(amount) > toCents(APPROVAL_LIMIT);
}

type AccountLike = { id: number; kind: "CASH" | "TERMINAL" | "BANK"; active: boolean; cashierId?: number };

/**
 * Kassir faqat oʻz kassasida (SPEC 3, 13; backend `CashierGuard` bilan bir xil): biriktirilgan kassa — faqat oʻz kassiriga;
 * filialda kassasi bor xodim biriktirilmagan kassani ham ishlatmaydi; nazoratchi (cash.approve) — hammasini. Terminal va bank — cheklanmaydi.
 */
export function usableAccount(account: AccountLike, all: AccountLike[], meId: number | undefined, supervisor: boolean): boolean {
  if (account.kind !== "CASH" || supervisor) return true;
  if (account.cashierId != null) return account.cashierId === meId;
  return !all.some((a) => a.kind === "CASH" && a.active && a.cashierId != null && a.cashierId === meId);
}

export function useCashierOptions(branchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["money-accounts", "cashier-options", branchId],
    queryFn: () => unwrap(api.GET("/api/money-accounts/cashier-options", { params: { query: { branchId: branchId as number } } })),
    enabled: enabled && branchId != null,
  });
}
