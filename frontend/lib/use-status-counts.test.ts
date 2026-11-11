import { describe, expect, it } from "vitest";
import { matchesQuery } from "./use-status-counts";
import { filterCounts } from "@/features/inventory-counts/inventory-counts-page";

describe("roʻyxat qidiruvi", () => {
  it("boʻsh soʻrov — hammasi mos", () => {
    expect(matchesQuery("  ", ["HC-TSH-000001"])).toBe(true);
  });
  it("katta-kichik harfga qaramaydi, null qiymatlarni oʻtkazib yuboradi", () => {
    expect(matchesQuery("asosiy", [null, "Asosiy ombor"])).toBe(true);
    expect(matchesQuery("seyf", [undefined, "Asosiy ombor"])).toBe(false);
  });
  it("inventarizatsiya: raqam, ombor yoki komissiya boʻyicha", () => {
    const rows = [
      { number: "IN-TSH-000001", warehouse: "Markaziy ombor", commission: "Dilshod Aliyev, Olim Omborov" },
      { number: "IN-TSH-000002", warehouse: "Sovuq ombor" },
    ];
    expect(filterCounts(rows, "olim").map((r) => r.number)).toEqual(["IN-TSH-000001"]);
    expect(filterCounts(rows, "sovuq").map((r) => r.number)).toEqual(["IN-TSH-000002"]);
    expect(filterCounts(rows, "")).toHaveLength(2);
  });
});
