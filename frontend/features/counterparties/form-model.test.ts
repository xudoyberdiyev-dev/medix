import { describe, expect, it } from "vitest";
import { emptyForm, licenseRequests, termsRequest, toRequest, validateForm, type CpForm } from "./form-model";

const base = (p: Partial<CpForm> = {}): CpForm => ({ ...emptyForm("3"), tin: "302 118 447", name: "Shifo", kind: "PHARMACY", ...p });
const NEW_C = { isNew: true, supplier: false, terms: true };

describe("counterparty form-model", () => {
  it("majburiy maydonlar va formatlar", () => {
    expect(validateForm(emptyForm(null), NEW_C)).toMatchObject({
      tin: "required",
      name: "required",
      kind: "required",
      branchId: "required",
    });
    expect(validateForm(base(), NEW_C)).toEqual({});
    expect(validateForm(base({ tin: "12345" }), NEW_C).tin).toBe("tin");
    expect(validateForm(base({ tin: "12345678901234" }), NEW_C).tin).toBeUndefined();
    expect(validateForm(base({ email: "x@" }), NEW_C).email).toBe("email");
    expect(validateForm(base({ bankMfo: "123" }), NEW_C).bankMfo).toBe("mfo");
    expect(validateForm(base({ bankAccount: "2020 8000 9001 0020 0300" }), NEW_C).bankAccount).toBeUndefined();
    expect(validateForm(base({ limit: "abc" }), NEW_C).limit).toBe("money");
    expect(validateForm(base({ days: "400" }), NEW_C).days).toBe("days");
  });

  it("kontakt: ism boʻlmasa — xato, boʻsh qator — eʼtiborsiz", () => {
    const f = base({
      contacts: [
        { name: "", position: "", phone: "" },
        { name: "", position: "Mudir", phone: "" },
      ],
    });
    expect(validateForm(f, NEW_C)).toEqual({ contact1: "contactName" });
  });

  it("litsenziya: raqam va muddat juft; nazoratdagi — yoqilsa majburiy", () => {
    expect(validateForm(base({ pharmNo: "FA-1" }), NEW_C).pharmUntil).toBe("required");
    expect(validateForm(base({ pharmNo: "FA-1", pharmUntil: "31.02.2030" }), NEW_C).pharmUntil).toBe("date");
    expect(validateForm(base({ pharmNo: "FA-1", pharmUntil: "01.01.2020" }), NEW_C).pharmUntil).toBe("dateOrder");
    expect(validateForm(base({ ctrl: true }), NEW_C)).toMatchObject({ ctrlNo: "required", ctrlUntil: "required" });
    // Tahrirda litsenziya va shartlar tekshirilmaydi
    expect(validateForm(base({ ctrl: true, branchId: null }), { isNew: false, supplier: false, terms: true })).toEqual({});
  });

  it("YB: asosiy toʻlov turi majburiy, limit yoʻq", () => {
    const o = { isNew: true, supplier: true, terms: true };
    expect(validateForm(base({ limit: "x" }), o)).toEqual({ mainPay: "required" });
    expect(termsRequest(base({ mainPay: "CASH", days: "45" }), true)).toEqual({ supplierPaymentDays: 45, defaultPaymentType: "CASH" });
  });

  it("soʻrov: STIR boʻshliqsiz, kontaktlar toʻldirilganlari, birinchisi — masʼul shaxs", () => {
    const r = toRequest(
      base({
        contacts: [
          { name: " ", position: "", phone: "" },
          { name: "Aliyev", position: "Mudir", phone: "" },
        ],
        bankAccount: "2020 8000",
      }),
      { customer: true, supplier: false },
    );
    expect(r.tin).toBe("302118447");
    expect(r.contacts).toEqual([{ name: "Aliyev", position: "Mudir", phone: undefined }]);
    expect(r.contactPerson).toBe("Aliyev");
    expect(r.bankAccount).toBe("20208000");
    expect(termsRequest(base({ limit: "15.000.000", priceTypeId: "" }), false)).toEqual({
      creditLimit: "15000000",
      paymentDays: 30,
      priceTypeId: undefined,
    });
  });

  it("litsenziyalar: farmatsevtika va nazoratdagi", () => {
    expect(licenseRequests(base())).toEqual([]);
    const l = licenseRequests(base({ pharmNo: "FA-1", pharmUntil: "04.10.2030", ctrl: true, ctrlNo: "NP-2", ctrlUntil: "04.10.2030" }));
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ number: "FA-1", validUntil: "2030-10-04", controlledAllowed: false });
    expect(l[1]).toMatchObject({ number: "NP-2", controlledAllowed: true });
  });
});
