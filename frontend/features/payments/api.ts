import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type PaymentSummary = components["schemas"]["PaymentSummary"];
export type PaymentDetail = components["schemas"]["PaymentDetail"];
export type PaymentStatus = PaymentSummary["status"];
export type OpenDocs = components["schemas"]["OpenDocs"];
export type OpenDoc = components["schemas"]["OpenDocView"];
export type MoneyAccount = components["schemas"]["Account"];
export type DriverCash = components["schemas"]["DriverCash"];

export const PAYMENT_MT = "payments.mt";
export const PAYMENT_CANCEL = "payments.cancel";

export const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  DRAFT: "Qoralama",
  POSTED: "Oʻtkazilgan",
  CANCELLED: "Bekor qilingan",
};

export const ACCOUNT_KIND: Record<MoneyAccount["kind"], string> = { CASH: "Kassa", TERMINAL: "Terminal", BANK: "Bank" };

export function usePayments(branchId: number | null, status: PaymentStatus | null, enabled: boolean) {
  return useQuery({
    queryKey: ["payments", "customer", branchId, status],
    queryFn: () =>
      unwrap(api.GET("/api/payments/customer", { params: { query: { branchId: branchId ?? undefined, status: status ?? undefined } } })),
    enabled,
  });
}

export function usePayment(id: number | null) {
  return useQuery({
    queryKey: ["payments", "customer", "one", id],
    queryFn: () => unwrap(api.GET("/api/payments/customer/{id}", { params: { path: { id: id as number } } })),
    enabled: id != null,
  });
}

export function useOpenDocs(branchId: number | null, customerId: number | null) {
  return useQuery({
    queryKey: ["payments", "open-docs", branchId, customerId],
    queryFn: () =>
      unwrap(
        api.GET("/api/payments/customer/open-docs", {
          params: { query: { branchId: branchId as number, customerId: customerId as number } },
        }),
      ),
    enabled: branchId != null && customerId != null,
  });
}

export function useAccounts(branchId: number | null) {
  return useQuery({
    queryKey: ["money-accounts", branchId],
    queryFn: () => unwrap(api.GET("/api/money-accounts", { params: { query: { branchId: branchId as number } } })),
    enabled: branchId != null,
  });
}

const cents = (s: string) => {
  const [i, f = ""] = s.split(".");
  const neg = i.startsWith("-");
  const v = BigInt(neg ? i.slice(1) : i) * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -v : v;
};
const fromCents = (v: bigint) => {
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${a.slice(0, -2)}.${a.slice(-2)}`;
};

/** Avtomatik taqsimot koʻrinishi (server bilan bir xil qoida): eng eski qarzdan, ortigʻi — avans. Float yoʻq. */
export function fifoPreview(docs: { docType: string; docId: number; open: string }[], amount: string) {
  let left = cents(amount);
  const parts: { key: string; amount: string }[] = [];
  for (const d of docs) {
    if (left <= 0n) break;
    const open = cents(d.open);
    if (open <= 0n) continue;
    const use = left >= open ? open : left;
    parts.push({ key: `${d.docType}:${d.docId}`, amount: fromCents(use) });
    left -= use;
  }
  return { parts, advance: fromCents(left < 0n ? 0n : left) };
}
