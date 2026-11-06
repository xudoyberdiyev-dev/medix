const ONES = ["", "bir", "ikki", "uch", "toʻrt", "besh", "olti", "yetti", "sakkiz", "toʻqqiz"];
const TENS = ["", "oʻn", "yigirma", "oʻttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "toʻqson"];
const SCALES = ["", "ming", "million", "milliard", "trillion"];

function triple(n: number): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (h) out.push(ONES[h]!, "yuz");
  if (t) out.push(TENS[t]!);
  if (o) out.push(ONES[o]!);
  return out;
}

/**
 * Pul summasi soʻz bilan (kassa orderi, ishonchnoma): "1250000.50" → "bir million ikki yuz ellik ming soʻm 50 tiyin".
 * Kirish — API'dagi kanonik satr; float ishlatilmaydi (butun qism BigInt orqali uchlik guruhlarga boʻlinadi).
 */
export function moneyInWords(amount: string): string {
  const t = amount.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) throw new Error(`Pul qiymati notoʻgʻri: ${amount}`);
  const negative = t.startsWith("-");
  const [intRaw, frac = ""] = (negative ? t.slice(1) : t).split(".");
  let int = BigInt(intRaw!);
  const tiyin = (frac + "00").slice(0, 2);
  const words: string[] = [];
  for (let i = 0; int > 0n; i++) {
    const g = Number(int % 1000n);
    int /= 1000n;
    if (g === 0) continue;
    if (i >= SCALES.length) throw new Error(`Summa juda katta: ${amount}`);
    words.unshift(...triple(g), ...(SCALES[i] ? [SCALES[i]!] : []));
  }
  const body = words.length > 0 ? words.join(" ") : "nol";
  return `${negative ? "minus " : ""}${body} soʻm ${tiyin} tiyin`;
}
