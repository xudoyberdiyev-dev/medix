// «Toʻlovlar» roʻyxati (prototip `Payments`): MT + YT bitta jadvalda; kartalar, koʻrinishlar, filtrlar, jamilar — brauzerda.
// Sof funksiyalar, float yoʻq: pul satri butun tiyinga (BigInt) aylantiriladi.
import { matchesSearch } from "@/lib/search";

export type PayKind = "MT" | "YT";
export type PayStatus = "DRAFT" | "PENDING" | "POSTED" | "CANCELLED";
export type AccountKind = "CASH" | "TERMINAL" | "BANK";

/** OpenAPI `PaymentOverviewRow` ning roʻyxatga kerakli qismi (testlar uchun mustaqil). */
export interface PayRowLike {
  kind: PayKind;
  id: number;
  number: string;
  paymentDate: string;
  party: string;
  partySub?: string | null;
  accountId: number;
  account: string;
  accountKind: string;
  amount: string;
  allocated?: string | null;
  advance?: string | null;
  status: PayStatus;
  createdBy: string;
  createdAt: string;
}

export const PAY_VIEWS = ["all", "in", "out", "pending", "cancelled"] as const;
export type PayView = (typeof PAY_VIEWS)[number];
export const PAY_STATUSES: PayStatus[] = ["DRAFT", "PENDING", "POSTED", "CANCELLED"];
export const ACCOUNT_KINDS: AccountKind[] = ["CASH", "BANK", "TERMINAL"];
export const PAY_PAGE_SIZES = [25, 50, 100] as const;

export interface PayFilters {
  view: PayView;
  q: string;
  parties: string[];
  methods: string[];
  accounts: number[];
  statuses: PayStatus[];
  by: string[];
  from: string | null;
  to: string | null;
  page: number;
  size: number;
}

export const EMPTY_FILTERS: PayFilters = {
  view: "all",
  q: "",
  parties: [],
  methods: [],
  accounts: [],
  statuses: [],
  by: [],
  from: null,
  to: null,
  page: 1,
  size: 25,
};

/** URL'dan boshlangʻich holat: `?tab=yt` (eski havolalar), `?kind=mt|yt`, `?status=pending|cancelled|draft|posted`, `?from=&to=`, `?q=`. */
export function filtersFromParams(get: (k: string) => string | null): PayFilters {
  const kind = (get("kind") ?? get("tab") ?? "").toLowerCase();
  const status = (get("status") ?? "").toUpperCase();
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = iso(get("from"));
  const view: PayView =
    status === "PENDING" ? "pending" : status === "CANCELLED" ? "cancelled" : kind === "mt" ? "in" : kind === "yt" ? "out" : "all";
  return {
    ...EMPTY_FILTERS,
    view,
    q: get("q") ?? "",
    statuses: status === "DRAFT" || status === "POSTED" ? [status] : [],
    from,
    to: from ? (iso(get("to")) ?? from) : null,
  };
}

const inView = (view: PayView, r: PayRowLike) =>
  view === "all" ||
  (view === "in" && r.kind === "MT") ||
  (view === "out" && r.kind === "YT") ||
  (view === "pending" && r.status === "PENDING") ||
  (view === "cancelled" && r.status === "CANCELLED");

export function matches(r: PayRowLike, f: PayFilters): boolean {
  if (!inView(f.view, r)) return false;
  if (f.q.trim() && !matchesSearch(f.q, [r.number, r.party, r.partySub])) return false;
  if (f.parties.length && !f.parties.includes(r.party)) return false;
  if (f.methods.length && !f.methods.includes(r.accountKind)) return false;
  if (f.accounts.length && !f.accounts.includes(r.accountId)) return false;
  if (f.statuses.length && !f.statuses.includes(r.status)) return false;
  if (f.by.length && !f.by.includes(r.createdBy)) return false;
  if (f.from && r.paymentDate < f.from) return false;
  if (f.to && r.paymentDate > f.to) return false;
  return true;
}

/** Saralash: sana (yangisi yuqorida), soʻng yaratilgan vaqt. */
export function filterRows<T extends PayRowLike>(rows: T[], f: PayFilters): T[] {
  return rows
    .filter((r) => matches(r, f))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export function viewCounts(rows: PayRowLike[]): Record<PayView, number> {
  const out = { all: 0, in: 0, out: 0, pending: 0, cancelled: 0 };
  for (const r of rows) for (const v of PAY_VIEWS) if (inView(v, r)) out[v] += 1;
  return out;
}

export function cents(s: string): bigint {
  const neg = s.startsWith("-");
  const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
  const v = BigInt(i || "0") * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -v : v;
}

export function fromCents(v: bigint): string {
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${a.slice(0, -2)}.${a.slice(-2)}`;
}

const sum = (rows: PayRowLike[]) => fromCents(rows.reduce((t, r) => t + cents(r.amount), 0n));

export interface PayKpis {
  inToday: { sum: string; count: number };
  outToday: { sum: string; count: number };
  pending: { sum: string; count: number };
  drafts: { sum: string; count: number };
}

/** Kartalar: bugungi tasdiqlangan kirim (MT) / chiqim (YT), tasdiqlashda, qoralamalar. */
export function kpis(rows: PayRowLike[], today: string): PayKpis {
  const posted = rows.filter((r) => r.status === "POSTED" && r.paymentDate === today);
  const pick = (list: PayRowLike[]) => ({ sum: sum(list), count: list.length });
  return {
    inToday: pick(posted.filter((r) => r.kind === "MT")),
    outToday: pick(posted.filter((r) => r.kind === "YT")),
    pending: pick(rows.filter((r) => r.status === "PENDING")),
    drafts: pick(rows.filter((r) => r.status === "DRAFT")),
  };
}

/** Pastki jamilar — filtrdagi tasdiqlangan toʻlovlar: kirim, chiqim (manfiy), sof. */
export function totals(rows: PayRowLike[]): { in: string; out: string; net: string } {
  const posted = rows.filter((r) => r.status === "POSTED");
  const tin = posted.filter((r) => r.kind === "MT").reduce((t, r) => t + cents(r.amount), 0n);
  const tout = posted.filter((r) => r.kind === "YT").reduce((t, r) => t + cents(r.amount), 0n);
  return { in: fromCents(tin), out: fromCents(-tout), net: fromCents(tin - tout) };
}

/** Avans ustuni: tasdiqlangan (bekor qilinmagan) va avansi > 0 boʻlsa. */
export function advanceOf(r: PayRowLike): string | null {
  if (r.status !== "POSTED" || !r.advance) return null;
  return cents(r.advance) > 0n ? r.advance : null;
}

/** Filtr variantlari: qiymat + nechta qatorda uchraydi (roʻyxat boʻyicha, koʻrinishdan qatʼi nazar). */
export function facet<V extends string | number>(rows: PayRowLike[], key: (r: PayRowLike) => V, label: (r: PayRowLike) => string) {
  const map = new Map<V, { value: V; label: string; count: number }>();
  for (const r of rows) {
    const k = key(r);
    const cur = map.get(k);
    if (cur) cur.count += 1;
    else map.set(k, { value: k, label: label(r), count: 1 });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function hasFilters(f: PayFilters): boolean {
  return !!(f.q.trim() || f.parties.length || f.methods.length || f.accounts.length || f.statuses.length || f.by.length || f.from);
}
