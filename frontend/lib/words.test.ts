import { describe, expect, it } from "vitest";
import { moneyInWords } from "./words";

describe("moneyInWords", () => {
  it("guruhlar, nollar va tiyin", () => {
    expect(moneyInWords("1250000.50")).toBe("bir million ikki yuz ellik ming soʻm 50 tiyin");
    expect(moneyInWords("0.00")).toBe("nol soʻm 00 tiyin");
    expect(moneyInWords("1001")).toBe("bir ming bir soʻm 00 tiyin");
    expect(moneyInWords("2000000000.05")).toBe("ikki milliard soʻm 05 tiyin");
    expect(moneyInWords("94017.9")).toBe("toʻqson toʻrt ming oʻn yetti soʻm 90 tiyin");
    expect(moneyInWords("-310")).toBe("minus uch yuz oʻn soʻm 00 tiyin");
  });

  it("notoʻgʻri qiymat — xato", () => {
    expect(() => moneyInWords("12,5")).toThrow();
    expect(() => moneyInWords("1.234")).toThrow();
  });
});
