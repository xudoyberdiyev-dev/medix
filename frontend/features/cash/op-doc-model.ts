import { APPROVAL_LIMIT, fromCents, toCents } from "./api";

/** Prototip `MoneyOpDoc`: KO — kassa, BO — bank operatsiyasi, IO — hisoblar orasida oʻtkazma. */
export type OpKind = "ko" | "bo" | "io";
export type OpDir = "IN" | "OUT";
export type IoType = "k2b" | "b2k" | "k2k" | "t2b";
type AccKind = "CASH" | "TERMINAL" | "BANK";

export const IO_TYPES: readonly IoType[] = ["k2b", "b2k", "k2k", "t2b"];
/** IO turi → [qayerdan, qayerga] hisob turi (prototip `IOT`). */
export const IO_KINDS: Record<IoType, [AccKind, AccKind]> = {
  k2b: ["CASH", "BANK"],
  b2k: ["BANK", "CASH"],
  k2k: ["CASH", "CASH"],
  t2b: ["TERMINAL", "BANK"],
};

export const parseKind = (v: string | null): OpKind => (v === "bo" || v === "io" ? v : "ko");
export const parseDir = (v: string | null): OpDir => (v === "IN" ? "IN" : "OUT");
export const parseIoType = (v: string | null): IoType => (IO_TYPES.includes(v as IoType) ? (v as IoType) : "k2b");

/** KO — kassalar, BO — bank va terminal hisoblari. */
export function opAccountKinds(kind: OpKind): AccKind[] {
  return kind === "ko" ? ["CASH"] : kind === "bo" ? ["BANK", "TERMINAL"] : ["CASH", "BANK", "TERMINAL"];
}

/** Kassadan limitdan katta chiqim — Filial rahbari tasdiqlaydi (backend bilan bir xil qoida). */
export function needsApproval(kind: OpKind, dir: OpDir, amount: string): boolean {
  return kind === "ko" && dir === "OUT" && amount !== "" && toCents(amount) > toCents(APPROVAL_LIMIT);
}

/** Amaldan keyingi qoldiq: kirim qoʻshiladi, chiqim ayiriladi. */
export function balanceAfter(balance: string, amount: string, sign: 1 | -1): string {
  const a = amount === "" ? 0n : toCents(amount);
  return fromCents(toCents(balance) + BigInt(sign) * a);
}

export interface OpInput {
  kind: OpKind;
  dir: OpDir;
  account: string | null;
  from: string | null;
  to: string | null;
  item: string | null;
  amount: string;
  date: string;
  dateIso: string | null;
  today: string;
  /** Tanlangan (chiqim) hisob qoldigʻi — yetmasa ogohlantirish. */
  sourceBalance: string | null;
}

export type OpField = "acct" | "from" | "to" | "item" | "sum" | "date";
export type OpErrorKey = "acct" | "from" | "to" | "same" | "item" | "sum" | "sumPos" | "date" | "future";
export interface OpCheck {
  errors: { field: OpField; key: OpErrorKey }[];
  /** Hisobda pul yetmaydi — ogohlantirish (yakuniy tekshiruv backendda). */
  short: boolean;
}

export function checkOp(i: OpInput): OpCheck {
  const errors: OpCheck["errors"] = [];
  if (i.kind === "io") {
    if (!i.from) errors.push({ field: "from", key: "from" });
    if (!i.to) errors.push({ field: "to", key: "to" });
    if (i.from && i.to && i.from === i.to) errors.push({ field: "to", key: "same" });
  } else {
    if (!i.account) errors.push({ field: "acct", key: "acct" });
    if (i.date.trim() === "" || i.dateIso === null) errors.push({ field: "date", key: "date" });
    else if (i.dateIso > i.today) errors.push({ field: "date", key: "future" });
  }
  if (i.amount === "") errors.push({ field: "sum", key: "sum" });
  else if (toCents(i.amount) <= 0n) errors.push({ field: "sum", key: "sumPos" });
  if (i.kind !== "io" && !i.item) errors.push({ field: "item", key: "item" });
  const outgoing = i.kind === "io" || i.dir === "OUT";
  const short =
    outgoing && i.sourceBalance != null && i.amount !== "" && toCents(i.amount) > 0n && toCents(i.amount) > toCents(i.sourceBalance);
  return { errors, short };
}
