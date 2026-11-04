import { describe, expect, it } from "vitest";
import { countedTotal, fromCents, isOverApprovalLimit, toCents } from "./api";

describe("kassa: tiyinlarda hisob", () => {
  it("satr ↔ tiyin", () => {
    expect(toCents("1250350.5")).toBe(125035050n);
    expect(toCents("-350.50")).toBe(-35050n);
    expect(toCents("notoʻgʻri")).toBe(0n);
    expect(fromCents(-35050n)).toBe("-350.50");
    expect(fromCents(5n)).toBe("0.05");
  });

  it("kupyuralar sanogʻi + mayda pul", () => {
    expect(countedTotal({ 200000: "6", 50000: "1", 1000: "" }, "350.50")).toBe("1250350.50");
    expect(countedTotal({ 100: "x" }, "")).toBe("0.00");
  });

  it("2 000 000 dan katta chiqim — tasdiq kerak", () => {
    expect(isOverApprovalLimit("2000000")).toBe(false);
    expect(isOverApprovalLimit("2000000.01")).toBe(true);
  });
});
