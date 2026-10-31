import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "./format";

describe("formatMoney", () => {
  it.each([
    ["0", "0,00"],
    ["5", "5,00"],
    ["999.5", "999,50"],
    ["1000", "1.000,00"],
    ["1250000", "1.250.000,00"],
    ["1250000.5", "1.250.000,50"],
    ["48250000.00", "48.250.000,00"],
    ["-4200000", "-4.200.000,00"],
    ["123456789012.34", "123.456.789.012,34"],
    ["10.005", "10,01"],
    ["10.004", "10,00"],
    ["999.995", "1.000,00"],
  ])("%s → %s", (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  it("accepts bigint and rejects garbage", () => {
    expect(formatMoney(1250000n)).toBe("1.250.000,00");
    expect(() => formatMoney("12,5")).toThrow();
    expect(() => formatMoney("abc")).toThrow();
  });
});

describe("formatQuantity", () => {
  it("groups thousands with dots", () => {
    expect(formatQuantity(1240)).toBe("1.240");
    expect(formatQuantity(25)).toBe("25");
    expect(formatQuantity(-1000000)).toBe("-1.000.000");
    expect(() => formatQuantity(1.5)).toThrow();
  });
});

describe("dates in Asia/Tashkent", () => {
  it("formats as KK.OO.YYYY and HH:mm", () => {
    const d = new Date("2026-10-04T11:40:00Z"); // 16:40 Toshkent
    expect(formatDate(d)).toBe("04.10.2026");
    expect(formatDateTime(d)).toBe("04.10.2026, 16:40");
  });

  it("uses Tashkent date near midnight UTC", () => {
    expect(formatDate(new Date("2026-10-31T20:30:00Z"))).toBe("01.11.2026");
  });
});
