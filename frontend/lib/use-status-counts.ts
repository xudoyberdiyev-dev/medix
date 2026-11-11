"use client";

import { useQueries } from "@tanstack/react-query";

/**
 * Roʻyxat yorliqlari soni (prototip: «Hammasi 7 · Qoralama 2 …»): har holat uchun `size=1` soʻrovi — faqat `total` olinadi.
 * `fetchTotal(null)` — barcha holatlar.
 */
export function useStatusCounts<S extends string>(
  key: readonly unknown[],
  statuses: readonly S[],
  fetchTotal: (status: S | null) => Promise<number>,
  enabled = true,
): { all: number | undefined; of: (s: S) => number | undefined } {
  const keys: (S | null)[] = [null, ...statuses];
  const results = useQueries({
    queries: keys.map((s) => ({
      queryKey: [...key, "count", s ?? "all"],
      queryFn: () => fetchTotal(s),
      enabled,
      staleTime: 15_000,
    })),
  });
  return {
    all: results[0]?.data,
    of: (s: S) => results[keys.indexOf(s)]?.data,
  };
}

/** Joriy sahifa ichida matnli qidiruv (API `q` qabul qilmaydigan roʻyxatlar uchun). */
export function matchesQuery(q: string, values: readonly (string | null | undefined)[]): boolean {
  const s = q.trim().toLocaleLowerCase();
  if (!s) return true;
  return values.some((v) => (v ?? "").toLocaleLowerCase().includes(s));
}
