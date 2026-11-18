import { describe, expect, it } from "vitest";
import { shortException } from "./system-status";

describe("shortException (P4 Tizim holati)", () => {
  it("sinf nomining oxirgi qismi", () => {
    expect(shortException("java.lang.IllegalStateException")).toBe("IllegalStateException");
    expect(shortException("Plain")).toBe("Plain");
  });
});
