import { describe, expect, it } from "vitest";
import { receiveLinesFrom, type TransferLine } from "./api";

const line = (id: number, qty: number): TransferLine => ({
  id,
  lineNo: id,
  batchId: id * 10,
  batchNumber: `P-${id}`,
  expiryDate: "2029-01-01",
  productId: 1,
  productCode: "10000001",
  productName: "Paratsetamol",
  qty,
  receivedQty: undefined,
});

describe("ombor koʻchirishi — qabul", () => {
  it("boʻsh maydon — toʻliq keldi, faqat farqli qatorlar yuboriladi", () => {
    const r = receiveLinesFrom([line(1, 10), line(2, 5)], { 1: "", 2: "5" });
    expect(r).toEqual({ lines: [], shortage: 0, error: null });
  });
  it("kamomad hisoblanadi", () => {
    const r = receiveLinesFrom([line(1, 10), line(2, 5)], { 1: "8", 2: "0" });
    expect(r.lines).toEqual([
      { lineId: 1, receivedQty: 8 },
      { lineId: 2, receivedQty: 0 },
    ]);
    expect(r.shortage).toBe(7);
  });
  it("joʻnatilgandan koʻp yoki butun boʻlmagan son — xato", () => {
    expect(receiveLinesFrom([line(1, 10)], { 1: "11" }).error).toEqual({
      code: "overSent",
      product: "Paratsetamol",
      batch: "P-1",
      sent: 10,
      got: 11,
    });
    expect(receiveLinesFrom([line(1, 10)], { 1: "2,5" }).error).toMatchObject({ code: "notInt" });
  });
});
