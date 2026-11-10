import { toCents } from "@/features/home/director-view";

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Oldingi teng davr (prototip rptPrev): [from − N kun, from − 1 kun]. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { from: shift(from, -days), to: shift(from, -1) };
}

function centsToMoney(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

/** Oʻrtacha hujjat summasi (tiyinlarda, yarmi yuqoriga); hujjat yoʻq boʻlsa — null («—»). */
export function averageDoc(net: string, orders: number): string | null {
  if (orders <= 0) return null;
  const c = toCents(net);
  const n = BigInt(orders);
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const q = (abs * 2n + n) / (2n * n);
  return centsToMoney(neg ? -q : q);
}

/** Qaytarish ulushi, % (bir kasr, vergul bilan): savdo nol boʻlsa — «0,0%». */
export function returnShare(returns: string, sales: string): string {
  const s = toCents(sales);
  if (s <= 0n) return "0,0%";
  const r = toCents(returns);
  const q = (r * 2000n + s) / (2n * s);
  return `${q / 10n},${q % 10n}%`;
}

export interface DayBar {
  date: string;
  net: string;
  orders: number;
}

/** Grafik ustunlari: davrdagi har kun (62 kungacha — boʻsh kunlar nol bilan), uzunroq davrda — faqat savdo boʻlgan kunlar. */
export function dayBars(from: string, to: string, rows: readonly { key: string; net: string; orders: number }[]): DayBar[] {
  const byDay = new Map(rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.key)).map((r) => [r.key, r]));
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days < 1 || days > 62) {
    return [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)).map((r) => ({ date: r.key, net: r.net, orders: r.orders }));
  }
  return Array.from({ length: days }, (_, i) => {
    const date = shift(from, i);
    const r = byDay.get(date);
    return { date, net: r?.net ?? "0.00", orders: r?.orders ?? 0 };
  });
}

/** Ustun balandligi ulushi (0–1, modul boʻyicha) — faqat koʻrinish uchun. */
export function barShare(value: string, maxAbs: bigint): number {
  if (maxAbs <= 0n) return 0;
  const c = toCents(value);
  const abs = c < 0n ? -c : c;
  return Number((abs * 10000n) / maxAbs) / 10000;
}

export function maxAbsCents(values: readonly string[]): bigint {
  return values.reduce((m, v) => {
    const c = toCents(v);
    const a = c < 0n ? -c : c;
    return a > m ? a : m;
  }, 0n);
}
