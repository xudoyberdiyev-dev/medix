import { describe, expect, it } from "vitest";
import { customerVerdict, type CustomerCredit } from "./customer-state";

const base: CustomerCredit = {
  priceType: undefined,
  debt: "0.00",
  overdue: "0.00",
  overdueDays: 0,
  creditLimit: "100000.00",
  limitLeft: "100000.00",
  paymentDays: undefined,
  minShelfLifeDays: undefined,
  blocked: false,
  controlledLicense: true,
};

describe("customerVerdict", () => {
  it("bloklangan mijoz — boshqa sabablardan ustun", () => {
    expect(customerVerdict({ ...base, blocked: true, overdueDays: 5 }, "0").kind).toBe("blocked");
  });
  it("limit ichida va muddati oʻtgan qarz yoʻq — faol", () => {
    expect(customerVerdict(base, "100000.00")).toEqual({ kind: "ok" });
  });
  it("limitdan oshgan summa tiyinigacha aniq", () => {
    expect(customerVerdict(base, "100000.01")).toEqual({ kind: "approval", reasons: [{ k: "limit", over: "0.01" }] });
    expect(customerVerdict({ ...base, limitLeft: "-50.5" }, "10")).toEqual({ kind: "approval", reasons: [{ k: "limit", over: "60.50" }] });
  });
  it("muddati oʻtgan qarz — tasdiq kerak; limit belgilanmagan boʻlsa limit sababi yoʻq", () => {
    expect(customerVerdict({ ...base, creditLimit: undefined, limitLeft: undefined, overdue: "500.00", overdueDays: 3 }, "999999")).toEqual(
      {
        kind: "approval",
        reasons: [{ k: "overdue", sum: "500.00", days: 3 }],
      },
    );
  });
  it("boʻsh buyurtma limitni tekshirmaydi", () => {
    expect(customerVerdict({ ...base, limitLeft: "-10.00" }, "0").kind).toBe("ok");
  });
});
