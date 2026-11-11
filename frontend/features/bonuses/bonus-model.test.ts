import { describe, expect, it } from "vitest";
import { fitsBonus, inBonusTab, isLate, isSoon, type BonusFilterRow } from "./bonus-model";

const row = (o: Partial<BonusFilterRow>): BonusFilterRow => ({
  state: "PENDING",
  days: 10,
  amount: "100.00",
  supplier: "Nobel Pharmsanoat",
  receiptNumber: "KR-TSH-000102",
  supplierId: 1,
  branchId: 1,
  bonusDate: "2026-11-21",
  ...o,
});

describe("bonus-model", () => {
  it("koʻrinishlar: kutilmoqda / 3 kun ichida / kechikkan / tasdiqlandi / berilmadi", () => {
    expect(isSoon(row({ days: 0 }))).toBe(true);
    expect(isSoon(row({ days: 3 }))).toBe(true);
    expect(isSoon(row({ days: 4 }))).toBe(false);
    expect(isLate(row({ days: -1 }))).toBe(true);
    expect(isLate(row({ days: -1, state: "CONFIRMED" }))).toBe(false);
    expect(isSoon(row({ days: null }))).toBe(false);
    expect(inBonusTab(row({ state: "CONFIRMED" }), "ok")).toBe(true);
    expect(inBonusTab(row({ state: "DECLINED" }), "no")).toBe(true);
    expect(inBonusTab(row({ state: "DECLINED" }), "wait")).toBe(false);
    expect(inBonusTab(row({}), "all")).toBe(true);
  });

  it("qidiruv, YB, filial va sana filtrlari", () => {
    const f = { q: "", suppliers: [], branches: [] };
    expect(fitsBonus(row({}), { ...f, q: "nobel" })).toBe(true);
    expect(fitsBonus(row({ bnsNumber: "BNS-TSH-000004" }), { ...f, q: "bns-tsh-000004" })).toBe(true);
    expect(fitsBonus(row({}), { ...f, q: "krka" })).toBe(false);
    expect(fitsBonus(row({}), { ...f, suppliers: ["2"] })).toBe(false);
    expect(fitsBonus(row({}), { ...f, branches: ["1"] })).toBe(true);
    expect(fitsBonus(row({}), { ...f, from: "2026-11-21", to: "2026-11-30" })).toBe(true);
    expect(fitsBonus(row({}), { ...f, from: "2026-11-22" })).toBe(false);
    expect(fitsBonus(row({ bonusDate: null }), { ...f, to: "2026-11-30" })).toBe(false);
  });
});
