import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./search";

describe("normalizeSearch", () => {
  it("kirill va lotin bir xil", () => {
    expect(normalizeSearch("Парацетамол")).toBe(normalizeSearch("paracetamol"));
    expect(normalizeSearch("Ципрофлоксацин")).toBe(normalizeSearch("Ciprofloxacin"));
    expect(normalizeSearch("Хоразм")).toBe(normalizeSearch("Xorazm"));
    expect(normalizeSearch("Ғишт")).toBe("gisht");
    expect(normalizeSearch("Oʻzbekiston")).toBe(normalizeSearch("Ўзбекистон"));
  });
});

describe("matchesSearch", () => {
  it("har bir soʻz biror maydonda boʻlishi kerak", () => {
    expect(matchesSearch("берлин герм", ["Berlin-Chemie", "Germaniya"])).toBe(true);
    expect(matchesSearch("berlin rossiya", ["Berlin-Chemie", "Germaniya"])).toBe(false);
    expect(matchesSearch("  ", ["x"])).toBe(true);
  });
});
