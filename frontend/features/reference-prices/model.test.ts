import { describe, expect, it } from "vitest";
import { autoMap } from "@/features/products/import-model";
import { formatPct, guessHeader, inTab, REF_FIELDS, visibleLines } from "./model";

describe("referent narxlar modeli", () => {
  it("UZ va RU sarlavhalarini taniydi", () => {
    expect(autoMap(REF_FIELDS, ["Naimenovanie", "Proizvoditel", "Shtrix-kod", "MXIK", "Referent narx"])).toEqual({
      name: 0,
      manufacturer: 1,
      barcode: 2,
      ikpu: 3,
      price: 4,
    });
    expect(autoMap(REF_FIELDS, ["Наименование", "Цена", "Ед. изм."])).toEqual({ name: 0, price: 1, unit: 2 });
  });

  it("«Topilmadi» yorligʻi narxsizlarni ham oladi", () => {
    expect(inTab("NOT_FOUND", "NO_PRICE")).toBe(true);
    expect(inTab("DEARER", "NO_PRICE")).toBe(false);
  });

  it("qidiradi va farq % boʻyicha saralaydi", () => {
    const lines = [
      { status: "DEARER" as const, name: "Analgin", diffPct: "5.00" },
      { status: "DEARER" as const, name: "Paratsetamol", diffPct: "12.50" },
      { status: "MATCH" as const, name: "Analgin forte", diffPct: "0.00" },
    ];
    expect(visibleLines(lines, "DEARER", "", "desc").map((l) => l.name)).toEqual(["Paratsetamol", "Analgin"]);
    expect(visibleLines(lines, "DEARER", "analg", null).map((l) => l.name)).toEqual(["Analgin"]);
  });

  it("foizni belgisi bilan koʻrsatadi", () => {
    expect(formatPct("11.11")).toBe("+11,11 %");
    expect(formatPct("-4.5")).toBe("−4,50 %");
    expect(formatPct(null)).toBe("—");
  });

  it("sarlavha qatorini topadi", () => {
    expect(guessHeader([["Narxlar roʻyxati"], ["Nomi", "Narx", "Birlik"], ["A", "1"]])).toBe(2);
  });
});
