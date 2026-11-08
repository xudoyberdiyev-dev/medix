import { describe, expect, it } from "vitest";
import {
  PRODUCT_FIELDS,
  autoMap,
  columnLetter,
  dataRows,
  mapFromProfile,
  mappingProblems,
  normHeader,
  profileFromMap,
  records,
  toCsv,
} from "./import-model";

describe("import-model", () => {
  it("sarlavhani lotin/kirill/rus farqsiz normallaydi", () => {
    expect(normHeader("Ishlab chiqaruvchi")).toBe("ishlabchiqaruvchi");
    expect(normHeader("Производитель")).toBe("proizvoditel");
    expect(normHeader("Код товара")).toBe("kodtovara");
    expect(normHeader("Цена")).toBe("cena");
  });

  it("SmartUp sarlavhalarini avtomatik moslaydi, har ustun bitta maydonga", () => {
    const h = [
      "Код товара",
      "Наименование",
      "Название по договору",
      "МНН",
      "Производитель",
      "Группа",
      "ИКПУ",
      "Farm ID",
      "Штрих-код",
      "Примечание",
    ];
    const m = autoMap(PRODUCT_FIELDS, h);
    expect(m).toMatchObject({
      code: 0,
      name: 1,
      contractName: 2,
      classifier: 3,
      maker: 4,
      cat: 5,
      ikpu: 6,
      farmId: 7,
      barcode: 8,
      note: 9,
    });
    expect(mappingProblems(PRODUCT_FIELDS, m)).toEqual({ missing: [], dup: [] });
  });

  it("majburiy va takror ustunni aniqlaydi", () => {
    const p = mappingProblems(PRODUCT_FIELDS, { name: 0, maker: 0 });
    expect(p.missing).toEqual(["classifier", "cat", "ikpu", "farmId"]);
    expect(p.dup).toEqual(["maker"]);
  });

  it("profil sarlavha nomi boʻyicha qoʻllanadi", () => {
    const h = ["A", "Nom", "Zavod"];
    expect(mapFromProfile({ name: "Nom", maker: "Zavod", code: "Yoʻq" }, h)).toEqual({ name: 1, maker: 2 });
    expect(profileFromMap({ name: 1, maker: 2, code: -1 }, h)).toEqual({ name: "Nom", maker: "Zavod" });
  });

  it("boʻsh qatorlar tashlanadi, tuzatishlar ustidan yoziladi", () => {
    const grid = [["Hisobot"], ["Nom", "Kod"], ["A", "1"], ["", ""], ["B", "2"]];
    expect(dataRows(grid, 2).map((r) => r.i)).toEqual([1, 2]);
    expect(records(grid, 2, { name: 0, code: 1 }, { 2: { code: "9" } })).toEqual([
      { row: 1, values: { name: "A", code: "1" } },
      { row: 2, values: { name: "B", code: "9" } },
    ]);
  });

  it("CSV va ustun harfi", () => {
    expect(toCsv([["a;b", 'c"d'], ["1"]])).toBe('﻿"a;b";"c""d"\r\n1');
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(26)).toBe("AA");
  });
});
