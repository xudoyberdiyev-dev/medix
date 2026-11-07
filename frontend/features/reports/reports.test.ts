import { describe, expect, it } from "vitest";
import { visibleReports } from "./catalog";
import { expenseExportHref, initialDirection } from "./expense-report";
import { formatMargin, initialProductGroupBy, productSalesExportHref } from "./product-sales-report";
import { initialGroupBy, isPaymentType, salesExportHref, salesRowHref } from "./sales-report";
import { canSeeSupplierGoods, supplierGoodsExportHref } from "./supplier-goods-report";
import { formatMinutes, workerExportHref } from "./worker-report";

describe("hisobotlar", () => {
  it("katalog ruxsat boʻyicha", () => {
    expect(visibleReports(["reports.own"]).map((r) => r.key)).toEqual(["sales"]);
    expect(visibleReports(["reports.pickers"]).map((r) => r.key)).toEqual(["pickers"]);
    expect(visibleReports(["reports.view"]).map((r) => r.key)).toContain("operators");
    expect(visibleReports(["reports.view"]).map((r) => r.key)).not.toContain("gross-profit");
    expect(visibleReports(["reports.view", "prices.cost"]).map((r) => r.key)).toContain("gross-profit");
    expect(visibleReports([])).toHaveLength(0);
  });

  it("mahsulotlar savdosi: katalog, eksport havolasi, rentabellik", () => {
    expect(visibleReports(["reports.view"]).map((r) => r.key)).toContain("products");
    expect(visibleReports(["reports.own"]).map((r) => r.key)).not.toContain("products");
    expect(productSalesExportHref({ branchId: 2, from: "2026-11-01", to: "2026-11-07", groupBy: "CATEGORY", customerId: 9 })).toBe(
      "/api/reports/product-sales/export?branchId=2&from=2026-11-01&to=2026-11-07&groupBy=CATEGORY&customerId=9",
    );
    expect(productSalesExportHref({ branchId: null, from: "2026-11-01", to: "2026-11-01", groupBy: "PRODUCT" })).toBe(
      "/api/reports/product-sales/export?from=2026-11-01&to=2026-11-01&groupBy=PRODUCT",
    );
    expect(formatMargin("40.3")).toBe("40,3 %");
    expect(formatMargin(null)).toBe("—");
    expect(initialProductGroupBy("MANUFACTURER")).toBe("MANUFACTURER");
    expect(initialProductGroupBy("CUSTOMER")).toBe("PRODUCT");
  });

  it("xarajatlar: katalog, eksport havolasi, yoʻnalish", () => {
    expect(visibleReports(["reports.all"]).map((r) => r.key)).toContain("expenses");
    expect(visibleReports(["reports.own"]).map((r) => r.key)).not.toContain("expenses");
    expect(expenseExportHref({ branchId: 1, from: "2026-11-01", to: "2026-11-07", direction: "OUT", groupBy: "ITEM" })).toBe(
      "/api/reports/expenses/export?branchId=1&from=2026-11-01&to=2026-11-07&direction=OUT&groupBy=ITEM",
    );
    expect(initialDirection("IN")).toBe("IN");
    expect(initialDirection(null)).toBe("OUT");
  });

  it("eksport havolasi filtrlar bilan", () => {
    expect(salesExportHref({ branchId: 3, from: "2026-11-01", to: "2026-11-05", groupBy: "DAY" })).toBe(
      "/api/reports/sales/export?branchId=3&from=2026-11-01&to=2026-11-05&groupBy=DAY",
    );
    expect(salesExportHref({ branchId: null, from: "2026-11-01", to: "2026-11-01", groupBy: "CUSTOMER" })).not.toContain("branchId");
    expect(
      salesExportHref({ branchId: 1, from: "2026-11-01", to: "2026-11-01", groupBy: "REGION", paymentType: "TRANSFER", regionId: 7 }),
    ).toBe("/api/reports/sales/export?branchId=1&from=2026-11-01&to=2026-11-01&groupBy=REGION&paymentType=TRANSFER&regionId=7");
    expect(isPaymentType("ONLINE")).toBe(true);
    expect(isPaymentType("")).toBe(false);
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

  it("savdo hisoboti: qatordan shu davr buyurtmalariga", () => {
    const period = { from: "2026-11-01", to: "2026-11-05" };
    expect(salesRowHref("CUSTOMER", { key: "12", name: "Dorixona A" })).toBe("/orders?customerId=12&customer=Dorixona+A");
    expect(salesRowHref("CUSTOMER", { key: "12", name: "Dorixona A" }, period)).toBe(
      "/orders?customerId=12&customer=Dorixona+A&soldFrom=2026-11-01&soldTo=2026-11-05",
    );
    expect(salesRowHref("OPERATOR", { key: "7", name: "Aziza" }, period, true)).toBe(
      "/orders?operatorId=7&operator=Aziza&soldFrom=2026-11-01&soldTo=2026-11-05&mine=1",
    );
    expect(salesRowHref("DAY", { key: "2026-11-05", name: "05.11.2026" }, period)).toBe("/orders?soldFrom=2026-11-05&soldTo=2026-11-05");
    expect(salesRowHref("BRANCH", { key: "1", name: "Toshkent" }, period)).toBeNull();
    expect(salesRowHref("CUSTOMER", { key: "", name: "Jami" })).toBeNull();
  });
});

describe("Savdo hisoboti: URL'dagi guruh", () => {
  it("ruxsat etilgan guruh qoʻllanadi, aks holda — Mijoz", () => {
    expect(initialGroupBy("OPERATOR", ["CUSTOMER", "OPERATOR", "BRANCH", "DAY"])).toBe("OPERATOR");
    expect(initialGroupBy("OPERATOR", ["CUSTOMER", "DAY"])).toBe("CUSTOMER");
    expect(initialGroupBy(null, ["CUSTOMER", "DAY"])).toBe("CUSTOMER");
  });
});
