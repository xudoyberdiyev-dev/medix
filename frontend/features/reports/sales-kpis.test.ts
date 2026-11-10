import { describe, expect, it } from "vitest";
import { averageDoc, barShare, dayBars, maxAbsCents, previousRange, returnShare } from "./sales-kpis";

describe("sales-kpis", () => {
  it("oldingi teng davr", () => {
    expect(previousRange("2026-11-10", "2026-11-10")).toEqual({ from: "2026-11-09", to: "2026-11-09" });
    expect(previousRange("2026-11-01", "2026-11-10")).toEqual({ from: "2026-10-22", to: "2026-10-31" });
    expect(previousRange("2026-03-01", "2026-03-07")).toEqual({ from: "2026-02-22", to: "2026-02-28" });
  });

  it("oʻrtacha hujjat summasi — butun arifmetika, yarmi yuqoriga", () => {
    expect(averageDoc("100.00", 3)).toBe("33.33");
    expect(averageDoc("0.05", 2)).toBe("0.03");
    expect(averageDoc("1250000.00", 0)).toBeNull();
    expect(averageDoc("-10.00", 4)).toBe("-2.50");
  });

  it("qaytarish ulushi", () => {
    expect(returnShare("25.00", "200.00")).toBe("12,5%");
    expect(returnShare("1.00", "3.00")).toBe("33,3%");
    expect(returnShare("0.00", "0.00")).toBe("0,0%");
  });
});

describe("dayBars", () => {
  it("boʻsh kunlar nol bilan, tartib boʻyicha", () => {
    const bars = dayBars("2026-11-01", "2026-11-03", [{ key: "2026-11-02", net: "10.00", orders: 2 }]);
    expect(bars).toEqual([
      { date: "2026-11-01", net: "0.00", orders: 0 },
      { date: "2026-11-02", net: "10.00", orders: 2 },
      { date: "2026-11-03", net: "0.00", orders: 0 },
    ]);
  });

  it("uzun davrda faqat savdo boʻlgan kunlar; ulush modul boʻyicha", () => {
    const bars = dayBars("2026-01-01", "2026-12-31", [
      { key: "2026-05-02", net: "-5.00", orders: 1 },
      { key: "2026-03-01", net: "10.00", orders: 1 },
    ]);
    expect(bars.map((b) => b.date)).toEqual(["2026-03-01", "2026-05-02"]);
    const max = maxAbsCents(bars.map((b) => b.net));
    expect(max).toBe(1000n);
    expect(barShare("-5.00", max)).toBe(0.5);
    expect(barShare("1.00", 0n)).toBe(0);
  });
});
