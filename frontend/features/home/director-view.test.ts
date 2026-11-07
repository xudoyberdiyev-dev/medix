import { describe, expect, it } from "vitest";
import { axisLabel, firstName, greetKey, maxCents, mergeSuppliers, minusMoney, share, sumMoney, toCents } from "./director-view";

describe("director-view", () => {
  it("salomlashish soat bo'yicha", () => {
    expect(greetKey(1)).toBe("greetMorning");
    expect(greetKey(11)).toBe("greetMorning");
    expect(greetKey(12)).toBe("greetDay");
    expect(greetKey(17)).toBe("greetDay");
    expect(greetKey(18)).toBe("greetEvening");
  });

  it("ism — birinchi so'z", () => {
    expect(firstName("Akmal Karimov")).toBe("Akmal");
    expect(firstName("  ")).toBe("");
    expect(firstName(undefined)).toBe("");
  });

  it("pul tiyinlarda, float'siz", () => {
    expect(toCents("1250000.50")).toBe(125000050n);
    expect(toCents("-3.1")).toBe(-310n);
    expect(minusMoney("1400000.00", "1000000.00")).toBe("400000.00");
    expect(minusMoney("0.10", "0.25")).toBe("-0.15");
    expect(maxCents(["1.00", "3.50", "-9.00"])).toBe(350n);
    expect(share("1.75", 350n)).toBe(0.5);
    expect(share("-1", 350n)).toBe(0);
    expect(share("1", 0n)).toBe(0);
  });

  it("ta'minotchilar: aktiv, keyin passiv, 5 tagacha", () => {
    const a = [1, 2, 3].map((id) => ({ id }));
    const p = [4, 5, 6].map((id) => ({ id }));
    const r = mergeSuppliers(a, p);
    expect(r.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
    expect(r[2].active).toBe(true);
    expect(r[3].active).toBe(false);
  });

  it("yigʻindi", () => {
    expect(sumMoney(["1.10", "2.95", "-0.05"])).toBe("4.00");
    expect(sumMoney([])).toBe("0.00");
  });

  it("grafik o'qi yorliqlari", () => {
    expect(axisLabel("2026-10-04", 0, 4)).toBe("04.10");
    expect(axisLabel("2026-10-02", 1, 30)).toBe("");
    expect(axisLabel("2026-10-30", 29, 30)).toBe("30.10");
  });
});
