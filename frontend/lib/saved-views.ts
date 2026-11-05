/**
 * Jadvallar standarti (SPEC 4): «saqlangan koʻrinishlar» — filtrlar (URL soʻrovi) va yashirilgan ustunlar nom bilan.
 * Foydalanuvchi qulayligi: brauzer xotirasida (har jadval uchun alohida kalit), serverga yuborilmaydi.
 */
export interface SavedView {
  name: string;
  /** URL soʻrovi («?» siz), sahifa raqamisiz. */
  query: string;
  hidden: string[];
}

export const MAX_VIEWS = 20;
export const MAX_NAME = 40;

/** Sahifa raqami koʻrinishga kirmaydi — koʻrinish doim 1-sahifadan ochiladi. */
export function normalizeQuery(query: string): string {
  const p = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  p.delete("page");
  return p.toString();
}

export function parseViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (v): v is SavedView =>
          typeof v === "object" &&
          v !== null &&
          typeof (v as SavedView).name === "string" &&
          typeof (v as SavedView).query === "string" &&
          Array.isArray((v as SavedView).hidden) &&
          (v as SavedView).hidden.every((h) => typeof h === "string"),
      )
      .slice(0, MAX_VIEWS);
  } catch {
    return [];
  }
}

export type AddResult = { ok: true; views: SavedView[] } | { ok: false; error: "empty" | "tooLong" | "limit" };

/** Bir xil nom (katta-kichik harfsiz) — oʻsha koʻrinish yangilanadi va roʻyxat boshiga chiqadi. */
export function addView(views: SavedView[], name: string, query: string, hidden: string[]): AddResult {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return { ok: false, error: "empty" };
  if (n.length > MAX_NAME) return { ok: false, error: "tooLong" };
  const rest = views.filter((v) => v.name.toLocaleLowerCase("uz") !== n.toLocaleLowerCase("uz"));
  if (rest.length >= MAX_VIEWS) return { ok: false, error: "limit" };
  return { ok: true, views: [{ name: n, query: normalizeQuery(query), hidden: [...hidden] }, ...rest] };
}

export function removeView(views: SavedView[], name: string): SavedView[] {
  return views.filter((v) => v.name !== name);
}

/** Joriy holat saqlangan koʻrinishga mosmi (ustunlar tartibi farq qilmaydi). */
export function isCurrentView(view: SavedView, query: string, hidden: string[]): boolean {
  const a = new URLSearchParams(view.query);
  const b = new URLSearchParams(normalizeQuery(query));
  a.sort();
  b.sort();
  return a.toString() === b.toString() && [...view.hidden].sort().join(",") === [...hidden].sort().join(",");
}
