import { describe, expect, it } from "vitest";
import { validatePin } from "./api";

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
