// «Mijozlar» / «Yetkazib beruvchilar» ro'yxati (prototip Counterparties): ko'rinishlar, filtrlar, sanoqlar va saralash brauzerda.
// Sof funksiyalar — float yo'q: pul satrini butun tiyinga (BigInt) aylantirib solishtiramiz.

export type OverviewKind = "PHARMACY" | "CLINIC" | "HOSPITAL" | "DISTRIBUTOR" | "MAKER";
export type OverviewStatus = "ACTIVE" | "BLOCKED" | "INACTIVE";
export type LicenseState = "ok" | "soon" | "expired" | "none";
export type AgingKey = "has" | "1-30" | "31-60" | "61-90" | "90plus" | "none";
export type DateKind = "last" | "pay" | "created";

/** OpenAPI `OverviewRow` ning ro'yxatga kerak bo'lgan qismi (testlar uchun mustaqil). */
export interface OverviewLike {
  id: number;
  tin: string;
  name: string;
  legalName?: string | null;
  kind?: OverviewKind | null;
  region?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  branches: string[];
  inScope: boolean;
  licenseValidUntil?: string | null;
  controlledAllowed: boolean;
  status: OverviewStatus;
  debt: string;
  overdue: string;
  maxOverdueDays: number;
  agingBuckets: string[];
  creditLimit?: string | null;
  priceTypes: string[];
  operators: string[];
  buyers: string[];
  lastSaleDate?: string | null;
  lastReceiptDate?: string | null;
  lastPaymentDate?: string | null;
  createdOn: string;
  lastSaleNumber?: string | null;
  lastReceiptNumber?: string | null;
}

export const VIEWS_C = ["all", "debt", "licSoon", "ctrl", "blocked", "inactive"] as const;
export const VIEWS_S = ["all", "ourDebt", "licSoon", "ctrl", "blocked", "inactive"] as const;
export type View = (typeof VIEWS_C)[number] | (typeof VIEWS_S)[number];

