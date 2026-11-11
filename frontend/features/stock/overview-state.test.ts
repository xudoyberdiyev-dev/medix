import { describe, expect, it } from "vitest";
import {
  DEFAULT_OVERVIEW,
  NEAR_BUCKETS,
  batchQuery,
  hasAnyFilter,
  hasMoreFilters,
  kpiActive,
  kpiPatch,
  parseOverview,
  productQuery,
  serializeOverview,
} from "./overview-state";

describe("qoldiqlar ekrani URL holati", () => {
  it("standart qiymatlar URL'ga yozilmaydi", () => {
    expect(serializeOverview(DEFAULT_OVERVIEW)).toBe("");
    expect(parseOverview(new URLSearchParams(""))).toEqual(DEFAULT_OVERVIEW);
  });

  it("filtrlar qaytadan oʻqiladi, notoʻgʻri qiymatlar tashlanadi", () => {
    const f = parseOverview(
      new URLSearchParams(
        "view=batch&q=para&wh=3,x,3,5&zone=QUARANTINE,BAD&exp=EXPIRED&stock=ZERO&maker=7&flag=BONUS&psort=SALE_SUM&desc=1&page=2&size=100",
      ),
    );
    expect(f.view).toBe("batch");
    expect(f.warehouses).toEqual([3, 5]);
    expect(f.zones).toEqual(["QUARANTINE"]);
    expect(f.expiry).toEqual(["EXPIRED"]);
    expect(f.sort).toBe("SALE_SUM");
    expect(f.size).toBe(100);
    expect(parseOverview(new URLSearchParams(serializeOverview(f)))).toEqual(f);
    expect(hasMoreFilters(f)).toBe(true);
    expect(hasAnyFilter({ ...DEFAULT_OVERVIEW, stock: ["ZERO"] })).toBe(true);
  });

  it("kartalar filtrni yoqadi va oʻchiradi", () => {
    const on = { ...DEFAULT_OVERVIEW, ...kpiPatch(DEFAULT_OVERVIEW, "near") };
    expect(on.expiry).toEqual(NEAR_BUCKETS);
    expect(kpiActive(on, "near")).toBe(true);
    expect(kpiActive(on, "expired")).toBe(false);
    const off = { ...on, ...kpiPatch(on, "near") };
    expect(off.expiry).toEqual([]);
    const quar = { ...on, ...kpiPatch(on, "quar") };
    expect(quar.zones).toEqual(["QUARANTINE"]);
    expect(quar.expiry).toEqual([]);
  });

  it("«Yoʻlda» kartasi: yoqiladi, URL'da, boshqa kartalar oʻchadi", () => {
    const tr = { ...DEFAULT_OVERVIEW, expiry: NEAR_BUCKETS, ...kpiPatch({ ...DEFAULT_OVERVIEW, expiry: NEAR_BUCKETS }, "transit") };
    expect(tr.transit).toBe(true);
    expect(tr.expiry).toEqual([]);
    expect(kpiActive(tr, "transit")).toBe(true);
    expect(kpiActive({ ...tr, expiry: NEAR_BUCKETS }, "near")).toBe(false);
    expect(serializeOverview(tr)).toBe("transit=1");
    expect(parseOverview(new URLSearchParams("transit=1")).transit).toBe(true);
    expect({ ...tr, ...kpiPatch(tr, "transit") }.transit).toBe(false);
  });

  it("server soʻrovi: boʻsh roʻyxatlar yuborilmaydi, sahifa 0 dan", () => {
    const q = productQuery({ ...DEFAULT_OVERVIEW, suppliers: [0, 4], page: 3 }, 2);
    expect(q.supplierId).toEqual([0, 4]);
    expect(q.warehouseId).toBeUndefined();
    expect(q.page).toBe(2);
    expect(q.branchId).toBe(2);
  });
});

describe("ombor daraxti", () => {
  it("view=wh oʻqiladi", () => {
    expect(parseOverview(new URLSearchParams("view=wh")).view).toBe("wh");
    expect(serializeOverview({ ...DEFAULT_OVERVIEW, view: "wh" })).toBe("view=wh");
  });

  it("partiya koʻrinishi: bsort URL'da, soʻrovda filtrlar umumiy, saralash — bsort", () => {
    const f = parseOverview(new URLSearchParams("view=batch&zone=QUARANTINE&psort=TOTAL&bsort=SALE_SUM&desc=1"));
    expect(f.bsort).toBe("SALE_SUM");
    expect(serializeOverview(f)).toContain("bsort=SALE_SUM");
    const q = batchQuery(f, 3);
    expect(q).toMatchObject({ branchId: 3, zoneType: ["QUARANTINE"], sort: "SALE_SUM", desc: true, page: 0, size: 25 });
    expect(batchQuery(parseOverview(new URLSearchParams("bsort=BAD")), null).sort).toBeUndefined();
  });
});
