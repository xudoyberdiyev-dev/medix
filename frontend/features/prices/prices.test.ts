import { describe, expect, it } from "vitest";
import { batchLines, CHANGE_VIEWS, isFiltered, isFuture, lineKey, percentChange } from "./api";

describe("percentChange", () => {
  it("foiz va chegaralar", () => {
    expect(percentChange("10000.00", "13000")).toBe(30);
    expect(percentChange("10000.00", "9999")).toBe(-0.01);
    expect(percentChange(null, "1")).toBeNull();
    expect(percentChange("0", "1")).toBeNull();
    expect(percentChange("100", "abc")).toBeNull();
  });
});

describe("batchLines", () => {
  it("partiya narxi ustun, boʻlmasa mahsulot narxi; kalit partiya bilan", () => {
    const lines = batchLines(
      {
        receiptId: 1,
        receiptNumber: "KR-TSH-000001",
        branchId: 1,
        supplier: "Pharma",
        receiptDate: "2026-11-05",
        items: [
          {
            batchId: 10,
            productId: 5,
            productCode: "1",
            productName: "A",
            batchNumber: "B1",
            expiryDate: "2028-01-31",
            bonus: false,
            qty: 3,
            batchPrices: { "1": "1100.00" },
            productPrices: { "1": "1200.00" },
          },
          {
            batchId: 11,
            productId: 5,
            productCode: "1",
            productName: "A",
            batchNumber: "B2",
            expiryDate: "2029-01-31",
            bonus: false,
            qty: 7,
            batchPrices: {},
            productPrices: { "1": "1200.00" },
          },
          {
            batchId: 12,
            productId: 6,
            productCode: "2",
            productName: "B",
            batchNumber: "B3",
            expiryDate: "2029-01-31",
            bonus: true,
            qty: 1,
            batchPrices: {},
            productPrices: {},
          },
        ],
      },
      1,
    );
    expect(lines.map((l) => l.newPrice)).toEqual(["1100.00", "1200.00", ""]);
    expect(lines[2].oldPrice).toBeNull();
    expect(new Set(lines.map(lineKey)).size).toBe(3);
    expect(lineKey(lines[0])).toBe("5:1:10");
  });
});

describe("Narx oʻzgarishlari roʻyxati", () => {
  const empty = { status: null, q: "", priceTypeIds: [], from: null, to: null, page: 1 };
  it("filtr faolligi — holat yorligʻi filtr hisoblanmaydi", () => {
    expect(isFiltered(empty)).toBe(false);
    expect(isFiltered({ ...empty, status: "APPROVED" })).toBe(false);
    expect(isFiltered({ ...empty, q: "  " })).toBe(false);
    expect(isFiltered({ ...empty, q: "NO-TSH" })).toBe(true);
    expect(isFiltered({ ...empty, priceTypeIds: [2] })).toBe(true);
    expect(isFiltered({ ...empty, from: "2026-11-01" })).toBe(true);
  });
  it("kelajakdagi kuchga kirish sanasi", () => {
    expect(isFuture("2026-11-10", "2026-11-09")).toBe(true);
    expect(isFuture("2026-11-09", "2026-11-09")).toBe(false);
    expect(isFuture("2026-10-30", "2026-11-09")).toBe(false);
  });
  it("yorliqlar tartibi prototip boʻyicha", () => {
    expect(CHANGE_VIEWS.slice(0, 4)).toEqual(["PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"]);
  });
});
