import { describe, expect, it } from "vitest";
import { groupedReports, REPORTS, visibleReports } from "./catalog";
import { expenseExportHref, initialDirection } from "./expense-report";
import { drillFilter, formatMargin, initialProductGroupBy, productSalesExportHref } from "./product-sales-report";
import { drillReturns, initialReturnsGroupBy, returnsExportHref } from "./returns-report";
import { initialGroupBy, isPaymentType, salesExportHref, salesRowHref } from "./sales-report";
import { canSeeSupplierGoods, supplierGoodsExportHref } from "./supplier-goods-report";
import { formatMinutes, workerExportHref } from "./worker-report";

describe("hisobotlar", () => {
  it("katalog ruxsat boʻyicha", () => {
    expect(visibleReports(["reports.own"]).map((r) => r.key)).toEqual(["sales", "returns"]);
    expect(visibleReports(["reports.pickers"]).map((r) => r.key)).toEqual(["pickers"]);
    expect(visibleReports(["reports.view"]).map((r) => r.key)).toContain("operators");
    expect(visibleReports(["reports.view"]).map((r) => r.key)).not.toContain("gross-profit");
    expect(visibleReports(["reports.view", "prices.cost"]).map((r) => r.key)).toContain("gross-profit");
    expect(visibleReports([])).toHaveLength(0);
  });

  it("katalog guruhlari prototip tartibida, boʻsh guruh tashlanadi", () => {
    const all = ["reports.view", "prices.cost", "transfer.view", "reports.pickers", "cdebt.view", "audit.view"];
    expect(groupedReports(all).map((g) => g.group)).toEqual(["sales", "group", "staff", "other"]);
    expect(groupedReports(["reports.own"]).map((g) => g.group)).toEqual(["sales"]);
    const other = groupedReports(["cdebt.view", "audit.view"]);
    expect(other).toHaveLength(1);
    expect(other[0].items.map((r) => [r.key, r.section])).toEqual([
      ["customer-debts", "money"],
      ["audit", "admin"],
    ]);
    expect(REPORTS.filter((r) => r.cost).map((r) => r.key)).toEqual(["gross-profit"]);
    expect(visibleReports(["reports.view", "prices.cost"]).find((r) => r.key === "supplier-company")?.href).toBe(
      "/reports/supplier-goods?kind=COMPANY",
    );
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
    expect(
      productSalesExportHref({
        branchId: null,
        from: "2026-11-01",
        to: "2026-11-01",
        groupBy: "PRODUCT",
        categoryId: 4,
        manufacturerId: 7,
      }),
    ).toBe("/api/reports/product-sales/export?from=2026-11-01&to=2026-11-01&groupBy=PRODUCT&categoryId=4&manufacturerId=7");
    expect(drillFilter("CATEGORY", { key: "4", name: "Antibiotiklar" })).toEqual({ kind: "category", id: 4, name: "Antibiotiklar" });
    expect(drillFilter("MANUFACTURER", { key: "7", name: "Nobel" })).toEqual({ kind: "manufacturer", id: 7, name: "Nobel" });
    expect(drillFilter("CATEGORY", { key: "", name: "" })).toBeNull();
    expect(drillFilter("PRODUCT", { key: "12", name: "Paracetamol" })).toBeNull();
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
    expect(visibleReports(["reports.view"]).map((r) => r.key)).not.toContain("supplier-staff");
    expect(visibleReports(["reports.view", "prices.cost"]).map((r) => r.key)).toContain("supplier-company");
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

describe("Qaytarishlar hisoboti", () => {
  it("katalog, eksport havolasi, URL guruhi va qatordan oʻtish", () => {
    expect(visibleReports(["reports.own"]).map((r) => r.key)).toContain("returns");
    expect(visibleReports(["cash.view"]).map((r) => r.key)).not.toContain("returns");
    expect(returnsExportHref({ branchId: 2, from: "2026-11-01", to: "2026-11-07", groupBy: "CUSTOMER", productId: 5 })).toBe(
      "/api/reports/returns/export?branchId=2&from=2026-11-01&to=2026-11-07&groupBy=CUSTOMER&productId=5",
    );
    expect(initialReturnsGroupBy("DAY")).toBe("DAY");
    expect(initialReturnsGroupBy("XYZ")).toBe("REASON");
    expect(drillReturns("CUSTOMER", { key: "9", name: "Dorixona" })).toEqual({
      kind: "customer",
      id: 9,
      name: "Dorixona",
      next: "PRODUCT",
    });
    expect(drillReturns("PRODUCT", { key: "3", name: "Paracetamol" })).toEqual({
      kind: "product",
      id: 3,
      name: "Paracetamol",
      next: "REASON",
    });
    expect(drillReturns("REASON", { key: "muddati yaqin", name: "Muddati yaqin" })).toBeNull();
    expect(drillReturns("DAY", { key: "2026-11-07", name: "07.11.2026" })).toBeNull();
  });
});
