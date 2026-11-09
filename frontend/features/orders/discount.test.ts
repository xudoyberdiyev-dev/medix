import { describe, expect, it } from "vitest";
import { formatPct, parsePct, pctText } from "./discount";

describe("buyurtma chegirmasi %", () => {
  it("server qiymatini maydonga oʻgiradi", () => {
    expect(pctText("5.00")).toBe("5");
    expect(pctText("7.50")).toBe("7,5");
    expect(pctText("0.00")).toBe("");
    expect(pctText(null)).toBe("");
  });
  it("koʻrsatadi", () => {
    expect(formatPct("3.30")).toBe("3,3");
    expect(formatPct("0.00")).toBe("0");
  });
  it("kiritilganini tekshiradi", () => {
    expect(parsePct("")).toBeNull();
    expect(parsePct(" 7,5 ")).toBe(7.5);
    expect(parsePct("99.99")).toBe(99.99);
    expect(parsePct("100")).toBeUndefined();
    expect(parsePct("5.555")).toBeUndefined();
    expect(parsePct("-1")).toBeUndefined();
    expect(parsePct("abc")).toBeUndefined();
  });
});
