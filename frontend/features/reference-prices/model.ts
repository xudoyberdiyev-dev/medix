import type { ImportField } from "@/features/products/import-model";
import type { RefCompareRow, RefRowInput, RefStatus } from "./api";

/** O14: fayl ustunlari — MEDIX maydonlari va sarlavha sinonimlari (UZ/RU, normallangan). Tartib muhim: oldingisi ustunni egallaydi. */
export type RefField = "name" | "barcode" | "ikpu" | "code" | "manufacturer" | "unit" | "price";

export const REF_FIELDS: ImportField<RefField>[] = [
  { key: "barcode", req: false, syn: ["shtrixkod", "strixkod", "barcode", "ean", "gtin"] },
  { key: "ikpu", req: false, syn: ["ikpu", "mxik"] },
  { key: "manufacturer", req: false, syn: ["ishlabchiqaruvchi", "proizvoditel", "manufacturer", "maker", "firma"] },
  { key: "price", req: true, syn: ["referentnarx", "referentnayacena", "narx", "cena", "price", "stoimost"] },
  { key: "unit", req: false, syn: ["birlik", "edinica", "unit", "edizm"] },
  { key: "code", req: false, syn: ["mahsulotkodi", "kodtovara", "kod", "code", "artikul"] },
  { key: "name", req: true, syn: ["mahsulotnomi", "naimenovanie", "nomi", "nazvanie", "preparat", "tovar", "name", "mahsulot"] },
];

/** Moslangan qatorlar → API; nom yoki narxi boʻsh qatorlar ham yuboriladi (server oʻtkazib yuboradi va raqamini qaytaradi). */
export function toRefRows(recs: { row: number; values: Record<string, string> }[]): RefRowInput[] {
  const v = (s: string | undefined, max: number) => {
    const t = (s ?? "").trim();
    return t ? t.slice(0, max) : undefined;
  };
  return recs.map((r) => ({
    row: r.row,
    name: v(r.values.name, 500),
    barcode: v(r.values.barcode, 64),
    ikpu: v(r.values.ikpu, 32),
    code: v(r.values.code, 32),
    manufacturer: v(r.values.manufacturer, 300),
    unit: v(r.values.unit, 50),
    price: v(r.values.price, 40),
  }));
}

export type RefTab = RefStatus | "CHECK";

/** Yorliq + qidiruv (fayldagi nom, mahsulot nomi/kodi, shtrix-kod) va saralash: farq % boʻyicha (moduli kattasi birinchi). */
export function visibleRows(rows: RefCompareRow[], tab: RefTab, query: string, dir: "desc" | "asc" = "desc"): RefCompareRow[] {
  const q = query.trim().toLowerCase();
  const pct = (r: RefCompareRow) => (r.diffPct == null ? null : Math.abs(Number(r.diffPct)));
  return rows
    .filter((r) => (tab === "CHECK" ? r.needsCheck : r.status === tab))
    .filter(
      (r) => !q || [r.name, r.product?.name, r.product?.code, r.barcode, r.manufacturer].some((s) => (s ?? "").toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      const x = pct(a);
      const y = pct(b);
      if (x === null || y === null) return Number(x === null) - Number(y === null) || a.rowNo - b.rowNo;
      return (dir === "desc" ? y - x : x - y) || a.rowNo - b.rowNo;
    });
}
