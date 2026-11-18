import { describe, expect, it } from "vitest";
import { migrateLegacyKeys } from "./legacy-storage";

describe("migrateLegacyKeys", () => {
  it("eski kalitlarni yangi nomga koʻchiradi, mavjud yangisini bosmaydi", () => {
    localStorage.clear();
    localStorage.setItem("medix-orders-views", "[1]");
    localStorage.setItem("medix.setup.redirected", "1");
    localStorage.setItem("medix-branch", "old");
    localStorage.setItem("yuzplus-branch", "new");
    localStorage.setItem("boshqa", "x");
    expect(migrateLegacyKeys(localStorage)).toBe(3);
    expect(localStorage.getItem("yuzplus-orders-views")).toBe("[1]");
    expect(localStorage.getItem("yuzplus.setup.redirected")).toBe("1");
    expect(localStorage.getItem("yuzplus-branch")).toBe("new");
    expect(localStorage.getItem("medix-branch")).toBeNull();
    expect(localStorage.getItem("boshqa")).toBe("x");
    expect(migrateLegacyKeys(localStorage)).toBe(0);
  });
});
