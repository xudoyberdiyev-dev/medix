import { describe, expect, it } from "vitest";
import { bucketOf, fitsPay, inPayTab } from "./payables-model";

const inv = (o: Partial<Parameters<typeof bucketOf>[0]>) => ({
  number: "KR-TSH-000100",
  supplier: "Novo Nordisk",
  owner: "Aziz",
  left: "100.00",
  paid: "0.00",
  prepaid: false,
  days: 5,
  paymentType: "CASH",
  branchId: 1,
  supplierId: 7,
  ...o,
});

describe("YB qarzi kirimlar boʻyicha", () => {
  it("toʻlov kuni boʻlagi", () => {
    expect(bucketOf(inv({ days: -2 }))).toBe("late");
    expect(bucketOf(inv({ days: 0 }))).toBe("today");
    expect(bucketOf(inv({ days: 3 }))).toBe("3d");
    expect(bucketOf(inv({ days: 9 }))).toBe("open");
    expect(bucketOf(inv({ left: "0.00", days: null }))).toBe("paid");
  });

  it("yorliqlar va filtrlar", () => {
    const pre = inv({ left: "0.00", prepaid: true, days: null });
    expect(inPayTab(pre, "all")).toBe(true);
    expect(inPayTab(pre, "prepaid")).toBe(true);
    expect(inPayTab(inv({ days: -1 }), "late")).toBe(true);
    const f = { q: "", suppliers: [], branches: [], payTypes: [], owners: [] };
    expect(fitsPay(inv({}), { ...f, q: "ново" })).toBe(true);
    expect(fitsPay(inv({}), { ...f, payTypes: ["TRANSFER"] })).toBe(false);
    expect(fitsPay(inv({ owner: null }), { ...f, owners: [""] })).toBe(true);
  });
});
