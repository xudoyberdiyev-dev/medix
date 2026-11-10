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
