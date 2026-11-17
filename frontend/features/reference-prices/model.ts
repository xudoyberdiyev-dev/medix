import type { ImportField } from "@/features/products/import-model";

/** Referent narxlar fayli maydonlari (O14): sarlavhalar UZ (lotin/kirill) va RU sinonimlari normallangan koʻrinishda. */
export type RefField = "name" | "barcode" | "ikpu" | "code" | "manufacturer" | "price" | "unit";

export const REF_FIELDS: ImportField<RefField>[] = [
  { key: "name", req: true, syn: ["mahsulotnomi", "naimenovanie", "nazvanie", "nomi", "tovar", "preparat", "name"] },
  { key: "barcode", req: false, syn: ["shtrixkod", "shtrihkod", "barcode", "gtin", "ean"] },
  { key: "ikpu", req: false, syn: ["mxik", "ikpu", "mxikkodi", "ikpukodi"] },
  { key: "code", req: false, syn: ["mahsulotkodi", "kodtovara", "kod", "code"] },
  { key: "manufacturer", req: false, syn: ["ishlabchiqaruvchi", "proizvoditel", "zavod", "firma", "maker"] },
  { key: "price", req: true, syn: ["referentnarx", "referentnayacena", "narx", "cena", "price", "summa"] },
  { key: "unit", req: false, syn: ["birlik", "olchovbirligi", "edinica", "edizm", "unit"] },
];

export type LineStatus = "DEARER" | "CHEAPER" | "MATCH" | "NOT_FOUND" | "NO_PRICE";
export type ResultTab = "DEARER" | "CHEAPER" | "MATCH" | "NOT_FOUND";
export const RESULT_TABS: ResultTab[] = ["DEARER", "CHEAPER", "MATCH", "NOT_FOUND"];

/** «Topilmadi» yorligʻida narxi yoʻq (bazada bor, narxi yoʻq) qatorlar ham. */
export function inTab(tab: ResultTab, status: LineStatus): boolean {
  return tab === "NOT_FOUND" ? status === "NOT_FOUND" || status === "NO_PRICE" : status === tab;
}

interface LineLike {
  status: LineStatus;
  name: string;
  productName?: string | null;
  productCode?: string | null;
  manufacturer?: string | null;
  barcode?: string | null;
  diffPct?: string | null;
}

/** Yorliq + qidiruv (fayldagi nom, bizdagi nom/kod, ishlab chiqaruvchi, shtrix-kod) + farq % boʻyicha saralash. */
export function visibleLines<T extends LineLike>(lines: T[], tab: ResultTab, query: string, dir: "asc" | "desc" | null): T[] {
  const q = query.trim().toLowerCase();
  const out = lines.filter(
    (l) =>
      inTab(tab, l.status) &&
      (!q || [l.name, l.productName, l.productCode, l.manufacturer, l.barcode].some((s) => (s ?? "").toLowerCase().includes(q))),
  );
  if (dir) {
    const v = (l: T) => (l.diffPct == null ? Number.NEGATIVE_INFINITY : Number(l.diffPct));
    out.sort((a, b) => (dir === "asc" ? v(a) - v(b) : v(b) - v(a)));
  }
  return out;
}

/** Farq foizi koʻrsatish uchun: «+11,11 %», «−4,50 %». */
export function formatPct(pct: string | null | undefined): string {
  if (pct == null) return "—";
  const n = Number(pct);
  const abs = Math.abs(n).toFixed(2).replace(".", ",");
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${abs} %`;
}

/** Sarlavha qatori taxmini: birinchi 10 qatordan eng koʻp toʻldirilgani. */
export function guessHeader(grid: string[][]): number {
  let best = 1;
  let bestN = 0;
  grid.slice(0, 10).forEach((r, i) => {
    const n = r.filter((c) => String(c ?? "").trim() !== "").length;
    if (n > bestN) {
      bestN = n;
      best = i + 1;
    }
  });
  return best;
}
