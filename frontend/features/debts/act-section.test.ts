import { describe, expect, it } from "vitest";
import { actPdfUrl } from "./act-section";

describe("actPdfUrl", () => {
  it("mijoz va yetkazib beruvchi uchun server PDF manzili", () => {
    expect(actPdfUrl({ side: "CUSTOMER", counterpartyId: 7, branchId: 2 }, "2026-11-01", "2026-11-06")).toBe(
      "/api/debts/customers/7/act/pdf?branchId=2&from=2026-11-01&to=2026-11-06",
    );
    expect(actPdfUrl({ side: "SUPPLIER", counterpartyId: 3, branchId: 1 }, null, null)).toBe("/api/debts/suppliers/3/act/pdf?branchId=1");
  });
});
