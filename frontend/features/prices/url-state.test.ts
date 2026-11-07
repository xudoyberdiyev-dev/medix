import { describe, expect, it } from "vitest";
import { parsePriceFilters, priceExportQuery, priceSortFromKey, priceSortKey, serializePriceFilters } from "./url-state";

describe("narxlar URL holati", () => {
  it("standart — URL toza", () => {
    const f = parsePriceFilters(new URLSearchParams(""));
    expect(f).toEqual({ q: "", manufacturerId: null, at: null, sort: "NAME", desc: false, page: 1, size: 50 });
    expect(serializePriceFilters(f)).toBe("");
  });

  it("filtrlar, sana va saralash qaytadi", () => {
    const qs = "q=nimesil&mf=3&at=2026-11-01&sort=MANUFACTURER&desc=1&page=2&size=25";
    const f = parsePriceFilters(new URLSearchParams(qs));
    expect(f).toMatchObject({ q: "nimesil", manufacturerId: 3, at: "2026-11-01", sort: "MANUFACTURER", desc: true, page: 2, size: 25 });
    expect(serializePriceFilters(f)).toBe(qs);
  });

  it("notoʻgʻri qiymatlar — standart", () => {
    expect(parsePriceFilters(new URLSearchParams("at=01.11.2026&sort=PRICE&mf=-1"))).toMatchObject({
      at: null,
      sort: "NAME",
      manufacturerId: null,
    });
  });

  it("eksport — filial, filtr, sana va saralash bilan, sahifasiz", () => {
    const f = parsePriceFilters(new URLSearchParams("q=a&mf=3&at=2026-11-01&sort=CODE&desc=1&page=4"));
    expect(priceExportQuery(7, f)).toBe("branchId=7&q=a&manufacturerId=3&at=2026-11-01&sort=CODE&desc=true");
  });

  it("ustun ↔ saralash", () => {
    expect(priceSortFromKey(priceSortKey("MANUFACTURER"))).toBe("MANUFACTURER");
    expect(priceSortFromKey("t5")).toBe("NAME");
  });
});
