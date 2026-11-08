import { describe, expect, it } from "vitest";
import { dueTone } from "./list-state";
import { groupByDay } from "@/lib/history";
import { centsToMoney, expectedBonus, toCentsBig } from "./receipt-doc";

const base = { amount: "1000.00", actualAmount: undefined, debtAmount: undefined };

describe("kirim hujjati — yordamchilar", () => {
  it("kutilayotgan bonus: summa yoki foiz (HALF_UP, tiyin)", () => {
    expect(expectedBonus({ ...base, discountKind: undefined, discountValue: undefined })).toBeNull();
    expect(expectedBonus({ ...base, discountKind: "SUM", discountValue: "150.00" })).toBe("150.00");
    expect(expectedBonus({ ...base, discountKind: "PERCENT", discountValue: "2.50" })).toBe("25.00");
    // qarz summasi ustun: 333.33 × 1.5% = 4.99995 → 5.00
    expect(expectedBonus({ ...base, debtAmount: "333.33", discountKind: "PERCENT", discountValue: "1.50" })).toBe("5.00");
  });

  it("tiyin aylantirish", () => {
    expect(toCentsBig("950005.5")).toBe(95000550n);
    expect(centsToMoney(95000550n)).toBe("950005.50");
    expect(centsToMoney(-5n)).toBe("-0.05");
  });

  it("tarix kunlar boʻyicha guruhlanadi (Toshkent)", () => {
    const g = groupByDay([{ at: "2026-11-07T18:30:00Z" }, { at: "2026-11-07T20:00:00Z" }, { at: "2026-11-08T05:00:00Z" }]);
    expect(g.map((x) => [x.day, x.items.length])).toEqual([
      ["07.11.2026", 1],
      ["08.11.2026", 2],
    ]);
  });

  it("toʻlangan kirimda toʻlov kuni kulrang", () => {
    expect(dueTone("POSTED", "2026-11-01", "2026-11-08")).toBe("danger");
    expect(dueTone("POSTED", "2026-11-01", "2026-11-08", true)).toBe("muted");
  });
});
