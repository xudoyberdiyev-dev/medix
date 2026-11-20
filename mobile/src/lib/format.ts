// Pul va sana (100+ qoidasi): pul «1.250.000,00», sana «20.11.2026», vaqt Asia/Tashkent (UTC+5, yozgi vaqt yoʻq).
// Pul serverdan satr boʻlib keladi — float ishlatilmaydi: tiyinlar butun son (bigint) sifatida hisoblanadi.

/** «820000.5» → 82000050n (tiyin). */
export function toTiyin(amount: string | null | undefined): bigint {
  if (!amount) return 0n;
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) return 0n;
  const v = BigInt(m[2]) * 100n + BigInt((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -v : v;
}

function groups(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 82000050n → «820.000,50»; short=true → «820.000» (sarlavhadagi qisqa koʻrinish). */
export function formatTiyin(v: bigint, short = false): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = groups(abs / 100n);
  const body = short ? whole : `${whole},${(abs % 100n).toString().padStart(2, "0")}`;
  return neg ? `−${body}` : body;
}

export function formatMoney(amount: string | null | undefined, short = false): string {
  return formatTiyin(toTiyin(amount), short);
}

const TASHKENT_MS = 5 * 60 * 60 * 1000;

function tashkent(iso: string | Date): Date {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() + TASHKENT_MS);
}

const two = (n: number) => String(n).padStart(2, "0");

/** «2026-11-20» yoki ISO vaqt → «20.11.2026». */
export function formatDate(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  const t = tashkent(value);
  return `${two(t.getUTCDate())}.${two(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

/** «20.11» */
export function formatDayMonth(value: string | Date): string {
  return formatDate(value).slice(0, 5);
}

/** ISO vaqt → «09:40» (Toshkent). */
export function formatTime(value: string | Date): string {
  const t = tashkent(value);
  return `${two(t.getUTCHours())}:${two(t.getUTCMinutes())}`;
}

/** Hafta kuni indeksi (0 — yakshanba), Toshkent boʻyicha. */
export function weekday(value: Date): number {
  return tashkent(value).getUTCDay();
}
