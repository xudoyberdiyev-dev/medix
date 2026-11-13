import { formatMoney } from "@/lib/format";

export type SettingKind = "DAY" | "PCT" | "SUM" | "LEN" | "MIN" | "TRIES" | "LOCK" | "RDAY";

/**
 * Kiritilgan qiymatni serverga yuboriladigan koʻrinishga keltirish (prototip `num`): SUM — «2.000.000,00» yoki «2000000» →
 * «2000000.00»; qolganlari — butun son satri. Notoʻgʻri boʻlsa — null.
 */
export function canonicalSetting(kind: SettingKind, raw: string): string | null {
  const t = raw.replace(/\s/g, "");
  if (kind === "SUM") {
    const c = t.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(c)) return null;
    const [int, frac = ""] = c.split(".");
    return `${BigInt(int ?? "0").toString()}.${frac.padEnd(2, "0")}`;
  }
  if (!/^\d+$/.test(t)) return null;
  return BigInt(t).toString();
}

export type SettingError = { code: "num" } | { code: "sum" } | { code: "range"; min: number; max: number };

/** Qiymat xatosi (prototip `err`): raqam emas / summa 0 / oraliqdan tashqari. */
export function settingError(kind: SettingKind, min: number, max: number, raw: string): SettingError | null {
  const c = canonicalSetting(kind, raw);
  if (c === null) return { code: "num" };
  if (kind === "SUM") return /^0+\.00$/.test(c) ? { code: "sum" } : null;
  const n = Number(c);
  return n < min || n > max ? { code: "range", min, max } : null;
}

/** Koʻrsatish: SUM — «2.000.000,00», qolganlari — oʻzi. */
export function displaySetting(kind: SettingKind, value: string): string {
  return kind === "SUM" ? formatMoney(value) : value;
}

/** Qoralamadagi toʻgʻri va asl (server koʻrinishidagi) qiymatdan farqli kalitlar → serverga yuboriladigan qiymatlar. */
export function settingChanges<K extends string>(
  rows: { key: K; kind: SettingKind; min: number; max: number; value: string }[],
  draft: Partial<Record<K, string>>,
): { key: K; from: string; to: string }[] {
  const out: { key: K; from: string; to: string }[] = [];
  for (const r of rows) {
    const raw = draft[r.key];
    if (raw === undefined || settingError(r.kind, r.min, r.max, raw)) continue;
    const to = canonicalSetting(r.kind, raw);
    if (to !== null && to !== r.value) out.push({ key: r.key, from: r.value, to });
  }
  return out;
}

/** QQS stavkasi kiritishi: 0–100, 2 xonagacha. */
export function vatRateValid(raw: string): boolean {
  const t = raw.trim().replace(",", ".");
  return /^\d{1,3}(\.\d{1,2})?$/.test(t) && Number(t) <= 100;
}
