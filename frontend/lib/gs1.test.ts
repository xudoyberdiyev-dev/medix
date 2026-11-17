import { describe, expect, it } from "vitest";
import { GS, parseGs1 } from "./gs1";

describe("parseGs1", () => {
  it("qavsli koʻrinish", () => {
    expect(parseGs1("(01)04601234567893(21)ABC123(17)280500(10)LOT-7(91)Q")).toEqual({
      ok: true,
      code: { gtin: "04601234567893", serial: "ABC123", batch: "LOT-7", expiry: "2028-05-31", kind: "UNIT" },
    });
  });

  it("GS ajratgichli koʻrinish, simvologiya belgisi va qoʻshimcha AI", () => {
    const r = parseGs1(`]d2010460123456789321ABC123${GS}17280531104567${GS}91D${GS}93ab+=`);
    expect(r).toEqual({
      ok: true,
      code: { gtin: "04601234567893", serial: "ABC123", batch: "4567", expiry: "2028-05-31", kind: "UNIT" },
    });
  });

  it("O16: egasi namunasidagi kodlar (dona va quti SSCC)", () => {
    expect(parseGs1("0104780011675089217HTFlJLN7jbo3")).toEqual({
      ok: true,
      code: { gtin: "04780011675089", serial: "7HTFlJLN7jbo3", batch: null, expiry: null, kind: "UNIT" },
    });
    expect(parseGs1("00047800116744728760")).toEqual({
      ok: true,
      code: { gtin: null, serial: "047800116744728760", batch: null, expiry: null, kind: "AGGREGATE" },
    });
    expect(parseGs1("00047800116744727275").ok).toBe(true);
    // Excel oldingi nollarni yoʻqotgan
    expect(parseGs1("47800116744728760")).toMatchObject({ ok: true, code: { serial: "047800116744728760" } });
    // Ajratgichsiz kripto-dum
    expect(parseGs1("0104780011675089217HTFlJLN7jbo391EE0692dGVzdA==")).toMatchObject({ ok: true, code: { serial: "7HTFlJLN7jbo3" } });
  });

  it("xatolar serverdagi kalitlar bilan bir xil", () => {
    expect(parseGs1("4601234567893")).toEqual({ ok: false, error: "marking.format" });
    expect(parseGs1("(01)04601234567893(10)B")).toEqual({ ok: false, error: "marking.format" });
    expect(parseGs1("(01)04601234567894(21)A(10)B(91)Q")).toEqual({ ok: false, error: "marking.gtinInvalid" });
    expect(parseGs1("(01)04601234567893(21)A(10)B(91)D(17)281340")).toEqual({ ok: false, error: "marking.expiryInvalid" });
    expect(parseGs1("00047800116744728761")).toEqual({ ok: false, error: "marking.ssccInvalid" });
  });
});
