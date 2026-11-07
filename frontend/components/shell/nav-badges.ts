"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type NavBadge = components["schemas"]["Badge"];

/** Sidebar nishonlari (prototip navBadges): son 0 boʻlsa koʻrsatilmaydi; har daqiqada va real vaqt hodisasida yangilanadi. */
export function useNavBadges(branchId: number | null | undefined): Partial<Record<string, NavBadge | null>> {
  const q = useQuery({
    queryKey: ["nav-badges", branchId ?? null],
    queryFn: () => unwrap(api.GET("/api/nav/badges", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: branchId !== undefined,
    refetchInterval: 60_000,
  });
  return badgeMap(q.data);
}

/** Menyu kaliti → nishon: buyurtmalar (tasdiq kutmoqda), joʻnatish (tayyor), muddat nazorati (yaqin / oʻtgan — qizil). */
export function badgeMap(d: components["schemas"]["NavBadgesView"] | undefined): Partial<Record<string, NavBadge | null>> {
  if (!d) return {};
  const keep = (b: NavBadge | undefined | null) => (b && b.count > 0 ? b : null);
  return { orders: keep(d.orders), shipments: keep(d.shipments), expiry: keep(d.expiry) };
}
