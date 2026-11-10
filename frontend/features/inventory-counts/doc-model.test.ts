import { describe, expect, it } from "vitest";
import { dayToIso, isoToDay, lineTabs, scopeCount, startErrors, toggleMember, type DraftForm, type ScopeOptions } from "./doc-model";

const opts: ScopeOptions = {
  zones: [
    { id: 1, name: "Asosiy saqlash", type: "MAIN", batches: 3, lockedBy: undefined },
    { id: 2, name: "Karantin", type: "QUARANTINE", batches: 1, lockedBy: "IN-TSH-000007" },
  ],
  products: [
    {
      id: 10,
      code: "1",
      name: "Paratsetamol",
      category: "Analgetik",
      zones: [
        { zoneId: 1, batches: 2 },
        { zoneId: 2, batches: 1 },
      ],
    },
    { id: 11, code: "2", name: "Sitramon", category: "Analgetik", zones: [{ zoneId: 1, batches: 1 }] },
  ],
  staff: [
    { id: 100, name: "Sardor Aliyev" },
    { id: 101, name: "Farrux Ismoilov" },
  ],
};

const form = (p: Partial<DraftForm> = {}): DraftForm => ({
  warehouseId: 5,
  countDate: "11.11.2026",
  scopeMode: "ZONES",
  zoneIds: [1],
  productIds: [],
  memberIds: [100, 101],
  chairId: 100,
  blind: true,
  ...p,
});

describe("inventarizatsiya hujjati modeli (prototip InventoryDoc)", () => {
  it("qamrovdagi qatorlar soni: butun ombor, zonalar, mahsulotlar (zonalar ixtiyoriy)", () => {
    expect(scopeCount(opts, form({ scopeMode: "WAREHOUSE", zoneIds: [] }))).toBe(4);
    expect(scopeCount(opts, form({ zoneIds: [1] }))).toBe(3);
    expect(scopeCount(opts, form({ zoneIds: [] }))).toBe(0);
    expect(scopeCount(opts, form({ scopeMode: "PRODUCTS", zoneIds: [], productIds: [10] }))).toBe(3);
    expect(scopeCount(opts, form({ scopeMode: "PRODUCTS", zoneIds: [1], productIds: [10] }))).toBe(2);
    expect(scopeCount(undefined, form())).toBe(0);
  });

  it("boshlash xatolari: zona, mahsulot, komissiya, rais, boʻsh qamrov, band zona", () => {
    expect(startErrors(form(), opts, null)).toEqual([]);
    expect(startErrors(form({ zoneIds: [] }), opts, null).map((e) => e.key)).toContain("eZones");
    expect(startErrors(form({ scopeMode: "PRODUCTS", zoneIds: [1] }), opts, null).map((e) => e.key)).toContain("ePids");
    expect(startErrors(form({ memberIds: [100] }), opts, null).map((e) => e.key)).toContain("eComm");
    expect(startErrors(form({ chairId: null }), opts, null).map((e) => e.key)).toContain("eChair");
    expect(startErrors(form({ zoneIds: [2] }), opts, null)).toContainEqual({ k: "zones", key: "eBusy", z: "Karantin", n: "IN-TSH-000007" });
    // Oʻzining qulfi — xato emas
    expect(startErrors(form({ zoneIds: [2] }), opts, "IN-TSH-000007")).toEqual([]);
    expect(startErrors(form({ warehouseId: null }), undefined, null).map((e) => e.key)).toEqual(["eWh"]);
  });

  it("komissiya: birinchi aʼzo — rais, rais olib tashlansa — boʻsh", () => {
    let f = toggleMember({ memberIds: [], chairId: null }, 100);
    expect(f).toEqual({ memberIds: [100], chairId: 100 });
    f = toggleMember(f, 101);
    expect(f).toEqual({ memberIds: [100, 101], chairId: 100 });
    expect(toggleMember(f, 100)).toEqual({ memberIds: [101], chairId: null });
  });

  it("qator yorliqlari va sana", () => {
    expect(lineTabs(false)).toEqual(["all", "todo", "done"]);
    expect(lineTabs(true)).toEqual(["all", "diff", "short", "over"]);
    expect(isoToDay("2026-11-11")).toBe("11.11.2026");
    expect(dayToIso("11.11.2026")).toBe("2026-11-11");
    expect(dayToIso("31.02.2026")).toBeNull();
    expect(dayToIso("2026-11-11")).toBeNull();
  });
});

describe("sanoq ekrani", () => {
  it("kiritilgan miqdor: boʻsh, butun son (nuqta — minglik), notoʻgʻri", async () => {
    const { parseCount } = await import("./inventory-count-screen");
    expect(parseCount("")).toBeNull();
    expect(parseCount(" 1.200 ")).toBe(1200);
    expect(parseCount("12a")).toBeNaN();
  });
});
