import { fromCents, toCents } from "./api";

/** Kunni yopish (prototip `CashClose`): sanoq rejimi — kupyuralar boʻyicha yoki jami summa. */
export type CountMode = "den" | "total";

/** Prototipdagi kupyuralar (tangalar «Jami summa» rejimida kiritiladi). */
export const BANKNOTES = [200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000] as const;

export type CloseField = "count" | "note" | "pin";
export type CloseErrorKey = "closeFirst" | "count" | "pending" | "diffNote" | "pinPick" | "pin";

export interface CloseError {
  key: CloseErrorKey;
  field: CloseField | null;
  /** «Avval {d} kunini yoping» uchun ISO sana. */
  date?: string;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ISO sana + n kun (UTC, vaqt mintaqasiz). */
export function addDays(iso: string, n: number): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.toISOString().slice(0, 10);
}

/** Sanoq: kupyuralar boʻyicha — hech boʻlmaganda bitta soni kiritilgan boʻlsa; jami — summa kiritilgan boʻlsa. Aks holda null. */
export function countedOf(mode: CountMode, counts: Record<number, string>, total: string): string | null {
  if (mode === "total") return /^\d+(\.\d{1,2})?$/.test(total.trim()) ? fromCents(toCents(total)) : null;
  let sum = 0n;
  let any = false;
  for (const n of BANKNOTES) {
    const c = (counts[n] ?? "").trim();
    if (/^\d+$/.test(c) && BigInt(c) > 0n) {
      any = true;
      sum += BigInt(n) * 100n * BigInt(c);
    }
  }
  return any ? fromCents(sum) : null;
}

/** Farq = sanoq − tizim qoldigʻi (sanoq yoʻq boʻlsa null). */
export function diffOf(counted: string | null, system: string): string | null {
  return counted == null ? null : fromCents(toCents(counted) - toCents(system));
}

export type DiffTone = "success" | "danger" | "warning";

export function diffTone(diff: string | null): DiffTone | null {
  if (diff == null) return null;
  const c = toCents(diff);
  return c === 0n ? "success" : c < 0n ? "danger" : "warning";
}

export function hasDiff(diff: string | null): boolean {
  return diff != null && toCents(diff) !== 0n;
}

/** Yuborishdan oldingi tekshiruv (prototip `check`): server ham xuddi shuni tekshiradi. */
export function checkClose(input: {
  date: string;
  lastClosed: string | null;
  pendingOps: number;
  counted: string | null;
  diff: string | null;
  note: string;
  approverId: number | null;
  pin: string;
}): CloseError[] {
  const errs: CloseError[] = [];
  if (input.lastClosed && input.lastClosed < addDays(input.date, -1)) {
    errs.push({ key: "closeFirst", field: null, date: addDays(input.lastClosed, 1) });
  }
  if (input.pendingOps > 0) errs.push({ key: "pending", field: null });
  if (input.counted == null) errs.push({ key: "count", field: "count" });
  if (hasDiff(input.diff)) {
    if (!input.note.trim()) errs.push({ key: "diffNote", field: "note" });
    if (input.approverId == null) errs.push({ key: "pinPick", field: "pin" });
    else if (!/^\d{4,6}$/.test(input.pin)) errs.push({ key: "pin", field: "pin" });
  }
  return errs;
}

/** Serverga yuboriladigan sanoq: kupyuralar yoki (jami rejimida) butun summa «mayda pul» maydonida. */
export function closeBody(mode: CountMode, counts: Record<number, string>, total: string) {
  if (mode === "total") return { denominations: [], coins: fromCents(toCents(total || "0")) };
  return {
    denominations: BANKNOTES.map((n) => ({ nominal: n, count: /^\d+$/.test((counts[n] ?? "").trim()) ? Number(counts[n]) : 0 })),
    coins: undefined,
  };
}
