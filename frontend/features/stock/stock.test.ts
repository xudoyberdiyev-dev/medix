import { describe, expect, it } from "vitest";
import { expiryState, stockExportHref } from "./stock-page";

describe("expiryState", () => {
  it("chegaralar", () => {
    expect(expiryState(-1)).toBe("expired");
    expect(expiryState(0)).toBe("expiring");
    expect(expiryState(90)).toBe("expiring");
    expect(expiryState(91)).toBe("valid");
  });
});

describe("stockExportHref", () => {
  it("filtrlar URL ga", () => {
    expect(stockExportHref({ q: "", warehouseId: null, sellableOnly: false })).toBe("/api/stock/export");
    expect(stockExportHref({ q: "para 500", warehouseId: "3", sellableOnly: true, expiringWithinDays: 30 })).toBe(
      "/api/stock/export?q=para+500&warehouseId=3&sellableOnly=true&expiringWithinDays=30",
    );
    expect(stockExportHref({ q: "", warehouseId: null, sellableOnly: false, sort: "QTY", desc: true })).toBe(
      "/api/stock/export?sort=QTY&desc=true",
    );
  });
});
