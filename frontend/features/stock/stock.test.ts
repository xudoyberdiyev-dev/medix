import { describe, expect, it } from "vitest";
import { expiryState } from "./stock-page";

describe("expiryState", () => {
  it("chegaralar", () => {
    expect(expiryState(-1)).toBe("expired");
    expect(expiryState(0)).toBe("expiring");
    expect(expiryState(90)).toBe("expiring");
    expect(expiryState(91)).toBe("valid");
  });
});
