/**
 * Toʻlov hujjati (prototip `PaymentDoc` + `AllocationGrid`) — sof mantiq: taqsimot qatorlari, tekshiruv, tasdiqlash oqibatlari.
 * Pul faqat tiyinlarda (bigint) hisoblanadi — float yoʻq.
 */
import { parseUzDate } from "@/features/counterparties/api";

export type PayKind = "mt" | "yt";
export type AccountKind = "CASH" | "BANK" | "TERMINAL";

export interface DocRow {
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
  extNo?: string | null;
}

export const keyOf = (d: { docType: string; docId: number }) => `${d.docType}:${d.docId}`;

export function cents(s: string | null | undefined): bigint {
  const t = (s ?? "").trim();
  if (!t) return 0n;
  const [i, f = ""] = t.split(".");
  const neg = i.startsWith("-");
  const v = BigInt(neg ? i.slice(1) || "0" : i || "0") * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -v : v;
}

export function fromCents(v: bigint): string {
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${a.slice(0, -2)}.${a.slice(-2)}`;
}

/** Avtomatik taqsimot (server bilan bir xil): eng eski qarzdan boshlab. */
export function autoAlloc(docs: DocRow[], amount: string): Record<string, string> {
  let left = cents(amount);
  const out: Record<string, string> = {};
  for (const d of docs) {
    if (left <= 0n) break;
    const open = cents(d.open);
    if (open <= 0n) continue;
    const use = left >= open ? open : left;
    out[keyOf(d)] = fromCents(use);
    left -= use;
  }
  return out;
}

/** Joriy taqsimot avtomatik bilan bir xilmi (nol qiymatlar hisobga olinmaydi). */
export function isAuto(docs: DocRow[], amount: string, alloc: Record<string, string>): boolean {
  const a = autoAlloc(docs, amount);
  const b = Object.entries(alloc).filter(([, v]) => cents(v) > 0n);
  return b.length === Object.keys(a).length && b.every(([k, v]) => a[k] !== undefined && cents(a[k]) === cents(v));
}

export interface GridRow {
  key: string;
  doc: DocRow;
  value: string;
  /** Shu toʻlovdan keyin qoladi. */
  after: string;
  closes: boolean;
  partial: boolean;
  over: boolean;
}

export function gridRows(docs: DocRow[], alloc: Record<string, string>): GridRow[] {
  return docs.map((doc) => {
    const key = keyOf(doc);
    const v = cents(alloc[key]);
    const open = cents(doc.open);
    return {
      key,
      doc,
      value: v > 0n ? fromCents(v) : "",
      after: fromCents(open - v > 0n ? open - v : 0n),
      closes: v > 0n && v >= open,
      partial: v > 0n && v < open,
      over: v > open,
    };
  });
}

export interface Totals {
  sum: string;
  allocated: string;
  advance: string;
}

export function totals(amount: string, alloc: Record<string, string>): Totals {
  const sum = cents(amount);
  const a = Object.values(alloc).reduce((s, v) => s + (cents(v) > 0n ? cents(v) : 0n), 0n);
  const adv = sum - a;
  return { sum: fromCents(sum), allocated: fromCents(a), advance: fromCents(adv > 0n ? adv : 0n) };
}

export type Field = "party" | "date" | "sum" | "method" | "acct" | "payNo" | "checkNo" | "alloc";

export interface Problem {
  field: Field;
  /** `payments.doc.*` kaliti. */
  key: string;
  params?: Record<string, string>;
}

export interface DocInput {
  kind: PayKind;
  party: string | null;
  date: string;
  amount: string;
  /** Kiritilgan summa notoʻgʻri boʻlsa — true (parseMoneyInput null qaytargan). */
  amountInvalid?: boolean;
  method: AccountKind;
  account: { id: number; kind: AccountKind; balance?: string | null } | null;
  payOrderNo: string;
  checkNo: string;
  today: string;
  docs: DocRow[];
  alloc: Record<string, string>;
  /** Kassir faqat naqd kiritadi. */
  cashOnly: boolean;
}

export function checkDoc(i: DocInput): { errors: Problem[]; warnings: Problem[]; totals: Totals } {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  if (!i.party) errors.push({ field: "party", key: "eParty" });
  const iso = parseUzDate(i.date);
  if (!iso) errors.push({ field: "date", key: "eDate" });
  else if (iso > i.today) errors.push({ field: "date", key: "eFuture" });
  const sum = cents(i.amountInvalid ? "" : i.amount);
  if (i.amountInvalid || !i.amount.trim()) errors.push({ field: "sum", key: "eSum" });
  else if (sum <= 0n) errors.push({ field: "sum", key: "eSumPos" });
  if (!i.account) errors.push({ field: "acct", key: i.method === "CASH" ? "eCash" : "eBank" });
  if (i.method === "BANK" && !i.payOrderNo.trim()) errors.push({ field: "payNo", key: "ePayNo" });
  if (i.method === "TERMINAL" && !i.checkNo.trim()) errors.push({ field: "checkNo", key: "eCheck" });
  if (i.cashOnly && i.method !== "CASH") errors.push({ field: "method", key: "eCashier" });
  for (const r of gridRows(i.docs, i.alloc))
    if (r.over) errors.push({ field: "alloc", key: "eRow", params: { n: r.doc.docNumber, s: r.doc.open } });
  const t = totals(i.amountInvalid ? "0" : i.amount || "0", i.alloc);
  if (sum > 0n && cents(t.allocated) > sum) errors.push({ field: "alloc", key: "eOverAlloc", params: { a: t.allocated, b: t.sum } });
  if (i.kind === "yt" && i.method === "CASH" && i.account?.balance != null && sum > 0n) {
    const bal = cents(i.account.balance);
    if (sum > bal) errors.push({ field: "sum", key: "eCashShort", params: { a: fromCents(bal), b: t.sum, c: fromCents(sum - bal) } });
  }
  if (i.party && sum > 0n && cents(t.advance) > 0n)
    warnings.push({ field: "alloc", key: i.kind === "mt" ? "wAdvMt" : "wAdvYt", params: { s: t.advance } });
  return { errors, warnings, totals: t };
}

/** Tasdiqlash oynasidagi oqibatlar (prototip `dlg`): qarz oldin → keyin, yopiladigan hujjatlar, muddati oʻtgan yopilishi. */
export function postEffects(debt: string, docs: DocRow[], alloc: Record<string, string>) {
  const rows = gridRows(docs, alloc);
  const t = totals("0", alloc);
  const after = cents(debt) - cents(t.allocated);
  let full = 0;
  let part = 0;
  let overdue = 0n;
  let overdueAfter = 0n;
  for (const r of rows) {
    if (r.closes) full++;
    else if (r.partial) part++;
    if (r.doc.overdueDays > 0) {
      overdue += cents(r.doc.open);
      overdueAfter += cents(r.after);
    }
  }
  return {
    before: fromCents(cents(debt)),
    after: fromCents(after),
    full,
    part,
    overdueClosed: overdue > 0n && overdueAfter === 0n ? fromCents(overdue) : null,
  };
}

/** Qaysi bosqichlar: MT — Qoralama → Tasdiqlangan; YT — Qoralama → Tasdiqlashda → Tasdiqlangan; bekor — oxirida «Bekor qilingan». */
export function docSteps(kind: PayKind, status: "DRAFT" | "PENDING" | "POSTED" | "CANCELLED") {
  const order = kind === "mt" ? (["DRAFT", "POSTED"] as const) : (["DRAFT", "PENDING", "POSTED"] as const);
  if (status === "CANCELLED")
    return [...order.map((s) => ({ status: s as string, state: "done" as const })), { status: "CANCELLED", state: "fail" as const }];
  const cur = order.indexOf(status as never);
  return order.map((s, i) => ({
    status: s as string,
    state: i < cur ? ("done" as const) : i === cur ? ("cur" as const) : ("next" as const),
  }));
}
