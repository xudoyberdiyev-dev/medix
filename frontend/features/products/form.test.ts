import { describe, expect, it } from "vitest";
import { EMPTY_FORM, toRequest } from "./api";

describe("mahsulot shakli → soʻrov", () => {
  it("shtrix-kodlar ajratiladi, boʻsh matnlar tashlanadi", () => {
    const r = toRequest({ ...EMPTY_FORM, name: "Nimesil", unitId: "1", barcodes: "4780001 , 4780002\n\n4780003", vatRate: "12,5" });
    expect(r.errors).toEqual({});
    expect(r.body).toMatchObject({ unitId: 1, barcodes: ["4780001", "4780002", "4780003"], vatRate: "12.5", contractName: undefined });
  });
  it("min/max va QQS tekshiriladi", () => {
    const r = toRequest({ ...EMPTY_FORM, name: "X", unitId: "1", minQty: "10", maxQty: "5", vatRate: "120" });
    expect(r.body).toBeUndefined();
    expect(Object.keys(r.errors).sort()).toEqual(["maxQty", "vatRate"]);
  });
  it("birlik majburiy", () => {
    expect(toRequest({ ...EMPTY_FORM, name: "X" }).errors.unitId).toBeDefined();
  });
});
