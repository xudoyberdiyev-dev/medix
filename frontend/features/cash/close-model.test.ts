import { describe, expect, it } from "vitest";
import { addDays, checkClose, closeBody, countedOf, diffOf, diffTone, hasDiff } from "./close-model";

describe("kunni yopish modeli", () => {
  it("kupyuralar boʻyicha sanoq", () => {
    expect(countedOf("den", {}, "")).toBeNull();
    expect(countedOf("den", { 200000: "0" }, "")).toBeNull();
    expect(countedOf("den", { 200000: "6", 50000: "3", 1000: "" }, "")).toBe("1350000.00");
  });

  it("jami summa rejimi", () => {
    expect(countedOf("total", {}, "")).toBeNull();
    expect(countedOf("total", {}, "1350350.5")).toBe("1350350.50");
    expect(countedOf("total", { 200000: "5" }, "abc")).toBeNull();
  });

  it("farq va rang", () => {
    expect(diffOf(null, "10.00")).toBeNull();
    expect(diffOf("1350000.00", "1350350.50")).toBe("-350.50");
    expect(diffTone("-350.50")).toBe("danger");
    expect(diffTone("1.00")).toBe("warning");
    expect(diffTone("0.00")).toBe("success");
    expect(hasDiff("0.00")).toBe(false);
  });

  it("sana qoʻshish", () => {
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("tekshiruv: yopilmagan oldingi kun, sanoq, izoh, tasdiqlovchi, PIN", () => {
    const base = {
      date: "2026-11-10",
      lastClosed: "2026-11-09",
      pendingOps: 0,
      counted: "5.00",
      diff: "0.00",
      note: "",
      approverId: null,
      pin: "",
    };
    expect(checkClose(base)).toEqual([]);
    expect(checkClose({ ...base, lastClosed: "2026-11-07" })[0]).toEqual({ key: "closeFirst", field: null, date: "2026-11-08" });
    expect(checkClose({ ...base, counted: null, diff: null }).map((e) => e.key)).toEqual(["count"]);
    expect(checkClose({ ...base, pendingOps: 2 }).map((e) => e.key)).toEqual(["pending"]);
    expect(checkClose({ ...base, diff: "-1.00" }).map((e) => e.key)).toEqual(["diffNote", "pinPick"]);
    expect(checkClose({ ...base, diff: "-1.00", note: "x", approverId: 3, pin: "12" }).map((e) => e.key)).toEqual(["pin"]);
    expect(checkClose({ ...base, diff: "-1.00", note: "x", approverId: 3, pin: "1234" })).toEqual([]);
  });

  it("serverga yuboriladigan sanoq", () => {
    expect(closeBody("total", {}, "100.5")).toEqual({ denominations: [], coins: "100.50" });
    const b = closeBody("den", { 200000: "2" }, "");
    expect(b.coins).toBeUndefined();
    expect(b.denominations[0]).toEqual({ nominal: 200000, count: 2 });
    expect(b.denominations).toHaveLength(8);
  });
});
