import { records, type ImportField, type Mapping } from "@/features/products/import-model";

/** KK qatorlarini YB faylidan yuklash (O15): moslanadigan maydonlar; sinonimlar normallangan (lotin, kirill, rus). */
export type KkImportField = "name" | "barcode" | "ikpu" | "code" | "manufacturer" | "qty" | "price" | "vat" | "batch" | "expiry";

export const KK_IMPORT_FIELDS: ImportField<KkImportField>[] = [
  { key: "name", req: true, syn: ["mahsulotnomi", "naimenovanie", "nazvanie", "nomi", "tovar", "preparat", "name"] },
  { key: "barcode", req: false, syn: ["shtrixkod", "shtrihkod", "barcode", "gtin", "ean"] },
  { key: "ikpu", req: false, syn: ["mxik", "ikpu", "mxikkodi", "ikpukodi"] },
  { key: "code", req: false, syn: ["mahsulotkodi", "kodtovara", "artikul", "kod", "code"] },
  { key: "manufacturer", req: false, syn: ["ishlabchiqaruvchi", "proizvoditel", "zavod", "firma", "maker"] },
  { key: "qty", req: true, syn: ["soni", "miqdori", "miqdor", "kolichestvo", "kolvo", "qty", "quantity"] },
  { key: "price", req: false, syn: ["narxi", "narx", "cena", "price"] },
  { key: "vat", req: false, syn: ["qqs", "nds", "stavkands", "vat"] },
  { key: "batch", req: false, syn: ["partiya", "seriya", "seriyaraqami", "batch", "lot"] },
  { key: "expiry", req: false, syn: ["yaroqlilik", "yaroqlilikmuddati", "srokgodnosti", "godendo", "expiry"] },
];

export type KkImportRow = { row: number } & Record<KkImportField, string>;

/** Server qaytaradigan muammo kalitlari (lugʻatda `expectedReceipts.import.problem.*`). */
export const KK_IMPORT_PROBLEMS = ["product", "productGuess", "qty", "price", "vat", "expiry"] as const;
export type KkImportProblem = (typeof KK_IMPORT_PROBLEMS)[number];

export function knownProblems(problems: string[]): KkImportProblem[] {
  return problems.filter((p): p is KkImportProblem => (KK_IMPORT_PROBLEMS as readonly string[]).includes(p));
}

/** Sarlavhadan keyingi qatorlar → server soʻrovi; nomi ham, kodlari ham boʻsh qatorlar (jami, izoh) tashlanadi. */
export function importRows(grid: string[][], hdr: number, map: Mapping<KkImportField>): KkImportRow[] {
  return records(grid, hdr, map, {})
    .map(({ row, values }) => {
      const r = { row } as KkImportRow;
      for (const f of KK_IMPORT_FIELDS) r[f.key] = values[f.key]?.trim() ?? "";
      return r;
    })
    .filter((r) => r.name || r.barcode || r.code || r.ikpu);
}

export interface ImportedLineLike {
  productId?: number | null;
  qty?: number | null;
  problems: string[];
}

/** Qoʻshiladigan qator: mahsulot topilgan va soni oʻqilgan. Taxminiy (nom boʻyicha) moslash ham qoʻshiladi — belgisi bilan. */
export function importable(l: ImportedLineLike): boolean {
  return l.productId != null && l.qty != null && l.qty > 0;
}

export type ImportTone = "ok" | "check" | "skip";

export function importTone(l: ImportedLineLike): ImportTone {
  if (!importable(l)) return "skip";
  return l.problems.length > 0 ? "check" : "ok";
}
