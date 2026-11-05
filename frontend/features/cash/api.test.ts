import { describe, expect, it } from "vitest";
import { countedTotal, fromCents, isOverApprovalLimit, toCents, usableAccount } from "./api";

describe("kassa: tiyinlarda hisob", () => {
  it("satr ↔ tiyin", () => {
    expect(toCents("1250350.5")).toBe(125035050n);
    expect(toCents("-350.50")).toBe(-35050n);
    expect(toCents("notoʻgʻri")).toBe(0n);
    expect(fromCents(-35050n)).toBe("-350.50");
    expect(fromCents(5n)).toBe("0.05");
  });

  it("kupyuralar sanogʻi + mayda pul", () => {
    expect(countedTotal({ 200000: "6", 50000: "1", 1000: "" }, "350.50")).toBe("1250350.50");
    expect(countedTotal({ 100: "x" }, "")).toBe("0.00");
  });

  it("2 000 000 dan katta chiqim — tasdiq kerak", () => {
    expect(isOverApprovalLimit("2000000")).toBe(false);
    expect(isOverApprovalLimit("2000000.01")).toBe(true);
  });
});

describe("kassir faqat oʻz kassasida", () => {
  const k1 = { id: 1, kind: "CASH" as const, active: true, cashierId: 10 };
  const k2 = { id: 2, kind: "CASH" as const, active: true };
  const t = { id: 3, kind: "TERMINAL" as const, active: true };
  const all = [k1, k2, t];

  it("biriktirilgan kassa — faqat oʻz kassiriga", () => {
    expect(usableAccount(k1, all, 10, false)).toBe(true);
    expect(usableAccount(k1, all, 11, false)).toBe(false);
    expect(usableAccount(k1, all, 11, true)).toBe(true);
  });

  it("kassasi bor xodim biriktirilmagan kassani ishlatmaydi; kassasi yoʻq — ishlatadi", () => {
    expect(usableAccount(k2, all, 10, false)).toBe(false);
    expect(usableAccount(k2, all, 11, false)).toBe(true);
  });

  it("Terminal va bank — cheklanmaydi", () => {
    expect(usableAccount(t, all, 10, false)).toBe(true);
  });
});

describe("bank koʻchirmasi farqi", () => {
  it("bank − MEDIX, tiyinlarda", async () => {
    const { reconDiff } = await import("./bank-recon");
    expect(reconDiff("1500000.00", "1300000.00")).toBe("200000.00");
    expect(reconDiff("1000000", "1000000.00")).toBe("0.00");
    expect(reconDiff("99.5", "100.00")).toBe("-0.50");
    expect(reconDiff("", "1.00")).toBeNull();
    expect(reconDiff("-5", "1.00")).toBeNull();
  });
});

describe("kassir paneli dinamikasi", () => {
  it("ustun nisbati tiyinlarda", async () => {
    const { barPercent, dayMax } = await import("./cashier-panel");
    const days = [
      { date: "2026-11-04", income: "200.00", expense: "50.00" },
      { date: "2026-11-05", income: "0.00", expense: "100.00" },
    ];
    expect(dayMax(days)).toBe(20000n);
    expect(barPercent("50.00", 20000n)).toBe(25);
    expect(barPercent("1.00", 0n)).toBe(0);
  });
});
