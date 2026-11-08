import { describe, expect, it } from "vitest";
import { DEFAULT_STOCK_FILTERS, parseStockFilters, serializeStockFilters, stockSortColumn } from "./url-state";

describe("Qoldiqlar filtrlari URL'da", () => {
  it("standart qiymatlar yozilmaydi, qolganlari aylanib qaytadi", () => {
    expect(serializeStockFilters(DEFAULT_STOCK_FILTERS)).toBe("");
    const f = {
      q: "para",
      warehouseId: "3",
      sellableOnly: true,
      days: "30",
      sort: "QTY" as const,
      desc: true,
      page: 2,
      size: 100 as const,
    };
    expect(parseStockFilters(new URLSearchParams(serializeStockFilters(f)))).toEqual(f);
  });

  it("notoʻgʻri qiymatlar standartga tushadi", () => {
    expect(parseStockFilters(new URLSearchParams("warehouse=abc&days=7&page=-1&size=13&sellable=yes&sort=COST"))).toEqual(
      DEFAULT_STOCK_FILTERS,
    );
  });

  it("saralash ustuni: standart — nom, Muddat nazoratida — yaroqlilik", () => {
    expect(stockSortColumn({ sort: null }, "stock")).toBe("productName");
    expect(stockSortColumn({ sort: null }, "expiry")).toBe("expiryDate");
    expect(stockSortColumn({ sort: "WAREHOUSE" }, "expiry")).toBe("warehouse");
  });
});
