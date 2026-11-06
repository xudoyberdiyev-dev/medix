import { describe, expect, it } from "vitest";
import { DEFAULT_STOCK_FILTERS, parseStockFilters, serializeStockFilters } from "./url-state";

describe("Qoldiqlar filtrlari URL'da", () => {
  it("standart qiymatlar yozilmaydi, qolganlari aylanib qaytadi", () => {
    expect(serializeStockFilters(DEFAULT_STOCK_FILTERS)).toBe("");
    const f = { q: "para", warehouseId: "3", sellableOnly: true, days: "30", page: 2, size: 100 as const };
    expect(parseStockFilters(new URLSearchParams(serializeStockFilters(f)))).toEqual(f);
  });

  it("notoʻgʻri qiymatlar standartga tushadi", () => {
    expect(parseStockFilters(new URLSearchParams("warehouse=abc&days=7&page=-1&size=13&sellable=yes"))).toEqual(DEFAULT_STOCK_FILTERS);
  });
});
