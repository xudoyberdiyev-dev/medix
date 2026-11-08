import type { ReceiptDetail } from "./api";

type BonusInput = Pick<ReceiptDetail, "discountKind" | "discountValue" | "amount" | "actualAmount" | "debtAmount">;

/** Tiyin (bigint) → API pul satri `1234.50`. */
export function centsToMoney(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${(a / 100n).toString()}.${(a % 100n).toString().padStart(2, "0")}`;
}

/** API pul satri → tiyin (bigint). */
export function toCentsBig(v: string): bigint {
  const neg = v.startsWith("-");
  const [w, f = ""] = (neg ? v.slice(1) : v).split(".");
  const c = BigInt(w || "0") * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -c : c;
}

/** Kutilayotgan bonus (BNS tasdiqlanmagan): SUM — qiymatning oʻzi, PERCENT — summa × % (tiyin aniqligida, HALF_UP). */
export function expectedBonus(doc: BonusInput): string | null {
  if (!doc.discountKind || !doc.discountValue) return null;
  if (doc.discountKind === "SUM") return doc.discountValue;
  const base = doc.debtAmount ?? doc.actualAmount ?? doc.amount;
  if (!base) return null;
  // summa(tiyin) × foiz(×100) / 10000 → tiyin, HALF_UP (musbat qiymatlar)
  const cents = toCentsBig(base) * toCentsBig(doc.discountValue);
  return centsToMoney((cents * 2n + 10000n) / 20000n);
}
