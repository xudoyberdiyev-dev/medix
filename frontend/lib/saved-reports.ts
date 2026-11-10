/**
 * «Mening hisobotlarim» (prototip Reports — hs_mine): hisobot sozlamasi nom bilan saqlanadi.
 * Davr nisbiy saqlanadi («Shu oy»), aniq sana emas; ixtiyoriy davr — «Oy» boʻlib saqlanadi (prototip kabi).
 * Foydalanuvchi qulayligi: brauzer xotirasida, serverga yuborilmaydi.
 */
import type { PeriodPreset } from "@/features/home/period";

export interface SavedReport {
  name: string;
  /** Hisobot manzili soʻrov bilan, masalan «/reports/sales?period=month&groupBy=CUSTOMER». */
  href: string;
}

export const SAVED_REPORTS_KEY = "medix-saved-reports";
export const MAX_REPORTS = 20;
export const MAX_REPORT_NAME = 60;

const PRESETS: readonly PeriodPreset[] = ["today", "week", "month"];

/** URL'dagi `period` — saqlangan hisobot davri; notoʻgʻri boʻlsa — standart. */
export function presetFromParam(raw: string | null, fallback: PeriodPreset = "today"): PeriodPreset {
  return PRESETS.find((p) => p === raw) ?? fallback;
}

/** Hisobot manzili: faqat `/reports/` ichida; boʻsh qiymatlar tashlanadi. */
export function reportHref(path: string, preset: PeriodPreset, extra: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams();
  q.set("period", preset === "custom" ? "month" : preset);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return `${path}?${q.toString()}`;
}

function isSafeHref(href: string): boolean {
  return href.startsWith("/reports/") && !href.startsWith("//");
}

export function parseReports(raw: string | null): SavedReport[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (v): v is SavedReport =>
          typeof v === "object" &&
          v !== null &&
          typeof (v as SavedReport).name === "string" &&
          typeof (v as SavedReport).href === "string" &&
          isSafeHref((v as SavedReport).href),
      )
      .slice(0, MAX_REPORTS);
  } catch {
    return [];
  }
}

export type AddReportResult = { ok: true; reports: SavedReport[] } | { ok: false; error: "empty" | "tooLong" | "limit" };

/** Bir xil nom (katta-kichik harfsiz) — yangilanadi va roʻyxat boshiga chiqadi. */
export function addReport(list: SavedReport[], name: string, href: string): AddReportResult {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return { ok: false, error: "empty" };
  if (n.length > MAX_REPORT_NAME) return { ok: false, error: "tooLong" };
  const rest = list.filter((r) => r.name.toLocaleLowerCase("uz") !== n.toLocaleLowerCase("uz"));
  if (rest.length >= MAX_REPORTS) return { ok: false, error: "limit" };
  return { ok: true, reports: [{ name: n, href }, ...rest] };
}

export function removeReport(list: SavedReport[], name: string): SavedReport[] {
  return list.filter((r) => r.name !== name);
}
