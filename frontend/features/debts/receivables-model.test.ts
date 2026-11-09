import { describe, expect, it } from "vitest";
import { fromTiyin, inAges, inTab, shareText, statusOf, sumOf, toTiyin, usedPct } from "./receivables-model";

const row = (b: Partial<Record<string, string>>, limit: string | null = null) => ({
  buckets: {
    debt: "0.00",
    advance: "0.00",
    overdue: "0.00",
    notDue: "0.00",
    d1to30: "0.00",
    d31to60: "0.00",
    d61to90: "0.00",
    d90plus: "0.00",
    ...b,
  } as Record<"debt" | "advance" | "overdue" | "notDue" | "d1to30" | "d31to60" | "d61to90" | "d90plus", string>,
  creditLimit: limit,
});

describe("mijozlar qarzi modeli", () => {
  it("tiyin hisobi", () => {
    expect(toTiyin("1250000.05")).toBe(125000005);
    expect(fromTiyin(-150)).toBe("-1.50");
    expect(sumOf(["0.10", "0.20"], (s) => s)).toBe("0.30");
  });

  it("holat va yorliqlar", () => {
    const od = row({ debt: "100.00", overdue: "40.00", d1to30: "40.00", notDue: "60.00" });
    const lim = row({ debt: "200.00", notDue: "200.00" }, "150.00");
    const adv = row({ advance: "50.00" });
    const zero = row({});
    expect(statusOf(od)).toBe("overdue");
    expect(statusOf(lim)).toBe("limit");
    expect(statusOf(adv)).toBe("adv");
    expect(statusOf(zero)).toBe("ok");
    expect([od, lim, adv, zero].filter((r) => inTab(r, "hide"))).toHaveLength(3);
    expect(inTab(lim, "limit")).toBe(true);
    expect(inTab(adv, "adv")).toBe(true);
    expect(inAges(od, ["d1to30"])).toBe(true);
    expect(inAges(lim, ["d1to30", "d90plus"])).toBe(false);
  });

  it("limit foizi va ulush", () => {
    expect(usedPct(row({ debt: "200.00" }, "150.00"))).toBe(133.3);
    expect(usedPct(row({ debt: "200.00" }))).toBeNull();
    expect(shareText("25.00", "200.00")).toBe("12,5%");
    expect(shareText("1.00", "0.00")).toBe("0%");
  });
});
