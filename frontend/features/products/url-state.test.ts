import { describe, expect, it } from "vitest";
import { mergeColumnPrefs, moveColumn } from "@/components/ui/columns-menu";
import { DEFAULT_FILTERS, activeFilterCount, apiStatus, exportQuery, parseFilters, serializeFilters, toQuery } from "./url-state";

describe("mahsulot filtrlari URL'da", () => {
  it("standart qiymatlar boʻsh URL beradi", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(parseFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
  });
  it("aylanma: serialize → parse (bir nechta qiymatli filtrlar)", () => {
    const f = {
      ...DEFAULT_FILTERS,
      q: "парацетамол",
      view: "MARKED" as const,
      manufacturers: [7, 9],
      countries: [3],
      supply: [12],
      statuses: ["INACTIVE" as const],
      sort: "STOCK" as const,
      desc: true,
      page: 3,
      size: 100 as const,
    };
    expect(parseFilters(new URLSearchParams(serializeFilters(f)))).toEqual(f);
  });
  it("notoʻgʻri qiymatlar standartga qaytadi", () => {
    const f = parseFilters(new URLSearchParams("manufacturer=abc&status=X&page=-2&size=7&view=bad&sort=ZZZ"));
    expect(f).toEqual(DEFAULT_FILTERS);
  });
  it("faol filtrlar va API soʻrovi", () => {
    const f = { ...DEFAULT_FILTERS, categories: [2], statuses: ["ACTIVE" as const], page: 2 };
    expect(activeFilterCount(f)).toBe(2);
    expect(toQuery(f, 5)).toMatchObject({ categoryIds: [2], status: "ACTIVE", branchId: 5, facets: true, page: 1 });
    expect(apiStatus(["ACTIVE", "INACTIVE"])).toBe("ALL");
    expect(apiStatus([])).toBe("ALL");
  });
});

describe("eksport havolasi", () => {
  it("sahifalashsiz; tanlanganlar ids bilan", () => {
    expect(exportQuery({ ...DEFAULT_FILTERS, q: "nimesil", page: 4 }, null)).toBe("q=nimesil&view=ALL&status=ALL&sort=NAME&desc=false");
    expect(exportQuery({ ...DEFAULT_FILTERS, manufacturers: [1, 2] }, null, [5, 6])).toContain("manufacturerIds=1%2C2");
    expect(exportQuery(DEFAULT_FILTERS, null, [5, 6])).toContain("ids=5%2C6");
  });
});

describe("ustunlar sozlamasi", () => {
  it("xotiradagi tartib saqlanadi, yangi ustun oxiriga, notanishi tashlanadi", () => {
    expect(
      mergeColumnPrefs(
        [
          { key: "b", visible: false },
          { key: "x", visible: true },
        ],
        ["a", "b", "c"],
      ),
    ).toEqual([
      { key: "b", visible: false },
      { key: "a", visible: true },
      { key: "c", visible: true },
    ]);
    expect(mergeColumnPrefs("buzuq", ["a"])).toEqual([{ key: "a", visible: true }]);
  });
  it("sudrab koʻchirish", () => {
    const cols = ["a", "b", "c"].map((key) => ({ key, visible: true }));
    expect(moveColumn(cols, 0, 2).map((c) => c.key)).toEqual(["b", "c", "a"]);
    expect(moveColumn(cols, 0, 9)).toBe(cols);
  });
});
