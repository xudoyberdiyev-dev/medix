"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type CounterpartyRow = components["schemas"]["CounterpartyRow"];
export type CounterpartyDetail = components["schemas"]["CounterpartyDetail"];
export type CounterpartyRequest = components["schemas"]["CounterpartyRequest"];
export type License = components["schemas"]["License"];
export type Contract = components["schemas"]["Contract"];
export type Terms = components["schemas"]["Terms"];
export type TermsRequest = components["schemas"]["TermsRequest"];
export type CounterpartyRole = "CUSTOMER" | "SUPPLIER";
export type CounterpartyStatus = "ACTIVE" | "BLOCKED" | "INACTIVE" | "ALL";

/** Ruxsatlar matritsasi (1.3) kelguncha — rol boʻyicha (server ham tekshiradi). */
export const CARD_EDITORS = ["DIRECTOR", "ADMIN", "BRANCH_MANAGER", "ACCOUNTANT", "PURCHASER"];
export const TERMS_EDITORS = ["DIRECTOR", "ADMIN", "BRANCH_MANAGER"];
export const BLOCKERS = ["DIRECTOR", "ADMIN", "BRANCH_MANAGER", "ACCOUNTANT"];

export const PAYMENT_TYPES = [
  { value: "TRANSFER", label: "Perechisleniye" },
  { value: "CASH", label: "Naqd" },
  { value: "ONLINE", label: "Online" },
];

const KEY = ["counterparties"] as const;

export interface CounterpartyQuery {
  q: string;
  role: CounterpartyRole;
  status: CounterpartyStatus;
  regionId: number | null;
  page: number;
  size: 25 | 50 | 100;
}

export function useCounterparties(f: CounterpartyQuery) {
  return useQuery({
    queryKey: [...KEY, "list", f],
    queryFn: () =>
      unwrap(
        api.GET("/api/counterparties", {
          params: {
            query: {
              q: f.q.trim() || undefined,
              role: f.role,
              status: f.status,
              regionId: f.regionId ?? undefined,
              page: f.page - 1,
              size: f.size,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useCounterparty(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "one", id],
    queryFn: () => unwrap(api.GET("/api/counterparties/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function usePriceTypes() {
  return useQuery({ queryKey: ["price-types"], queryFn: () => unwrap(api.GET("/api/price-types")), staleTime: Infinity });
}

function useCpMutation<T>(fn: (v: T) => Promise<CounterpartyDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: (c) => {
      qc.setQueryData([...KEY, "one", c.id], c);
      return qc.invalidateQueries({ queryKey: [...KEY, "list"] });
    },
  });
}

export const useSaveCounterparty = () =>
  useCpMutation(({ id, body }: { id?: number; body: CounterpartyRequest }) =>
    id
      ? unwrap(api.PUT("/api/counterparties/{id}", { params: { path: { id } }, body }))
      : unwrap(api.POST("/api/counterparties", { body })),
  );

export const useBlockCounterparty = () =>
  useCpMutation(({ id, reason }: { id: number; reason: string | null }) =>
    reason === null
      ? unwrap(api.POST("/api/counterparties/{id}/unblock", { params: { path: { id } } }))
      : unwrap(api.POST("/api/counterparties/{id}/block", { params: { path: { id } }, body: { reason } })),
  );

export const useActivateCounterparty = () =>
  useCpMutation(({ id, reason }: { id: number; reason: string | null }) =>
    reason === null
      ? unwrap(api.POST("/api/counterparties/{id}/activate", { params: { path: { id } } }))
      : unwrap(api.POST("/api/counterparties/{id}/deactivate", { params: { path: { id } }, body: { reason } })),
  );

export const useSaveLicense = () =>
  useCpMutation(
    ({
      id,
      licenseId,
      body,
    }: {
      id: number;
      licenseId?: number;
      body: { number: string; kind: string; issuedOn?: string; validUntil?: string; controlledAllowed: boolean };
    }) =>
      licenseId
        ? unwrap(api.PUT("/api/counterparties/{id}/licenses/{licenseId}", { params: { path: { id, licenseId } }, body }))
        : unwrap(api.POST("/api/counterparties/{id}/licenses", { params: { path: { id } }, body })),
  );

export const useSaveContract = () =>
  useCpMutation(
    ({
      id,
      contractId,
      body,
    }: {
      id: number;
      contractId?: number;
      body: { branchId: number; number: string; signedOn?: string; validUntil?: string; note?: string };
    }) =>
      contractId
        ? unwrap(api.PUT("/api/counterparties/{id}/contracts/{contractId}", { params: { path: { id, contractId } }, body }))
        : unwrap(api.POST("/api/counterparties/{id}/contracts", { params: { path: { id } }, body })),
  );

export const useSaveTerms = () =>
  useCpMutation(({ id, branchId, body }: { id: number; branchId: number; body: TermsRequest }) =>
    unwrap(api.PUT("/api/counterparties/{id}/terms/{branchId}", { params: { path: { id, branchId } }, body })),
  );

/** «04.10.2026» ↔ «2026-10-04». Notoʻgʻri sana — `null`. */
export function parseUzDate(input: string): string | undefined | null {
  const t = input.trim();
  if (!t) return undefined;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) || date.getUTCMonth() + 1 !== Number(mo)) return null;
  return `${y}-${mo}-${d}`;
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Litsenziya holati: muddati oʻtgan / 30 kun ichida tugaydi / amal qiladi / yoʻq. */
export function licenseState(validUntil: string | null | undefined, today: string): "none" | "expired" | "expiring" | "valid" {
  if (!validUntil) return "none";
  if (validUntil < today) return "expired";
  const in30 = new Date(`${today}T00:00:00Z`);
  in30.setUTCDate(in30.getUTCDate() + 30);
  return validUntil <= in30.toISOString().slice(0, 10) ? "expiring" : "valid";
}

/** Bugungi sana Toshkent vaqtida (YYYY-MM-DD). */
export function todayTashkent(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(now);
}

/** Summa: «15.000.000» yoki «15000000,50» → «15000000.50»; boʻsh — undefined; xato — null. */
export function parseMoneyInput(input: string): string | undefined | null {
  const t = input.replace(/\s/g, "");
  if (!t) return undefined;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  return /^\d{1,16}(\.\d{1,2})?$/.test(normalized) ? normalized : null;
}
