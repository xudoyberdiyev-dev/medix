/** Direktor bosh sahifasi (prototip `Home.dc.html`) uchun sof yordamchilar — testlanadi. */

export type GreetKey = "greetMorning" | "greetDay" | "greetEvening";

/** Prototip: 12 gacha — tong, 18 gacha — kun, keyin — kech (Toshkent soati). */
export function greetKey(hour: number): GreetKey {
  return hour < 12 ? "greetMorning" : hour < 18 ? "greetDay" : "greetEvening";
}

/** Toshkent vaqti bo'yicha soat (0–23). */
export function tashkentHour(now = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Tashkent" }).format(now);
  return Number(h) % 24;
}

/** Salomlashish uchun ism: F.I.Sh. ning birinchi so'zi. */
export function firstName(fullName: string | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Pul satrini tiyinlarga (bigint) — ulushlarni float'siz hisoblash uchun. */
export function toCents(v: string): bigint {
  const neg = v.trim().startsWith("-");
  const [i = "0", f = ""] = v.trim().replace("-", "").split(".");
  const c = BigInt(i || "0") * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -c : c;
}

/** Ustun balandligi / segment eni uchun ulush (0–1). Faqat ko'rinish uchun — pul hisobiga ishlatilmaydi. */
export function share(part: string, whole: bigint): number {
  if (whole <= 0n) return 0;
  const p = toCents(part);
  if (p <= 0n) return 0;
  return Number((p * 10000n) / whole) / 10000;
}

export function maxCents(values: string[]): bigint {
  return values.reduce((m, v) => {
    const c = toCents(v);
    return c > m ? c : m;
  }, 0n);
}

/** «Muddati kelmagan» = jami qarz − muddati o'tgan (satr, 2 kasr). */
export function minusMoney(a: string, b: string): string {
  const c = toCents(a) - toCents(b);
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

export interface SupplierLike {
  id: number;
}

/** Ta'minotchi kartasi: aktivlar (davrda kirim), keyin passivlar — jami 5 ta, har biri holati bilan. */
export function mergeSuppliers<T extends SupplierLike>(active: T[], passive: T[], limit = 5): Array<T & { active: boolean }> {
  return [...active.map((r) => ({ ...r, active: true })), ...passive.map((r) => ({ ...r, active: false }))].slice(0, limit);
}

/** Grafik ostidagi sana yorlig'i: 12 kundan ko'p bo'lsa — har 3-kun va oxirgisi (prototip). */
export function axisLabel(iso: string, i: number, n: number): string {
  if (n > 12 && i % 3 !== 0 && i !== n - 1) return "";
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** Pul satrlari yig'indisi (tiyinlarda, float'siz) → «123.45». */
export function sumMoney(values: string[]): string {
  let c = 0n;
  for (const v of values) c += toCents(v);
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
