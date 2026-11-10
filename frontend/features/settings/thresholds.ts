"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";

export interface Thresholds {
  expiryWarnDays: number;
  priceWarnPct: number;
  limitBranchPct: number;
  overdueDirDays: number;
}

/** Standart qiymatlar (V72) — server javobi kelguncha. */
export const DEFAULT_THRESHOLDS: Thresholds = { expiryWarnDays: 90, priceWarnPct: 20, limitBranchPct: 20, overdueDirDays: 30 };

/** Sozlamalardagi interfeys chegaralari (Muddat ogohlantirishi, Narx oʻzgarishi ogohlantirishi, tasdiq chegaralari). */
export function useThresholds(): Thresholds {
  const q = useQuery({
    queryKey: ["settings-thresholds"],
    queryFn: () => unwrap(api.GET("/api/settings/thresholds")),
    staleTime: 5 * 60_000,
  });
  if (!q.data) return DEFAULT_THRESHOLDS;
  return {
    expiryWarnDays: q.data.expiryWarnDays,
    priceWarnPct: Number(q.data.priceWarnPct),
    limitBranchPct: Number(q.data.limitBranchPct),
    overdueDirDays: q.data.overdueDirDays,
  };
}
