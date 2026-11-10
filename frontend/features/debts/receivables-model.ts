/** Mijozlar qarzi (prototip `Receivables`): muddat boʻlaklari, holat, yorliqlar va jami — pul tiyinda (float xatosiz). */

export const AGE_KEYS = ["notDue", "d1to30", "d31to60", "d61to90", "d90plus"] as const;
export type AgeKey = (typeof AGE_KEYS)[number];
export type DebtTab = "all" | "overdue" | "limit" | "adv" | "hide";
export const DEBT_TABS: DebtTab[] = ["all", "overdue", "limit", "adv", "hide"];
export type DebtStatus = "ok" | "overdue" | "limit" | "adv";

export interface DebtLike {
  buckets: Record<AgeKey | "debt" | "advance" | "overdue", string>;
  creditLimit?: string | null;
}

export const toTiyin = (s: string): number => {
  const neg = s.startsWith("-");
  const [a, b = ""] = (neg ? s.slice(1) : s).split(".");
  const v = Number(a) * 100 + Number((b + "00").slice(0, 2));
  return neg ? -v : v;
};

export const fromTiyin = (v: number): string => {
  const abs = Math.abs(v);
  return `${v < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

export function sumOf<T>(rows: T[], f: (r: T) => string): string {
  return fromTiyin(rows.reduce((a, r) => a + toTiyin(f(r)), 0));
}

const pos = (s: string) => toTiyin(s) > 0;

export function overLimit(r: DebtLike): boolean {
  return !!r.creditLimit && toTiyin(r.creditLimit) > 0 && toTiyin(r.buckets.debt) > toTiyin(r.creditLimit);
}

export function statusOf(r: DebtLike): DebtStatus {
  if (pos(r.buckets.overdue)) return "overdue";
  if (overLimit(r)) return "limit";
  if (pos(r.buckets.advance) && !pos(r.buckets.debt)) return "adv";
  return "ok";
}

/** Limitdan foydalanish, % (bir xona aniqlik); limit yoʻq — null. */
export function usedPct(r: DebtLike): number | null {
  if (!r.creditLimit || toTiyin(r.creditLimit) <= 0) return null;
  return Math.round((toTiyin(r.buckets.debt) / toTiyin(r.creditLimit)) * 1000) / 10;
}

export function inTab(r: DebtLike, tab: DebtTab): boolean {
  switch (tab) {
    case "overdue":
      return pos(r.buckets.overdue);
    case "limit":
      return overLimit(r);
    case "adv":
      return pos(r.buckets.advance);
    case "hide":
      return pos(r.buckets.debt) || pos(r.buckets.advance);
    default:
      return true;
  }
}

export function inAges(r: DebtLike, ages: AgeKey[]): boolean {
  return ages.length === 0 || ages.some((k) => pos(r.buckets[k]));
}

/** Boʻlak ulushi «12,5%» (jami nol — «0%»). */
export function shareText(part: string, total: string): string {
  const t = toTiyin(total);
  if (t <= 0) return "0%";
  return `${String(Math.round((toTiyin(part) / t) * 1000) / 10).replace(".", ",")}%`;
}

/** Qarz kartochkasidagi ochiq hujjat (DebtDoc bilan mos). */
export interface CardDoc {
  branchId: number;
  branch: string;
  docType: string;
  docId: number;
  docNumber: string;
  date: string;
  dueDate?: string | null;
  open: string;
  overdueDays: number;
  total: string;
  returned: string;
  paid: string;
}

/** Ochiq hujjatlar jami: summa, qaytarishlar, toʻlangan, qoldiq (tiyinda qoʻshiladi). */
export function cardTotals(docs: CardDoc[]): { total: string; returned: string; paid: string; open: string } {
  return {
    total: sumOf(docs, (d) => d.total),
    returned: sumOf(docs, (d) => d.returned),
    paid: sumOf(docs, (d) => d.paid),
    open: sumOf(docs, (d) => d.open),
  };
}

/** Limitdan boʻsh qism yoki oshgan summa (limit yoʻq — 0). */
export function limitLeft(r: DebtLike): { over: boolean; value: string } {
  if (!r.creditLimit) return { over: false, value: "0.00" };
  const left = toTiyin(r.creditLimit) - toTiyin(r.buckets.debt);
  return { over: left < 0, value: fromTiyin(Math.abs(left)) };
}
