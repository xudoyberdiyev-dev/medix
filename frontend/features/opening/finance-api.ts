"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { parseMoneyInput } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type FinSummary = components["schemas"]["OpeningFinanceSummary"];
export type FinDetail = components["schemas"]["OpeningFinanceDetail"];
export type FinRequest = components["schemas"]["OpeningFinanceRequest"];
export type FinKind = FinDetail["kind"];

export function useFinOpenings(branchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["opening-finance", "list", branchId],
    queryFn: () => unwrap(api.GET("/api/opening-finance", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled,
  });
}

export function useFinOpening(id: number | null) {
  return useQuery({
    queryKey: ["opening-finance", "one", id],
    queryFn: () => unwrap(api.GET("/api/opening-finance/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

function useFinMutation<T>(fn: (v: T) => Promise<FinDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["opening-finance", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["opening-finance", "list"] });
    },
  });
}

export const useSaveFin = () =>
  useFinMutation(({ id, body }: { id?: number; body: FinRequest }) =>
    id
      ? unwrap(api.PUT("/api/opening-finance/{id}", { params: { path: { id } }, body }))
      : unwrap(api.POST("/api/opening-finance", { body })),
  );

export const usePostFin = () =>
  useFinMutation((id: number) => unwrap(api.POST("/api/opening-finance/{id}/post", { params: { path: { id } } })));

export const useCancelFin = () =>
  useFinMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/opening-finance/{id}/cancel", { params: { path: { id } }, body: { reason } })),
  );

/** Muharrirdagi qator: kontragent yoki hisob, summa (foydalanuvchi kiritganidek), muddat, asos hujjat. */
export interface FinDraftLine {
  ref: string | null;
  refLabel: string;
  amount: string;
  dueDate: string | null;
  docRef: string;
}

export const emptyFinLine = (): FinDraftLine => ({ ref: null, refLabel: "", amount: "", dueDate: null, docRef: "" });

/** «-1.250.000,50» → «-1250000.50»; boʻsh — undefined, notoʻgʻri — null. Qarzda manfiy (avans) ruxsat. */
export function parseSignedMoney(input: string): string | undefined | null {
  const t = input.replace(/\s/g, "").replace(/^[−–]/, "-");
  const neg = t.startsWith("-");
  const v = parseMoneyInput(neg ? t.slice(1) : t);
  if (v == null) return v;
  return neg ? `-${v}` : v;
}

export type FinLinesResult =
  { ok: true; lines: FinRequest["lines"] } | { ok: false; error: { key: "needLine" } | { key: "badAmount"; n: number } };

/** Toʻldirilgan qatorlarni soʻrovga aylantiradi (boʻsh qatorlar tashlanadi). */
export function finLinesFrom(kind: FinKind, lines: FinDraftLine[]): FinLinesResult {
  const out: FinRequest["lines"] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.ref && !l.amount.trim()) continue;
    const amount = parseSignedMoney(l.amount);
    if (!amount || !l.ref) return { ok: false, error: { key: "badAmount", n: i + 1 } };
    const id = Number(l.ref);
    out.push(
      kind === "MONEY"
        ? { accountId: id, amount }
        : { counterpartyId: id, amount, dueDate: l.dueDate ?? undefined, docRef: l.docRef.trim() || undefined },
    );
  }
  return out.length ? { ok: true, lines: out } : { ok: false, error: { key: "needLine" } };
}
