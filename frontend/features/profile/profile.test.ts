import { describe, expect, it } from "vitest";
import { describeDevice, validatePin } from "./api";

describe("validatePin", () => {
  it("4–6 raqam talab qiladi", () => {
    expect(validatePin("12", "12").pin).toBeDefined();
    expect(validatePin("12a4", "12a4").pin).toBeDefined();
    expect(validatePin("1234567", "1234567").pin).toBeDefined();
  });
  it("oson PIN'larni rad etadi", () => {
    expect(validatePin("1111", "1111").pin).toBeDefined();
    expect(validatePin("123456", "123456").pin).toBeDefined();
    expect(validatePin("9876", "9876").pin).toBeDefined();
  });
  it("takrori mos kelishi kerak", () => {
    expect(validatePin("4826", "4827").repeat).toBeDefined();
    expect(validatePin("4826", "4826")).toEqual({});
  });
});

describe("describeDevice", () => {
  it("brauzer va tizimni ajratadi", () => {
    expect(
      describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"),
    ).toEqual({ browser: "Chrome", os: "Windows", mobile: false });
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browser: "Safari", os: "iPhone", mobile: true });
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0").browser).toBe("Edge");
    expect(describeDevice(null)).toEqual({ browser: null, os: null, mobile: false });
  });
});
