import { describe, expect, it } from "vitest";
import { qmLinesFrom, qmTotal, type QmRow } from "./model";

const rows: QmRow[] = [
  { saleLineId: 11, productName: "Demidrol", left: 5, price: "1000.00" },
  { saleLineId: 12, productName: "Ceftriaxon", left: 2, price: "12500.50" },
  { saleLineId: 13, productName: "Omeprazol", left: 0, price: "300.00" },
];

describe("QM qatorlari", () => {
  it("0 va boʻsh qatorlar oʻtkaziladi, qolganlari sabab bilan", () => {
    const r = qmLinesFrom(rows, { qty: { 11: "3", 12: "", 13: "0" }, reason: { 11: "DAMAGED" } });
    expect(r.errors).toEqual([]);
    expect(r.lines).toEqual([{ saleLineId: 11, qty: 3, reason: "DAMAGED" }]);
  });

  it("qoldidan koʻp, butun boʻlmagan va sababsiz — xato", () => {
    const r = qmLinesFrom(rows, { qty: { 11: "1.5", 12: "3", 13: "" }, reason: {} });
    expect(r.errors).toEqual([
      { kind: "qty", line: 1, product: "Demidrol" },
      { kind: "left", line: 2, product: "Ceftriaxon", left: 2 },
    ]);
    expect(qmLinesFrom(rows, { qty: { 12: "2" }, reason: {} }).errors).toEqual([{ kind: "reason", line: 2, product: "Ceftriaxon" }]);
  });

  it("summa tiyinlarda: 3 × 1 000,00 + 2 × 12 500,50", () => {
    expect(qmTotal(rows, { 11: "3", 12: "2" })).toBe("28001.00");
    expect(qmTotal(rows, {})).toBe("0.00");
    expect(qmTotal(rows, { 12: "9" })).toBe("0.00");
  });
});
