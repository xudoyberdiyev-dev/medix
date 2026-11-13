import { describe, expect, it } from "vitest";
import { maskUzDate } from "./date-mask";

describe("maskUzDate (O1)", () => {
  it("raqamlar yozilganda nuqta oʻzi qoʻyiladi", () => {
    expect(maskUzDate("1")).toBe("1");
    expect(maskUzDate("11", "1")).toBe("11.");
    expect(maskUzDate("11.1", "11.")).toBe("11.1");
    expect(maskUzDate("11.11", "11.1")).toBe("11.11.");
    expect(maskUzDate("11.11.2026", "11.11.202")).toBe("11.11.2026");
    expect(maskUzDate("11112026")).toBe("11.11.2026");
    expect(maskUzDate("11.11.20261", "11.11.2026")).toBe("11.11.2026");
  });
  it("oʻchirishda nuqta toʻgʻri oʻchadi", () => {
    expect(maskUzDate("11", "11.")).toBe("11");
    expect(maskUzDate("11.11", "11.11.")).toBe("11.11");
    expect(maskUzDate("11.1", "11.11")).toBe("11.1");
    expect(maskUzDate("", "1")).toBe("");
  });
  it("joylashtirilgan formatlar", () => {
    expect(maskUzDate("2026-11-11")).toBe("11.11.2026");
    expect(maskUzDate("11.11.2026")).toBe("11.11.2026");
    expect(maskUzDate(" 1/2/2026 ")).toBe("01.02.2026");
    expect(maskUzDate("ab11c11d2026")).toBe("11.11.2026");
  });
});
