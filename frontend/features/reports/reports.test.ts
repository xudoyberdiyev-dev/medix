import { describe, expect, it } from "vitest";
import { visibleReports } from "./catalog";
import { salesExportHref } from "./sales-report";

describe("hisobotlar", () => {
  it("katalog ruxsat boʻyicha", () => {
    expect(visibleReports(["reports.own"]).map((r) => r.key)).toEqual(["sales"]);
    expect(visibleReports(["reports.pickers"]).map((r) => r.key)).toEqual(["pickers"]);
    expect(visibleReports([])).toHaveLength(0);
  });

  it("eksport havolasi filtrlar bilan", () => {
    expect(salesExportHref({ branchId: 3, from: "2026-11-01", to: "2026-11-05", groupBy: "DAY" })).toBe(
      "/api/reports/sales/export?branchId=3&from=2026-11-01&to=2026-11-05&groupBy=DAY",
    );
    expect(salesExportHref({ branchId: null, from: "2026-11-01", to: "2026-11-01", groupBy: "CUSTOMER" })).not.toContain("branchId");
  });
});
