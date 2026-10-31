/**
 * MEDIX raqam, pul va sana koʻrinishi (design/system/README.md → «Raqamlar, pul, sana»).
 * Pul serverdan satr sifatida keladi ("1250000.50") — float ishlatilmaydi.
 */

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "1250000.5" → "1.250.000,50". Kirish — oʻnli nuqtali satr yoki butun son. */
export function formatMoney(amount: string | bigint): string {
  const raw = typeof amount === "bigint" ? amount.toString() : amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Pul qiymati notoʻgʻri: ${raw}`);
  }
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, fracPart = ""] = unsigned.split(".");
  let integer = BigInt(intPart);
  let cents = 0n;
  if (fracPart.length > 0) {
    const padded = (fracPart + "000").slice(0, 3);
    cents = BigInt(padded.slice(0, 2));
    if (Number(padded[2]) >= 5) cents += 1n; // HALF_UP
    if (cents === 100n) {
      cents = 0n;
      integer += 1n;
    }
  }
  const isZero = integer === 0n && cents === 0n;
  const sign = negative && !isZero ? "-" : "";
  return `${sign}${groupThousands(integer.toString())},${cents.toString().padStart(2, "0")}`;
}

/** 1240 → "1.240" */
export function formatQuantity(qty: number): string {
  if (!Number.isInteger(qty)) {
    throw new Error(`Miqdor butun son boʻlishi kerak: ${qty}`);
  }
  const sign = qty < 0 ? "-" : "";
  return sign + groupThousands(Math.abs(qty).toString());
}

const TZ = "Asia/Tashkent";

function parts(date: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/** → "04.10.2026" (Asia/Tashkent) */
export function formatDate(date: Date): string {
  const p = parts(date);
  return `${p.day}.${p.month}.${p.year}`;
}

/** → "04.10.2026, 16:40" (Asia/Tashkent) */
export function formatDateTime(date: Date): string {
  const p = parts(date);
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`;
}
