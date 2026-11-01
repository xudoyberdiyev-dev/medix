import { describe, expect, it } from "vitest";
import { percentChange } from "./api";

describe("percentChange", () => {
  it("foiz va chegaralar", () => {
    expect(percentChange("10000.00", "13000")).toBe(30);
    expect(percentChange("10000.00", "9999")).toBe(-0.01);
    expect(percentChange(null, "1")).toBeNull();
    expect(percentChange("0", "1")).toBeNull();
    expect(percentChange("100", "abc")).toBeNull();
  });
});
