import { describe, expect, it } from "vitest";
import { linesFrom, needsApproval, type ZoneStockRow } from "./api";

const row = (batchId: number, free: number): ZoneStockRow => ({
  batchId,
  batchNumber: `P-${batchId}`,
  expiryDate: "2029-01-01",
  productId: 1,
  productCode: "10000001",
  productName: "Paratsetamol",
  qty: free + 2,
  reserved: 2,
  free,
});

describe("zona koʻchirishi", () => {
  it("karantindan sotuvga ochiq zonaga — tasdiq kerak", () => {
    expect(needsApproval("QUARANTINE", "MAIN")).toBe(true);
    expect(needsApproval("QUARANTINE", "SAFE")).toBe(true);
    expect(needsApproval("QUARANTINE", "SHIPPING")).toBe(false);
    expect(needsApproval("MAIN", "QUARANTINE")).toBe(false);
    expect(needsApproval(undefined, "MAIN")).toBe(false);
  });

  it("boʻsh qatorlar tashlanadi, miqdor boʻsh qoldiqdan oshmaydi", () => {
    const stock = [row(1, 5), row(2, 3)];
    expect(linesFrom(stock, { 1: "4", 2: " " })).toEqual({ lines: [{ batchId: 1, qty: 4 }], error: null });
    expect(linesFrom(stock, { 2: "4" }).error).toEqual({ code: "overFree", product: "Paratsetamol", batch: "P-2", free: 3, got: 4 });
    expect(linesFrom(stock, { 1: "1,5" }).error).toMatchObject({ code: "notPositiveInt" });
    expect(linesFrom(stock, { 1: "0" }).error).toMatchObject({ code: "notPositiveInt" });
  });
});
