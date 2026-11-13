import { describe, expect, it } from "vitest";
import { EMPTY_PAGE_FORM, eanCheck, toPageRequest, validatePageForm, type PageForm } from "./form-model";

const filled: PageForm = {
  ...EMPTY_PAGE_FORM,
  code: "48203315",
  name: "Omeprazol 20mg",
  contractName: "Омепразол капсулы 20 мг №28",
  classifierName: "Omeprazol",
  manufacturerId: "3",
  categoryId: "5",
  ikpu: "03004001001000000",
  farmId: "FRM-0001234",
  unitId: "1",
};

describe("eanCheck", () => {
  it("EAN-13 va EAN-8 nazorat raqami", () => {
    expect(eanCheck("4006381333931")).toBeNull();
    expect(eanCheck("96385074")).toBeNull();
    expect(eanCheck("4006381333932")).toBe("check");
  });
  it("uzunlik va raqamlar", () => {
    expect(eanCheck("12345")).toBe("len");
    expect(eanCheck("40063813339A1")).toBe("digits");
  });
});

describe("validatePageForm", () => {
  it("toʻldirilgan shakl — xatosiz", () => {
    expect(validatePageForm(filled)).toEqual({});
  });
  it("majburiy maydonlar, kod formati, min > max", () => {
    const e = validatePageForm({ ...EMPTY_PAGE_FORM, code: "01234567", minQty: "10", maxQty: "5" });
    expect(Object.keys(e)).toEqual(
      expect.arrayContaining([
        "name",
        "contractName",
        "classifierName",
        "manufacturerId",
        "categoryId",
        "ikpu",
        "farmId",
        "code",
        "maxQty",
        "unitId",
      ]),
    );
    expect(e.code).toBe("codeFmt");
    expect(e.maxQty).toBe("maxMin");
  });
  it("«Cheksiz» maksimal miqdor (O2): min > max tekshirilmaydi, soʻrovda maxQty yuborilmaydi", () => {
    const f = { ...filled, minQty: "10", maxQty: "5", maxUnlimited: true };
    expect(validatePageForm(f).maxQty).toBeUndefined();
    expect(toPageRequest(f).maxQty).toBeUndefined();
    expect(toPageRequest({ ...f, maxUnlimited: false, maxQty: "50" }).maxQty).toBe(50);
  });
  it("IKPU — 17 raqam", () => {
    expect(validatePageForm({ ...filled, ikpu: "123" }).ikpu).toBe("ikpu");
  });
});

describe("toPageRequest", () => {
  it("QQSsiz — stavka 0 va ozod belgisi", () => {
    const r = toPageRequest({ ...filled, vat: "none", minQty: "", packQty: "28" });
    expect(r.vatRate).toBe("0");
    expect(r.vatExempt).toBe(true);
    expect(r.minQty).toBeUndefined();
    expect(r.packQty).toBe(28);
    expect(r.code).toBe("48203315");
  });
  it("12% — ozod emas", () => {
    expect(toPageRequest(filled)).toMatchObject({ vatRate: "12", vatExempt: false, unitId: 1, manufacturerId: 3 });
  });
});
