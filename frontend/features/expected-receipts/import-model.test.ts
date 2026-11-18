import { describe, expect, it } from "vitest";
import { autoMap } from "@/features/products/import-model";
import { importable, importRows, importTone, KK_IMPORT_FIELDS } from "./import-model";

describe("KK — YB faylidan qatorlar", () => {
  it("rus va oʻzbek sarlavhalarini avtomatik moslaydi", () => {
    const m = autoMap(KK_IMPORT_FIELDS, ["№", "Наименование", "Штрихкод", "Кол-во", "Цена", "НДС", "Серия", "Срок годности"]);
    expect(m).toMatchObject({ name: 1, barcode: 2, qty: 3, price: 4, vat: 5, batch: 6, expiry: 7 });
    const u = autoMap(KK_IMPORT_FIELDS, ["Mahsulot nomi", "Soni", "Narxi", "Partiya"]);
    expect(u).toMatchObject({ name: 0, qty: 1, price: 2, batch: 3 });
  });

  it("nomsiz va kodsiz qatorlarni (jami, izoh) tashlaydi", () => {
    const grid = [
      ["Nomi", "Soni"],
      ["Paratsetamol", "10"],
      ["", "10"],
      ["Ibuprofen", " 5 "],
    ];
    const rows = importRows(grid, 1, { name: 0, qty: 1 });
    expect(rows.map((r) => [r.row, r.name, r.qty, r.barcode])).toEqual([
      [1, "Paratsetamol", "10", ""],
      [3, "Ibuprofen", "5", ""],
    ]);
  });

  it("qoʻshiladigan qator: mahsulot topilgan va soni bor", () => {
    expect(importable({ productId: 1, qty: 5, problems: [] })).toBe(true);
    expect(importTone({ productId: 1, qty: 5, problems: ["productGuess"] })).toBe("check");
    expect(importTone({ productId: null, qty: 5, problems: ["product"] })).toBe("skip");
    expect(importTone({ productId: 1, qty: null, problems: ["qty"] })).toBe("skip");
  });
});
