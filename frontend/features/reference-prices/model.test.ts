import { describe, expect, it } from "vitest";
import { autoMap } from "@/features/products/import-model";
import type { RefCompareRow } from "./api";
import { REF_FIELDS, toRefRows, visibleRows } from "./model";

function row(
  rowNo: number,
  status: RefCompareRow["status"],
  diffPct: string | null,
  name = `Dori ${rowNo}`,
  needsCheck = false,
): RefCompareRow {
  return { rowId: rowNo, rowNo, name, matchKind: "NAME", needsCheck, refPrice: "100.00", diffPct: diffPct ?? undefined, status };
}

describe("O14: referent narx — ustunlarni moslash", () => {
  it("rus va oʻzbek sarlavhalari avtomatik taniladi", () => {
    const ru = autoMap(REF_FIELDS, ["№", "Наименование", "Производитель", "Штрих-код", "ИКПУ", "Ед. изм.", "Цена"]);
    expect(ru).toEqual({ name: 1, manufacturer: 2, barcode: 3, ikpu: 4, unit: 5, price: 6 });
    const uz = autoMap(REF_FIELDS, ["Mahsulot kodi", "Mahsulot nomi", "Ishlab chiqaruvchi nomi", "Referent narx (QQS bilan)"]);
    expect(uz).toEqual({ code: 0, name: 1, manufacturer: 2, price: 3 });
  });

  it("qatorlar API shakliga: boʻsh — undefined, uzunlik cheklanadi", () => {
    expect(toRefRows([{ row: 3, values: { name: " Analgin ", price: "1 250,50", barcode: "", unit: "x".repeat(60) } }])).toEqual([
      {
        row: 3,
        name: "Analgin",
        price: "1 250,50",
        barcode: undefined,
        ikpu: undefined,
        code: undefined,
        manufacturer: undefined,
        unit: "x".repeat(50),
      },
    ]);
  });
});

describe("O14: natija yorliqlari", () => {
  const rows = [
    row(1, "EXPENSIVE", "5.00"),
    row(2, "EXPENSIVE", "12.50", "Ketorol", true),
    row(3, "CHEAP", "-3.00"),
    row(4, "NOT_FOUND", null),
  ];

  it("yorliq, farq % boʻyicha saralash, qidiruv", () => {
    expect(visibleRows(rows, "EXPENSIVE", "").map((r) => r.rowNo)).toEqual([2, 1]);
    expect(visibleRows(rows, "EXPENSIVE", "", "asc").map((r) => r.rowNo)).toEqual([1, 2]);
    expect(visibleRows(rows, "EXPENSIVE", "keto").map((r) => r.rowNo)).toEqual([2]);
    expect(visibleRows(rows, "CHECK", "").map((r) => r.rowNo)).toEqual([2]);
    expect(visibleRows(rows, "NOT_FOUND", "").map((r) => r.rowNo)).toEqual([4]);
  });
});
