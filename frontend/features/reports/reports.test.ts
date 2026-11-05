import { describe, expect, it } from "vitest";
import { visibleReports } from "./catalog";
import { salesExportHref } from "./sales-report";
import { canSeeSupplierGoods, supplierGoodsExportHref } from "./supplier-goods-report";
import { formatMinutes, workerExportHref } from "./worker-report";

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

  it("yigʻuvchi / markirovkachi: eksport havolasi va daqiqa", () => {
    expect(workerExportHref("PICKERS", { branchId: 2, from: "2026-11-01", to: "2026-11-05" })).toBe(
      "/api/reports/pickers/export?branchId=2&from=2026-11-01&to=2026-11-05",
    );
    expect(workerExportHref("MARKERS", { branchId: null, from: "2026-11-01", to: "2026-11-01" })).toBe(
      "/api/reports/markers/export?from=2026-11-01&to=2026-11-01",
    );
    expect(formatMinutes(45)).toBe("45 daq");
    expect(formatMinutes(125)).toBe("2 soat 05 daq");
  });

  it("taʼminotchi tovari: tannarx ruxsati shart, eksport havolasi", () => {
    expect(visibleReports(["reports.view"]).map((r) => r.key)).not.toContain("suppliers");
    expect(visibleReports(["reports.view", "prices.cost"]).map((r) => r.key)).toContain("suppliers");
    expect(canSeeSupplierGoods(["prices.cost"])).toBe(false);
    expect(supplierGoodsExportHref("COMPANY", { branchId: 1, from: "2026-11-01", to: "2026-11-05" })).toBe(
      "/api/reports/supplier-goods/export?kind=COMPANY&branchId=1&from=2026-11-01&to=2026-11-05",
    );
  });
});