export interface OverviewFilters {
  view: View;
  q: string;
  status: OverviewStatus[];
  debt: AgingKey[];
  branches: string[];
  operators: string[];
  buyers: string[];
  regions: string[];
  kinds: OverviewKind[];
  lic: LicenseState[];
  priceTypes: string[];
  overLimit: boolean;
  ctrl: boolean;
  dateKind: DateKind;
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTERS: OverviewFilters = {
  view: "all",
  q: "",
  status: [],
  debt: [],
  branches: [],
  operators: [],
  buyers: [],
  regions: [],
  kinds: [],
  lic: [],
  priceTypes: [],
  overLimit: false,
  ctrl: false,
  dateKind: "last",
  from: null,
  to: null,
};

export type SortKey = "name" | "debt" | "overdue" | "limit" | "price" | "lastSale" | "lastIn" | "terms";

/** "1250000.50" → 125000050n (tiyin). */
export function cents(v: string | null | undefined): bigint {
  if (!v) return 0n;
  const neg = v.startsWith("-");
  const [a = "0", b = ""] = v.replace("-", "").split(".");
  const c = BigInt(a || "0") * 100n + BigInt((b + "00").slice(0, 2));
  return neg ? -c : c;
}

const DAY = 86_400_000;
const isoDay = (s: string) => Date.parse(`${s}T00:00:00Z`);

/** Litsenziya holati: 30 kundan kam qolgan — «tugayotgan». */
export function licenseOf(validUntil: string | null | undefined, today: string): { state: LicenseState; days: number } {
  if (!validUntil) return { state: "none", days: 0 };
  const days = Math.round((isoDay(validUntil) - isoDay(today)) / DAY);
  if (days < 0) return { state: "expired", days };
  return { state: days <= 30 ? "soon" : "ok", days };
}

export const overLimit = (r: OverviewLike) => r.creditLimit != null && cents(r.debt) > cents(r.creditLimit);

const NORM: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ғ: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  қ: "q",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  ў: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ҳ: "h",
  ц: "s",
  ч: "ch",
  ш: "sh",
  ъ: "",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Qidiruv uchun: kichik harf, kirill → lotin, apostrof va bo'shliqlar olib tashlanadi. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => NORM[ch] ?? ch)
    .join("")
    .replace(/[ʻʼ'`‘’"«»\s.-]/g, "");
}

export type Hit = { where: "name" | "tin" | "phone" | "contact" | "doc" | "operator" | "legal" } | null;

export function search(r: OverviewLike, q: string): Hit {
  const n = norm(q);
  if (!n) return null;
  if (norm(r.name).includes(n)) return { where: "name" };
  if (r.legalName && norm(r.legalName).includes(n)) return { where: "legal" };
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && r.tin.includes(digits)) return { where: "tin" };
  if (digits.length >= 3 && r.phone && r.phone.replace(/\D/g, "").includes(digits)) return { where: "phone" };
  if (r.contactPerson && norm(r.contactPerson).includes(n)) return { where: "contact" };
  const doc = [r.lastSaleNumber, r.lastReceiptNumber].find((d) => d && norm(d).includes(n));
  if (doc) return { where: "doc" };
  if ([...r.operators, ...r.buyers].some((o) => norm(o).includes(n))) return { where: "operator" };
  return null;
}

const dateOf = (r: OverviewLike, k: DateKind, customers: boolean): string | null =>
  k === "pay" ? (r.lastPaymentDate ?? null) : k === "created" ? r.createdOn : ((customers ? r.lastSaleDate : r.lastReceiptDate) ?? null);

const VIEW_TEST: Record<View, (r: OverviewLike, today: string) => boolean> = {
  all: () => true,
  debt: (r) => cents(r.debt) > 0n,
  ourDebt: (r) => cents(r.debt) > 0n,
  licSoon: (r, today) => licenseOf(r.licenseValidUntil, today).state === "soon",
  ctrl: (r) => r.controlledAllowed,
  blocked: (r) => r.status === "BLOCKED",
  inactive: (r) => r.status === "INACTIVE",
};

export const viewCount = (rows: OverviewLike[], v: View, today: string) => rows.filter((r) => VIEW_TEST[v](r, today)).length;

const AGING: Record<AgingKey, (r: OverviewLike) => boolean> = {
  has: (r) => cents(r.debt) > 0n,
  none: (r) => cents(r.debt) <= 0n,
  "1-30": (r) => r.agingBuckets.includes("1-30"),
  "31-60": (r) => r.agingBuckets.includes("31-60"),
  "61-90": (r) => r.agingBuckets.includes("61-90"),
  "90plus": (r) => r.agingBuckets.includes("90plus"),
};
export const agingTest = AGING;

/** Ko'rinish + barcha filtrlar (ko'rinish sanoqlari uchun — `skipView`). */
export function applyFilters(rows: OverviewLike[], f: OverviewFilters, today: string, customers: boolean): OverviewLike[] {
  const any = <T>(sel: T[], test: (v: T) => boolean) => sel.length === 0 || sel.some(test);
  return rows.filter(
    (r) =>
      VIEW_TEST[f.view](r, today) &&
      (!f.q.trim() || search(r, f.q) !== null) &&
      any(f.status, (s) => r.status === s) &&
      any(f.debt, (k) => AGING[k](r)) &&
      any(f.branches, (b) => r.branches.includes(b)) &&
      any(f.operators, (o) => r.operators.includes(o)) &&
      any(f.buyers, (o) => r.buyers.includes(o)) &&
      any(f.regions, (g) => r.region === g) &&
      any(f.kinds, (k) => r.kind === k) &&
      any(f.lic, (s) => licenseOf(r.licenseValidUntil, today).state === s) &&
      any(f.priceTypes, (p) => r.priceTypes.includes(p)) &&
      (!f.overLimit || overLimit(r)) &&
      (!f.ctrl || r.controlledAllowed) &&
      (!f.from || ((d) => d !== null && d >= (f.from ?? "") && d <= (f.to ?? f.from ?? ""))(dateOf(r, f.dateKind, customers))),
  );
}

export function activeFilterCount(f: OverviewFilters): number {
  return (
    [f.status, f.debt, f.branches, f.operators, f.buyers, f.regions, f.kinds, f.lic, f.priceTypes].filter((a) => a.length > 0).length +
    (f.overLimit ? 1 : 0) +
    (f.ctrl ? 1 : 0) +
    (f.from ? 1 : 0)
  );
}

/** Saralash; boshqa filialdagilar (inScope = false) doim oxirida (prototip). */
export function sortRows<T extends OverviewLike & { paymentDays?: number[] }>(rows: T[], key: SortKey | null, desc: boolean): T[] {
  const val = (r: T): bigint | string | number => {
    switch (key) {
      case "debt":
        return cents(r.debt);
      case "overdue":
        return cents(r.overdue);
      case "limit":
        return cents(r.creditLimit);
      case "price":
        return r.priceTypes[0] ?? "";
      case "lastSale":
        return r.lastSaleDate ?? "";
      case "lastIn":
        return r.lastReceiptDate ?? "";
      case "terms":
        return r.paymentDays?.[0] ?? 0;
      default:
        return r.name;
    }
  };
  const m = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (a.inScope !== b.inScope) return a.inScope ? -1 : 1;
    if (!key) return 0;
    const x = val(a);
    const y = val(b);
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, "uz") * m;
    return (x < y ? -1 : x > y ? 1 : 0) * m;
  });
}

/** Faset sanog'i: qiymat → nechta qatorda bor. */
export function facet(rows: OverviewLike[], pick: (r: OverviewLike) => (string | null | undefined)[]): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) for (const v of new Set(pick(r))) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "uz")).map(([value, count]) => ({ value, count }));
}
