import { describe, expect, it } from "vitest";
import { chips, creditBar, fromTiyin, toMln, visibleOrders, waitParts } from "./model";

const base = { mine: true, overdue: "0.00", overdueDays: 0, blocked: false, limitOverPct: null };

describe("Tasdiqlash modeli", () => {
  it("«Mening darajam» — faqat tasdiqlay oladiganlari, «Hammasi» — hammasi", () => {
    const list = [
      { ...base, id: 1 },
      { ...base, id: 2, mine: false },
    ];
    expect(visibleOrders(list, "mine").map((o) => o.id)).toEqual([1]);
    expect(visibleOrders(list, "all").map((o) => o.id)).toEqual([1, 2]);
  });

  it("qisqa summa (mln, bir kasr, HALF_UP)", () => {
    expect(toMln("46300000.00")).toBe("46,3");
    expect(toMln("3249999.99")).toBe("3,2");
    expect(toMln("3250000.00")).toBe("3,3");
    expect(toMln("0.00")).toBe("0,0");
    expect(toMln("1600000")).toBe("1,6");
  });

  it("belgilar: limit ≤20% sariq, koʻp — qizil; muddati oʻtgan ≤30 kun sariq; bloklangan", () => {
    expect(chips({ ...base, limitOverPct: 12 })).toEqual([{ kind: "limit", tone: "warning", pct: 12 }]);
    expect(chips({ ...base, limitOverPct: 30 })[0]?.tone).toBe("danger");
    expect(chips({ ...base, overdue: "4000000.00", overdueDays: 12 })).toEqual([
      { kind: "overdue", tone: "warning", mln: "4,0", days: 12 },
    ]);
    expect(chips({ ...base, overdue: "1600000.00", overdueDays: 41 })[0]?.tone).toBe("danger");
    expect(chips({ ...base, blocked: true })).toEqual([{ kind: "blocked", tone: "danger" }]);
    expect(chips(base)).toEqual([]);
  });

  it("kutish vaqti", () => {
    expect(waitParts(1316)).toEqual({ key: "wH", d: 0, h: 21, m: 56 });
    expect(waitParts(42)).toEqual({ key: "wM", d: 0, h: 0, m: 42 });
    expect(waitParts(1500)).toEqual({ key: "wD", d: 1, h: 1, m: 0 });
  });

  it("kredit chizigʻi: limitdan oshsa — oshgan qism alohida, limit chizigʻi oʻrni", () => {
    const b = creditBar("46300000.00", "18713240.00", "50000000.00");
    expect(fromTiyin(b.overAmount)).toBe("15013240.00");
    expect(b.debt + b.order + b.over).toBeCloseTo(100, 0);
    expect(b.limitAt).toBeCloseTo(76.9, 1);
    const ok = creditBar("27900000.00", "5878200.00", "80000000.00");
    expect(ok.over).toBe(0);
    expect(fromTiyin(ok.leftAmount!)).toBe("46221800.00");
    expect(creditBar("0.00", "0.00", null).limitAt).toBeNull();
  });
});
