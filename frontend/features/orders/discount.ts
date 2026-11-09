/** E7: buyurtma qatori chegirmasi (%) — kiritish va koʻrsatish. */

/** Server qiymati («5.00», «7.50», «0.00») → maydon matni («5», «7,5», «»). */
export function pctText(v: string | null | undefined): string {
  if (!v) return "";
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return formatPct(v);
}

/** Koʻrsatish: «7.50» → «7,5», «0.00» → «0». */
export function formatPct(v: string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/**
 * Maydon matni → soʻrov qiymati: boʻsh — `null` (mijozning standart chegirmasi), 0–99,99 (2 xonagacha) — son,
 * notoʻgʻri — `undefined`.
 */
export function parsePct(s: string | undefined): number | null | undefined {
  const t = (s ?? "").trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return undefined;
  return Number(t);
}
