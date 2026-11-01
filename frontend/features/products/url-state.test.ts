import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, activeFilterCount, parseFilters, serializeFilters, toQuery } from "./url-state";

describe("mahsulot filtrlari URL'da", () => {
  it("standart qiymatlar boʻsh URL beradi", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(parseFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
  });
  it("aylanma: serialize → parse", () => {
    const f = {
      ...DEFAULT_FILTERS,
      q: "парацетамол",
      manufacturerId: 7,
      status: "ALL" as const,
      flag: "marked" as const,
      sort: "CODE" as const,
      desc: true,
      page: 3,
      size: 100 as const,
    };
    expect(parseFilters(new URLSearchParams(serializeFilters(f)))).toEqual(f);
  });
  it("notoʻgʻri qiymatlar standartga qaytadi", () => {
    const f = parseFilters(new URLSearchParams("manufacturer=abc&status=X&page=-2&size=7&flag=bad"));
    expect(f).toEqual(DEFAULT_FILTERS);
  });
  it("faol filtrlar va API soʻrovi", () => {
    const f = { ...DEFAULT_FILTERS, categoryId: 2, flag: "controlled" as const, page: 2 };
    expect(activeFilterCount(f)).toBe(2);
    expect(toQuery(f)).toMatchObject({ categoryId: 2, controlled: true, marked: undefined, page: 1 });
  });
});
