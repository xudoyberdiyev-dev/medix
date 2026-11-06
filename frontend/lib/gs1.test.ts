import { describe, expect, it } from "vitest";
import { GS, parseGs1 } from "./gs1";

describe("parseGs1", () => {
  it("qavsli koʻrinish", () => {
    expect(parseGs1("(01)04601234567893(21)ABC123(17)280500(10)LOT-7(91)Q")).toEqual({
      ok: true,
      code: { gtin: "04601234567893", serial: "ABC123", batch: "LOT-7", expiry: "2028-05-31", kind: "BOX" },
    });
  });

  it("GS ajratgichli koʻrinish, simvologiya belgisi va qoʻshimcha AI", () => {
    const r = parseGs1(`]d2010460123456789321ABC123${GS}17280531104567${GS}91D${GS}93ab+=`);
    expect(r).toEqual({
      ok: true,
      code: { gtin: "04601234567893", serial: "ABC123", batch: "4567", expiry: "2028-05-31", kind: "UNIT" },
    });
  });

  it("xatolar serverdagi kalitlar bilan bir xil", () => {
    expect(parseGs1("4601234567893")).toEqual({ ok: false, error: "marking.format" });
    expect(parseGs1("(01)04601234567893(21)A(10)B")).toEqual({ ok: false, error: "marking.format" });
    expect(parseGs1("(01)04601234567894(21)A(10)B(91)Q")).toEqual({ ok: false, error: "marking.gtinInvalid" });
    expect(parseGs1("(01)04601234567893(21)A(10)B(91)X")).toEqual({ ok: false, error: "marking.kindInvalid" });
    expect(parseGs1("(01)04601234567893(21)A(10)B(91)D(17)281340")).toEqual({ ok: false, error: "marking.expiryInvalid" });
  });
});
