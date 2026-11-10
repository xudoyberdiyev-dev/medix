"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";

export interface Thresholds {
  expiryWarnDays: number;
  priceWarnPct: number;
  limitBranchPct: number;
  overdueDirDays: number;
  /** Amaldagi QQS stavkasi (%), masalan «12» — yangi mahsulot standarti. */
  vatRate: string;
}

/** Standart qiymatlar (V72) — server javobi kelguncha. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  expiryWarnDays: 90,
  priceWarnPct: 20,
  limitBranchPct: 20,
  overdueDirDays: 30,
  vatRate: "12",
};

/** Sozlamalardagi interfeys chegaralari (Muddat ogohlantirishi, Narx oʻzgarishi ogohlantirishi, tasdiq chegaralari). */
export function useThresholds(): Thresholds {
  return useThresholdsState().value;
}

/** Chegaralar va yuklanish holati (`ready` — server javobi keldi yoki xato boʻldi). */
export function useThresholdsState(): { value: Thresholds; ready: boolean } {
  const q = useQuery({
    queryKey: ["settings-thresholds"],
    queryFn: () => unwrap(api.GET("/api/settings/thresholds")),
    staleTime: 5 * 60_000,
  });
  if (!q.data) return { value: DEFAULT_THRESHOLDS, ready: !q.isPending };
  const value: Thresholds = {
    expiryWarnDays: q.data.expiryWarnDays,
    priceWarnPct: Number(q.data.priceWarnPct),
    limitBranchPct: Number(q.data.limitBranchPct),
    overdueDirDays: q.data.overdueDirDays,
    vatRate: q.data.vatRate,
  };
  return { value, ready: true };
}
