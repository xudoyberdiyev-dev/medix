/** Import ustasi (prototip `ImportWizard`) — sof funksiyalar: nom normallash, avtomatik moslashtirish, qatorlar, CSV. */

export type FieldKey =
  | "code"
  | "name"
  | "contractName"
  | "classifier"
  | "maker"
  | "country"
  | "cat"
  | "form"
  | "dose"
  | "pack"
  | "unit"
  | "barcode"
  | "ikpu"
  | "farmId"
  | "note"
  | "vat"
  | "min"
  | "max"
  | "marked"
  | "controlled"
  | "prescription";

export interface ImportField<K extends string = FieldKey> {
  key: K;
  req: boolean;
  /** Sarlavha sinonimlari (normallangan: lotin, kirill, rus). */
  syn: string[];
}

/** Prototip `BQ_FIELDS.products` (tartib va sinonimlar) + MEDIX shablonidagi qoʻshimcha ustunlar. */
export const PRODUCT_FIELDS: ImportField[] = [
  { key: "code", req: false, syn: ["mahsulotkodi", "kodtovara", "kod", "code"] },
  { key: "name", req: true, syn: ["mahsulotnomi", "naimenovanie", "nomi", "name", "tovar"] },
  { key: "contractName", req: false, syn: ["shartnomadaginomi", "nazvaniepodogovoru", "podogovoru", "shartnoma"] },
  { key: "classifier", req: true, syn: ["klassifikatornomi", "klassifikator", "mnn", "xalqaronomi"] },
  { key: "maker", req: true, syn: ["ishlabchiqaruvchi", "proizvoditel", "maker"] },
  { key: "country", req: false, syn: ["ishlabchiqargandavlat", "stranaproizvodstva", "strana", "davlat", "country"] },
  { key: "cat", req: true, syn: ["kategoriya", "gruppa", "category"] },
  { key: "form", req: false, syn: ["dorishakli", "lekarstvennayaforma", "forma"] },
  { key: "dose", req: false, syn: ["dozasi", "dozirovka", "doza"] },
  { key: "pack", req: false, syn: ["qadoqdagisoni", "kolvovupakovke", "vupakovke"] },
  { key: "unit", req: false, syn: ["asosiybirlik", "edinica", "birlik", "unit"] },
  { key: "barcode", req: false, syn: ["shtrixkod", "barcode", "ean"] },
  { key: "ikpu", req: true, syn: ["ikpukodi", "ikpu", "mxik"] },
  { key: "farmId", req: true, syn: ["farmid", "farm"] },
  { key: "note", req: false, syn: ["izoh", "primechanie", "note"] },
  { key: "vat", req: false, syn: ["qqs", "nds", "vat"] },
  { key: "min", req: false, syn: ["min", "minimum"] },
  { key: "max", req: false, syn: ["max", "maksimum", "maximum"] },
  { key: "marked", req: false, syn: ["markirovkali", "markirovka", "markirovannyy"] },
  { key: "controlled", req: false, syn: ["nazoratdagi", "kontroliruemyy", "narkotik"] },
  { key: "prescription", req: false, syn: ["retsept", "recept", "poreceptu"] },
];

/** Prototip 4-qadam jadvali (turi «products») va tahrirlanadigan kataklar. */
export const CHECK_COLUMNS = ["code", "name", "match", "maker", "barcode", "ikpu", "farmId", "msg"] as const;
export const EDITABLE: FieldKey[] = ["code", "name", "barcode", "ikpu", "farmId"];

const C2L: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  ў: "o'",
  қ: "q",
  ғ: "g'",
  ҳ: "h",
};

/** Prototip `bqNorm`: kichik harf → lotin → «ts»→«c» → faqat a-z0-9. */
export function normHeader(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .split("")
    .map((ch) => C2L[ch] ?? ch)
    .join("")
    .replace(/ts/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

export type Mapping<K extends string = FieldKey> = Partial<Record<K, number>>;

/** Nom boʻyicha avtomatik moslashtirish (prototip `bqAutoMap`): har ustun bitta maydonga. */
export function autoMap<K extends string>(fields: ImportField<K>[], headers: string[]): Mapping<K> {
  const m: Mapping<K> = {};
  const used = new Set<number>();
  for (const f of fields) {
    headers.forEach((h, i) => {
      if (m[f.key] != null || used.has(i)) return;
      const q = normHeader(h).replace(/[^a-z]/g, "");
      if (q && f.syn.some((s) => q === s || q.startsWith(s))) {
        m[f.key] = i;
        used.add(i);
      }
    });
  }
  return m;
}

/** Saqlangan profil (maydon → sarlavha nomi) ni joriy sarlavhalarga qoʻllash. */
export function mapFromProfile<K extends string = FieldKey>(
  profile: Record<string, string>,
  headers: string[],
  fields: ImportField<K>[] = PRODUCT_FIELDS as unknown as ImportField<K>[],
): Mapping<K> {
  const m: Mapping<K> = {};
  for (const [k, title] of Object.entries(profile)) {
    const i = headers.findIndex((h) => h.trim() === title.trim());
    const f = fields.find((x) => x.key === k);
    if (i >= 0 && f) m[f.key] = i;
  }
  return m;
}

export function profileFromMap<K extends string>(map: Mapping<K>, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, i] of Object.entries(map) as [string, number | undefined][]) {
    if (i != null && i >= 0 && headers[i]?.trim()) out[k] = headers[i].trim();
  }
  return out;
}

/** Sarlavhadan keyingi boʻsh boʻlmagan qatorlar; `i` — 1 dan (prototip «Qator» ustuni). */
export function dataRows(grid: string[][], hdr: number): { i: number; cells: string[] }[] {
  return grid
    .slice(hdr)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((cells, k) => ({ i: k + 1, cells }));
}

export type Fix<K extends string = FieldKey> = Record<number, Partial<Record<K, string>>>;

export function records<K extends string>(
  grid: string[][],
  hdr: number,
  map: Mapping<K>,
  fix: Fix<K>,
): { row: number; values: Record<string, string> }[] {
  return dataRows(grid, hdr).map(({ i, cells }) => {
    const values: Record<string, string> = {};
    for (const [k, ix] of Object.entries(map) as [string, number | undefined][]) {
      if (ix != null && ix >= 0) values[k] = String(cells[ix] ?? "");
    }
    return { row: i, values: { ...values, ...(fix[i] ?? {}) } };
  });
}

/** Moslashtirish xatosi: majburiy maydon yoʻq yoki bitta ustun ikki maydonga. */
export function mappingProblems<K extends string>(fields: ImportField<K>[], map: Mapping<K>): { missing: K[]; dup: K[] } {
  const missing = fields.filter((f) => f.req && !((map[f.key] ?? -1) >= 0)).map((f) => f.key);
  const used = new Map<number, K>();
  const dup: K[] = [];
  for (const f of fields) {
    const ix = map[f.key];
    if (ix == null || ix < 0) continue;
    if (used.has(ix)) dup.push(f.key);
    else used.set(ix, f.key);
  }
  return { missing, dup };
}

/** Excel ochadigan CSV («;», BOM, qoʻshtirnoq). */
export function toCsv(rows: string[][]): string {
  return (
    "﻿" +
    rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";"),
      )
      .join("\r\n")
  );
}

/** «A», «B» … «AA» — ustun harfi. */
export function columnLetter(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
