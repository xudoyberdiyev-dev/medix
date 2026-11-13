import { describe, expect, it } from "vitest";
import { shortCode } from "./mark-import";

describe("shortCode (O5)", () => {
  it("GS ajratgichi koʻrinadi, uzun kod qisqaradi", () => {
    expect(shortCode("0104780069000123\u001d91D")).toBe("0104780069000123␝91D");
    expect(shortCode("x".repeat(60), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
