import { describe, expect, it } from "vitest";
import { fillExpired, linesFrom, type WriteOffStockRow } from "./api";

const row = (batchId: number, free: number, expired = false): WriteOffStockRow => ({
  batchId,
  batchNumber: `P-${batchId}`,
  expiryDate: expired ? "2025-01-01" : "2029-01-01",
  expired,
  productId: 1,
  productCode: "10000001",
  productName: "Paratsetamol",
  qty: free + 2,
  reserved: 2,
  free,
});

describe("hisobdan chiqarish", () => {
  it("boʻsh qatorlar tashlanadi, miqdor boʻsh qoldiqdan oshmaydi", () => {
    const stock = [row(1, 5), row(2, 3)];
    expect(linesFrom(stock, { 1: "4", 2: " " })).toEqual({ lines: [{ batchId: 1, qty: 4 }], error: null });
    expect(linesFrom(stock, { 2: "4" }).error).toEqual({ code: "overFree", product: "Paratsetamol", batch: "P-2", free: 3, got: 4 });
    expect(linesFrom(stock, { 1: "1,5" }).error).toMatchObject({ code: "notPositiveInt" });
    expect(linesFrom(stock, { 1: "0" }).error).toMatchObject({ code: "notPositiveInt" });
  });

  it("muddati oʻtganlar boʻsh miqdor bilan toʻldiriladi", () => {
    expect(fillExpired([row(1, 5, true), row(2, 3), row(3, 0, true)])).toEqual({ 1: "5" });
  });
});
