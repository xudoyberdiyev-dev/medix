import { describe, expect, it } from "vitest";
import { EDIT_KEYS, expiryFlag, gridKeys, lineSum, nextCell } from "./receipt-lines";

describe("kirim qatorlar jadvali", () => {
  it("ustunlar rejimga va narx huquqiga qarab", () => {
    expect(gridKeys("edit", false, true)).toEqual(["product", "batch", "mfg", "exp", "zone", "qty", "bonusQty", "price", "sum"]);
    expect(gridKeys("read", true, true)).toContain("fact");
    expect(gridKeys("read", true, false)).not.toContain("price");
    expect(gridKeys("read", true, false)).not.toContain("sum");
  });

  it("qator summasi tiyingacha aniq", () => {
    expect(lineSum("12500,50", "3")).toBe("37501.50");
    expect(lineSum("0.01", "7")).toBe("0.07");
    expect(lineSum("", "3")).toBeNull();
    expect(lineSum("100", "1,5")).toBeNull();
  });

  it("yaroqlilik belgisi", () => {
    expect(expiryFlag("01.11.2026", "2026-11-08", 90)).toEqual({ kind: "expired" });
    expect(expiryFlag("18.11.2026", "2026-11-08", 90)).toEqual({ kind: "soon", days: 10 });
    expect(expiryFlag("01.11.2028", "2026-11-08", 90)).toBeNull();
    expect(expiryFlag("xato", "2026-11-08", 90)).toBeNull();
  });

  it("Enter/Tab keyingi katakka oʻtadi", () => {
    expect(nextCell(EDIT_KEYS, 2, 0, "batch", 1)).toEqual({ row: 0, key: "mfg" });
    expect(nextCell(EDIT_KEYS, 2, 0, "price", 1)).toEqual({ row: 1, key: "batch" });
    expect(nextCell(EDIT_KEYS, 2, 1, "price", 1)).toBeNull();
    expect(nextCell(EDIT_KEYS, 2, 1, "batch", -1)).toEqual({ row: 0, key: "price" });
  });
});
