import { describe, expect, it } from "vitest";
import { expectedReason } from "./api";

describe("expectedReason (server qoidasi bilan bir xil)", () => {
  it("farq sababi", () => {
    expect(expectedReason(10, 10, 0)).toBeNull();
    expect(expectedReason(10, 8, 0)).toBe("SHORT");
    expect(expectedReason(10, 12, 0)).toBe("EXCESS");
    expect(expectedReason(10, 9, 1)).toBe("DAMAGED");
    expect(expectedReason(10, 10, 1)).toBe("DAMAGED");
  });
});
