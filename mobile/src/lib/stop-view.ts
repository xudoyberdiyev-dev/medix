// Bekatdagi hisob-kitob (sof, testlar bilan). Pul — tiyinda (bigint), float yoʻq.
import { toTiyin } from "./format.ts";

/** Kiritilgan summa (faqat raqamlar, soʻm) → maydonda koʻrinishi «800.000». */
export function cashDigits(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
}

export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** «800000» → 80000000n tiyin. */
export function digitsToTiyin(digits: string): bigint {
  return digits ? BigInt(digits) * 100n : 0n;
}

/** Serverga: «800000.00» yoki null (naqd olinmadi). */
export function tiyinToApi(v: bigint): string | null {
  if (v <= 0n) return null;
  return `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`;
}

/** Toʻliq summa tugmasi uchun: tiyinli summani soʻmga yaxlitlamay — kasr boʻlsa ham raqamlar (yuqoriga emas, pastga). */
export function tiyinToDigits(v: bigint): string {
  return v > 0n ? (v / 100n).toString() : "";
}

export type CashCheck = { kind: "empty" } | { kind: "full" } | { kind: "short"; short: bigint } | { kind: "over" };

/** Olingan summa kerakli summaga nisbatan: kam boʻlsa — farq mijoz qarziga yoziladi; koʻp boʻlishi mumkin emas. */
export function checkCash(due: bigint, collected: bigint): CashCheck {
  if (collected === 0n) return due > 0n ? { kind: "short", short: due } : { kind: "empty" };
  if (collected > due) return { kind: "over" };
  // Kerakli summaning tiyin qismi soʻm bilan kiritilmaydi — 1 soʻmdan kam farq «toʻliq» hisoblanadi
  if (due - collected < 100n) return { kind: "full" };
  return { kind: "short", short: due - collected };
}

/** Qaytgan qism (taxminiy, koʻrsatish uchun): qator summasi × qaytgan / jami miqdor, HALF_UP. Aniq summani server hisoblaydi. */
export function returnedAmount(lines: { id: number; qty: number; amount: string }[], returned: Record<number, number>): bigint {
  let sum = 0n;
  for (const l of lines) {
    const r = BigInt(Math.min(returned[l.id] ?? 0, l.qty));
    if (r === 0n || l.qty === 0) continue;
    const num = toTiyin(l.amount) * r * 2n;
    const den = BigInt(l.qty) * 2n;
    sum += (num + den / 2n) / den;
  }
  return sum;
}
