import { describe, expect, it } from "vitest";
import { expectedReason, prepaidShortfall } from "./api";

describe("expectedReason (server qoidasi bilan bir xil)", () => {
  it("farq sababi", () => {
    expect(expectedReason(10, 10, 0)).toBeNull();
    expect(expectedReason(10, 8, 0)).toBe("SHORT");
    expect(expectedReason(10, 12, 0)).toBe("EXCESS");
    expect(expectedReason(10, 9, 1)).toBe("DAMAGED");
    expect(expectedReason(10, 10, 1)).toBe("DAMAGED");
  });
});

describe("prepaidShortfall (SPEC 5.1: avans yetmasa — ogohlantirish)", () => {
  const base = { prepaid: true, status: "DRAFT" as const, supplierBalance: "-300000.00", amount: "1000000.00" };

  it("avans yetmasa — farq", () => {
    expect(prepaidShortfall(base)).toEqual({ advance: "300000.00", total: "1000000.00", shortfall: "700000.00" });
  });

  it("YB oldida qarz bor — avans 0, butun summa qarz", () => {
    expect(prepaidShortfall({ ...base, supplierBalance: "50000.00" })?.shortfall).toBe("1000000.00");
  });

  it("avans yetsa, oldindan toʻlanmagan yoki oʻtkazilgan — ogohlantirish yoʻq", () => {
    expect(prepaidShortfall({ ...base, supplierBalance: "-1000000.00" })).toBeNull();
    expect(prepaidShortfall({ ...base, prepaid: false })).toBeNull();
    expect(prepaidShortfall({ ...base, status: "POSTED" })).toBeNull();
    expect(prepaidShortfall({ ...base, supplierBalance: undefined })).toBeNull();
  });

  it("qabuldan keyin — haqiqiy summa; aniq summa berilsa — shu", () => {
    const accepted = { ...base, status: "ACCEPTED" as const, actualAmount: "250000.00" };
    expect(prepaidShortfall(accepted)).toBeNull();
    expect(prepaidShortfall(accepted, "1000000.00")?.shortfall).toBe("700000.00");
    expect(prepaidShortfall({ ...base, amount: "300000.01" })?.shortfall).toBe("0.01");
  });
});
