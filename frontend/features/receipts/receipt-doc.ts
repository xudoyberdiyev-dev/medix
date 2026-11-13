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

/** Prototip `Receipts` → DocumentHeader.steps: Qoralama → Qabul qilindi → Oʻtkazildi (bekor — qizil). */
export function receiptSteps(
  status: "DRAFT" | "ACCEPTED" | "POSTED" | "CANCELLED",
): { key: "DRAFT" | "ACCEPTED" | "POSTED" | "CANCELLED"; state: "done" | "cur" | "next" | "fail" }[] {
  const order = ["DRAFT", "ACCEPTED", "POSTED"] as const;
  if (status === "CANCELLED")
    return [
      { key: "DRAFT", state: "done" },
      { key: "CANCELLED", state: "fail" },
    ];
  const at = order.indexOf(status);
  return order.map((k, i) => ({ key: k, state: i < at || status === "POSTED" ? "done" : i === at ? "cur" : "next" }));
}

/** Toʻlov kuni hisoblanadigan sana: hisob-faktura sanasi, yoʻq boʻlsa kirim sanasi (O7, egasi qarori 13.11.2026). */
export function dueBase(receiptIso: string, invoiceIso: string | undefined): string {
  return invoiceIso || receiptIso;
}

/** Standart toʻlov kuni = asos sana + YB sharti (kun). ISO `YYYY-MM-DD`. */
export function standardDue(receiptIso: string, invoiceIso: string | undefined, days: number): string {
  const [y, m, d] = dueBase(receiptIso, invoiceIso).split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return at.toISOString().slice(0, 10);
}
