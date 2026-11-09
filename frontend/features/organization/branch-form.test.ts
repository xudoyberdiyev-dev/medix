import { describe, expect, it } from "vitest";
import { bodyFromForm, emptyBank, formFromBranch, suggestCode, validateBranch } from "./branch-form";

describe("filial kartasi", () => {
  it("nomdan 3 harfli belgi", () => {
    expect(suggestCode("Toshkent filiali")).toBe("TSH");
    expect(suggestCode("Samarqand")).toBe("SMR");
    expect(suggestCode("Buxoro")).toBe("BXR");
    expect(suggestCode("Fargʻona")).toBe("FRG");
    expect(suggestCode("Тошкент")).toBe("TSH");
    expect(suggestCode("Uz")).toBe("");
  });

  it("majburiy maydonlar, STIR, bank qatori", () => {
    const f = formFromBranch(null);
    expect(validateBranch(f, true)).toEqual({
      name: "eName",
      code: "eCode",
      legalName: "eLegal",
      tin: "eStir",
      region: "eRegion",
      address: "eAddr",
    });
    const ok = {
      ...f,
      name: "Toshkent",
      code: "TSH",
      legalName: "Medix MChJ",
      tin: "301234567",
      region: "Toshkent shahri",
      address: "Chilonzor 1",
      banks: [{ ...emptyBank(true), bankName: "Kapitalbank", mfo: "01158", account: "123" }],
    };
    expect(validateBranch(ok, true)).toEqual({ "account.0": "eAcc" });
    expect(validateBranch({ ...ok, banks: [emptyBank(true)] }, true)).toEqual({});
    expect(validateBranch({ ...ok, sameAddress: false, banks: [] }, true)).toEqual({ actualAddress: "eActual" });
    // Tahrirlashda kod tekshirilmaydi (oʻzgarmaydi)
    expect(validateBranch({ ...ok, code: "", banks: [] }, false)).toEqual({});
    // E11: kod 2–4 harf
    const ok2 = { ...ok, banks: [emptyBank(true)] };
    expect(validateBranch({ ...ok2, code: "TS" }, true)).toEqual({});
    expect(validateBranch({ ...ok2, code: "TSHK" }, true)).toEqual({});
    expect(validateBranch({ ...ok2, code: "T" }, true)).toEqual({ code: "eCode" });
    expect(validateBranch({ ...ok2, code: "TSHKX" }, true)).toEqual({ code: "eCode" });
  });

  it("soʻrov tanasi: boʻsh bank qatori tashlanadi, QQS toʻlovchi boʻlmasa guvohnoma yuborilmaydi", () => {
    const body = bodyFromForm({
      ...formFromBranch(null),
      name: " Toshkent ",
      code: "tsh",
      legalName: "M",
      tin: "301234567",
      vatPayer: false,
      vatCertNo: "326030012345",
      address: "A",
      banks: [emptyBank(true), { bankName: "Agrobank", mfo: "00394", account: "20208000900100001012", main: false }],
    });
    expect(body.code).toBe("TSH");
    expect(body.name).toBe("Toshkent");
    expect(body.vatCertNo).toBeUndefined();
    expect(body.actualAddress).toBe("A");
    expect(body.bankAccounts).toEqual([{ bankName: "Agrobank", mfo: "00394", account: "20208000900100001012", main: false }]);
  });
});
