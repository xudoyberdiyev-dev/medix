/**
 * «Narx oʻrnatish» sahifasi mantiqi (prototip `Prices` → set, «Mahsulot boʻyicha»). Pul — butun tiyin (BigInt), float yoʻq;
 * foiz faqat koʻrsatish uchun son.
 */
import { normalizeSearch } from "@/lib/search";

/** Katta oʻzgarish chegarasi, % (SPEC 6: 20% dan koʻp — ogohlantirish). */
export const BIG_CHANGE_PCT = 20;
export const ROUND_STEPS = [0, 100, 500, 1000] as const;
export type RoundStep = (typeof ROUND_STEPS)[number];
export type SetView = "all" | "noPrice" | "changed" | "below" | "big";
export const SET_VIEWS: SetView[] = ["all", "noPrice", "changed", "below", "big"];
export type MarkupRel = "avg" | "last" | "base";

export interface GridRowLike {
  productId: number;
  code: string;
  name: string;
  manufacturer?: string | null;
  country?: string | null;
  category?: string | null;
  supplyEmployee?: string | null;
  searchText: string;
  vatRate: string;
  currentPrice?: string | null;
  basePrice?: string | null;
  avgCost?: string | null;
  lastCost?: string | null;
  costLimit?: string | null;
}

/** "1250.5" → 125050n; notoʻgʻri — null. */
export function toCents(s: string | null | undefined): bigint | null {
  if (s == null) return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

/** 125050n → "1250.50" */
export function fromCents(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

/** Yuqoriga yaxlitlash: qadam soʻmda (100 → 100 soʻmga karrali). 0 — oʻzgarmaydi. */
export function roundUp(cents: bigint, step: RoundStep): bigint {
  if (!step) return cents;
  const s = BigInt(step) * 100n;
  return ((cents + s - 1n) / s) * s;
}

/** Foiz satri: «+25», «−5», «12,5» → yuzdan bir birlikda (2500n, −500n, 1250n); notoʻgʻri — null. */
export function parsePercent(input: string): bigint | null {
  const t = input.replace(/\s/g, "").replace("−", "-").replace(",", ".");
  const m = /^([+-]?)(\d{1,4})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const v = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  const signed = m[1] === "-" ? -v : v;
  return signed <= -10000n ? null : signed;
}

/** HALF_UP boʻlish (musbat sonlar uchun). */
function divHalfUp(a: bigint, b: bigint): bigint {
  return (a * 2n + b) / (2n * b);
}

/** Asos × (1 + foiz) — tiyingacha HALF_UP (E4), keyin tanlangan qadamga yuqoriga. */
export function applyMarkup(baseCents: bigint, pctHundredths: bigint, step: RoundStep): bigint {
  return roundUp(divHalfUp(baseCents * (10000n + pctHundredths), 10000n), step);
}

/** QQSsiz narx: narx / (1 + stavka). */
export function withoutVat(cents: bigint, vatRate: string): bigint {
  const r = toCents(vatRate);
  if (r == null) return cents;
  return divHalfUp(cents * 10000n, 10000n + r);
}

/** Foiz farqi (koʻrsatish): (yangi − eski) / eski × 100, bir xona aniqlikda. */
export function pctDiff(next: bigint, prev: bigint): number | null {
  if (prev <= 0n) return null;
  return Number(((next - prev) * 10000n) / prev) / 100;
}

/** «+12,5%», «−3%», «—». */
export function formatPct(v: number | null): string {
  if (v == null) return "—";
  const r = Math.round(Math.abs(v) * 10) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${String(r).replace(".", ",")}%`;
}

export interface RowState {
  /** Yangi narx (normallashgan "1250.00") — kiritilgan va toʻgʻri boʻlsa. */
  next: string | null;
  bad: boolean;
  changed: boolean;
  chg: number | null;
  /** Ustama — oʻrtacha kirim narxiga nisbatan (yangi yoki joriy narx). */
  markup: number | null;
  below: boolean;
  big: boolean;
}

/** Qator holati: kiritilgan qiymat (satr, foydalanuvchi koʻrinishida) va server qatoriga qarab. */
export function rowState(row: GridRowLike, raw: string | undefined, parse: (s: string) => string | undefined | null): RowState {
  const parsed = raw == null || raw.trim() === "" ? undefined : parse(raw);
  const nv = parsed ? toCents(parsed) : null;
  const valid = nv != null && nv > 0n;
  const bad = parsed === null || (parsed !== undefined && !valid);
  const cur = toCents(row.currentPrice);
  const changed = valid && (cur == null || nv !== cur);
  const chg = changed && cur != null ? pctDiff(nv, cur) : null;
  const eff = valid ? nv : cur;
  const avg = toCents(row.avgCost);
  const markup = eff != null && avg != null && avg > 0n ? pctDiff(eff, avg) : null;
  const limit = toCents(row.costLimit);
  const below = changed && limit != null && nv < limit;
  const big = chg != null && Math.abs(chg) > BIG_CHANGE_PCT;
  return { next: valid ? fromCents(nv) : null, bad, changed, chg, markup, below, big };
}

export const VIEW_TEST: Record<SetView, (r: GridRowLike, s: RowState) => boolean> = {
  all: () => true,
  noPrice: (r) => !r.currentPrice,
  changed: (_, s) => s.changed,
  below: (_, s) => s.below,
  big: (_, s) => s.big,
};

export interface SetFilter {
  q: string;
  makers: string[];
  categories: string[];
  countries: string[];
  supply: string[];
}

export const EMPTY_SET_FILTER: SetFilter = { q: "", makers: [], categories: [], countries: [], supply: [] };

/** Qidiruv (kod, nom, IKPU, Farm ID, shtrix-kod — `searchText`; lotin/kirill farqsiz) va chiplar. */
export function matchesFilter(r: GridRowLike, f: SetFilter): boolean {
  const q = normalizeSearch(f.q);
  if (q) {
    const hay = `${r.code} ${normalizeSearch(r.name)} ${r.searchText}`;
    if (!q.split(" ").every((w) => hay.includes(w))) return false;
  }
  const inList = (list: string[], v: string | null | undefined) => !list.length || list.includes(v ?? "—");
  return (
    inList(f.makers, r.manufacturer) &&
    inList(f.categories, r.category) &&
    inList(f.countries, r.country) &&
    inList(f.supply, r.supplyEmployee)
  );
}

/** Ustama asosi: oʻrtacha / oxirgi kirim narxi yoki bazaviy narx. */
export function markupBase(r: GridRowLike, rel: MarkupRel): bigint | null {
  const v = toCents(rel === "avg" ? r.avgCost : rel === "last" ? r.lastCost : r.basePrice);
  return v != null && v > 0n ? v : null;
}

/** "1250.50" → kiritish maydoni koʻrinishi «1250,50» (butun boʻlsa — «1250»). */
export function toInput(v: string): string {
  return v.endsWith(".00") ? v.slice(0, -3) : v.replace(".", ",");
}
