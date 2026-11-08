import { formatDate } from "./format";

/** Tarix yozuvlari Toshkent kuni boʻyicha (kk.oo.yyyy), tartib saqlanadi. */
export function groupByDay<T extends { at: string }>(items: T[]): { day: string; items: T[] }[] {
  const out: { day: string; items: T[] }[] = [];
  for (const it of items) {
    const d = formatDate(new Date(it.at));
    const last = out[out.length - 1];
    if (last && last.day === d) last.items.push(it);
    else out.push({ day: d, items: [it] });
  }
  return out;
}
