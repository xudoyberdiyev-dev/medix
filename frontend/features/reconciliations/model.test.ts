import { describe, expect, it } from "vitest";
import { canStep, diffAmount, favor, filterRecons, quickPeriods, tabCounts } from "./model";

const rows = [
  { number: "AS-TSH-000001", counterparty: "Shifo Farm", side: "CUSTOMER" as const, status: "MADE" as const },
  { number: "AS-TSH-000002", counterparty: "Novo Nordisk", side: "SUPPLIER" as const, status: "DIFF" as const },
  { number: "AS-TSH-000003", counterparty: "Shifo Farm", side: "CUSTOMER" as const, status: "SIGNED" as const },
];

describe("akt sverka roʻyxati", () => {
  it("yorliq, tur va qidiruv (kirill ham)", () => {
    expect(filterRecons(rows, { tab: "all", sides: [], q: "" })).toHaveLength(3);
    expect(filterRecons(rows, { tab: "DIFF", sides: [], q: "" }).map((r) => r.number)).toEqual(["AS-TSH-000002"]);
    expect(filterRecons(rows, { tab: "all", sides: ["SUPPLIER"], q: "" })).toHaveLength(1);
    expect(filterRecons(rows, { tab: "all", sides: [], q: "шифо" })).toHaveLength(2);
    expect(filterRecons(rows, { tab: "all", sides: [], q: "000003" })).toHaveLength(1);
  });

  it("yorliqlar soni", () => {
    expect(tabCounts(rows)).toEqual({ all: 3, MADE: 1, SENT: 0, SIGNED: 1, DIFF: 1 });
  });
});

describe("holat va hisob", () => {
  it("oʻtishlar serverdagidek", () => {
    expect(canStep("MADE", "SENT")).toBe(true);
    expect(canStep("MADE", "SIGNED")).toBe(false);
    expect(canStep("SENT", "DIFF")).toBe(true);
    expect(canStep("DIFF", "SIGNED")).toBe(true);
    expect(canStep("SIGNED", "DIFF")).toBe(false);
  });

  it("qoldiq kimning foydasiga", () => {
    expect(favor("0.00", "CUSTOMER")).toEqual({ zero: true });
    expect(favor("600.00", "CUSTOMER")).toEqual({ zero: false, debtorIsParty: true, advance: false, abs: "600.00" });
    expect(favor("-300.00", "CUSTOMER")).toEqual({ zero: false, debtorIsParty: false, advance: true, abs: "300.00" });
    expect(favor("800.00", "SUPPLIER")).toMatchObject({ debtorIsParty: false, advance: false });
  });

  it("farq tiyinda", () => {
    expect(diffAmount("500.00", "600.00")).toBe("-100.00");
    expect(diffAmount("600.10", "600.05")).toBe("0.05");
    expect(diffAmount("-10.5", "0.00")).toBe("-10.50");
  });

  it("tezkor davrlar", () => {
    const p = quickPeriods("2026-11-09");
    expect(p.month).toEqual(["2026-11-01", "2026-11-09"]);
    expect(p.lastMonth).toEqual(["2026-10-01", "2026-10-31"]);
    expect(p.lastQ).toEqual(["2026-07-01", "2026-09-30"]);
    expect(p.ytd).toEqual(["2026-01-01", "2026-11-09"]);
    expect(quickPeriods("2026-02-15").lastQ).toEqual(["2025-10-01", "2025-12-31"]);
  });
});
