import { describe, expect, it } from "vitest";
import { canonicalSetting, displaySetting, settingChanges, settingError, vatRateValid } from "./settings-form";

describe("sozlama qiymati", () => {
  it("summa va butun son koʻrinishi", () => {
    expect(canonicalSetting("SUM", "2.000.000,00")).toBe("2000000.00");
    expect(canonicalSetting("SUM", "2 500 000")).toBe("2500000.00");
    expect(canonicalSetting("SUM", "12,5")).toBe("12.50");
    expect(canonicalSetting("DAY", "060")).toBe("60");
    expect(canonicalSetting("DAY", "6,5")).toBeNull();
    expect(displaySetting("SUM", "2000000.00")).toBe("2.000.000,00");
    expect(displaySetting("DAY", "90")).toBe("90");
  });

  it("xatolar: raqam emas, summa 0, oraliq", () => {
    expect(settingError("DAY", 1, 365, "abc")).toEqual({ code: "num" });
    expect(settingError("SUM", 0, 0, "0")).toEqual({ code: "sum" });
    expect(settingError("DAY", 1, 365, "0")).toEqual({ code: "range", min: 1, max: 365 });
    expect(settingError("PCT", 0, 100, "100")).toBeNull();
  });

  it("faqat toʻgʻri va farqli qiymatlar oʻzgarish hisoblanadi", () => {
    const rows = [
      { key: "a", kind: "DAY" as const, min: 1, max: 365, value: "90" },
      { key: "b", kind: "SUM" as const, min: 0, max: 0, value: "2000000.00" },
      { key: "c", kind: "PCT" as const, min: 0, max: 100, value: "20" },
    ];
    expect(settingChanges(rows, { a: "60", b: "2.000.000,00", c: "200" })).toEqual([{ key: "a", from: "90", to: "60" }]);
  });

  it("QQS stavkasi", () => {
    expect(vatRateValid("15")).toBe(true);
    expect(vatRateValid("12,5")).toBe(true);
    expect(vatRateValid("101")).toBe(false);
    expect(vatRateValid("")).toBe(false);
  });
});
