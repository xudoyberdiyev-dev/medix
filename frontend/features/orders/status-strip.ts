/**
 * U5: buyurtma holatlari — ixcham chiziq. «Hammasi», tanlangan holat va soni bor holatlar koʻrinadi
 * (koʻpi bilan `max` ta, soni koʻplari); qolganlari — «Yana» menyusida (prototip tartibi saqlanadi).
 */
export interface StripCount {
  status?: string | null;
  count: number;
}

export function splitStatuses<T extends StripCount>(counts: T[], value: string, all: string, max = 7): { shown: T[]; more: T[] } {
  const key = (c: T) => c.status ?? all;
  const rest = counts.filter((c) => key(c) !== all);
  const head = counts.filter((c) => key(c) === all);
  const nonZero = rest.filter((c) => c.count > 0 || key(c) === value);
  // Soni koʻplari ustun; tanlangan holat doim koʻrinadi
  const keep = new Set(
    [...nonZero]
      .sort((a, b) => Number(key(b) === value) - Number(key(a) === value) || b.count - a.count)
      .slice(0, max)
      .map(key),
  );
  return { shown: [...head, ...rest.filter((c) => keep.has(key(c)))], more: rest.filter((c) => !keep.has(key(c))) };
}

/** U5: tayyor koʻrinishlar — «Mening», «Bugun», «Kechikkanlar» (foydalanuvchi oʻzinikini «Koʻrinishlar»da saqlaydi). */
export const QUICK_VIEWS = ["mine", "today", "overdue"] as const;
export type QuickView = (typeof QUICK_VIEWS)[number];

interface QuickFilters {
  mine: boolean;
  overdue: boolean;
  orderFrom: string | null;
  orderTo: string | null;
}

export function quickOn(v: QuickView, f: QuickFilters, today: string): boolean {
  if (v === "mine") return f.mine;
  if (v === "overdue") return f.overdue;
  return f.orderFrom === today && f.orderTo === today;
}

/** Bosilganda: yoqiladi yoki (yoqilgan boʻlsa) oʻchiriladi. */
export function quickPatch(v: QuickView, on: boolean, today: string): Partial<QuickFilters> {
  if (v === "mine") return { mine: !on };
  if (v === "overdue") return { overdue: !on };
  return on ? { orderFrom: null, orderTo: null } : { orderFrom: today, orderTo: today };
}
