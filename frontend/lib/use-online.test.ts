import { describe, expect, it } from "vitest";
import { isNetworkError } from "./use-online";

describe("tarmoq xatosi (U13)", () => {
  it("fetch yetib bormasa — TypeError; server xatosi — yoʻq", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("400"))).toBe(false);
  });
});
