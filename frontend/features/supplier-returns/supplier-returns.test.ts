import { describe, expect, it } from "vitest";
import { returnLinesFrom, zonesOf, type ReturnStockRow } from "./api";

const row = (batchId: number, zoneId: number, free: number, bonus = false): ReturnStockRow => ({
  zone: { id: zoneId, name: `Zona ${zoneId}`, type: "MAIN" },
  batchId,
  batchNumber: `P-${batchId}`,
  expiryDate: "2029-01-01",
  productId: 1,
  productCode: "10000001",
  productName: "Paratsetamol",
  bonus,
  qty: free + 1,
  reserved: 1,
  free,
  price: bonus ? "0.00" : "1000.00",
});

describe("QY — qaytarish qatorlari", () => {
  it("zonalarni takrorlarsiz ajratadi", () => {
    expect(zonesOf([row(1, 10, 5), row(2, 10, 3), row(3, 20, 1)]).map((z) => z.id)).toEqual([10, 20]);
  });

  it("boʻsh qatorlarni oʻtkazib, miqdorlarni yigʻadi", () => {
    const r = returnLinesFrom([row(1, 10, 5), row(2, 10, 3, true)], { 1: "2", 2: " " });
    expect(r).toEqual({ lines: [{ batchId: 1, qty: 2 }], error: null });
  });

  it("boʻsh miqdordan oshsa yoki son notoʻgʻri boʻlsa — xato", () => {
    expect(returnLinesFrom([row(1, 10, 5)], { 1: "6" }).error).toEqual({
      code: "overFree",
      product: "Paratsetamol",
      batch: "P-1",
      free: 5,
      got: 6,
    });
    expect(returnLinesFrom([row(1, 10, 5)], { 1: "1.5" }).error).toMatchObject({ code: "notPositiveInt" });
    expect(returnLinesFrom([row(1, 10, 5)], { 1: "0" }).error).toMatchObject({ code: "notPositiveInt" });
  });
});
