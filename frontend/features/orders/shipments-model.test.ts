import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { uzLatn } from "@/i18n/messages.generated";
import { addMoney, agoText, deliveryDateState, groupByRegion, minutesSince, tripProgress, type ReadyOrder } from "./shipments-model";

const t = createTranslator({ locale: "uz-Latn", messages: uzLatn, namespace: "orders" });

function order(id: number, region: string | null, total: string): ReadyOrder {
  return {
    id,
    number: `BY-TSH-00000${id}`,
    branchId: 1,
    customer: "Mijoz",
    address: undefined,
    delivery: "DELIVERY",
    places: 1,
    total,
    phone: undefined,
    region: region ?? undefined,
    deliveryDate: undefined,
    lines: 1,
    qty: 1,
    readyAt: "2026-11-10T00:00:00Z",
    controlled: false,
    shortQty: 0,
  };
}

describe("Joʻnatish (prototip Shipping)", () => {
  it("pul satrlari aniq qoʻshiladi", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    expect(addMoney("1250000.50", "10.05")).toBe("1250010.55");
    expect(addMoney("5", "-7.25")).toBe("-2.25");
  });

  it("yetkazish hudud boʻyicha guruhlanadi, hududsizlar oxirida", () => {
    const g = groupByRegion([
      order(1, "Yunusobod", "100.10"),
      order(2, null, "5.00"),
      order(3, "Mirobod", "1.00"),
      order(4, "Yunusobod", "0.90"),
    ]);
    expect(g.map((x) => x.region)).toEqual(["Mirobod", "Yunusobod", null]);
    expect(g[1].orders.map((o) => o.id)).toEqual([1, 4]);
    expect(g[1].total).toBe("101.00");
  });

  it("yetkazish sanasi holati", () => {
    expect(deliveryDateState("2026-11-10", "2026-11-10")).toBe("today");
    expect(deliveryDateState("2026-11-09", "2026-11-10")).toBe("late");
    expect(deliveryDateState("2026-11-12", "2026-11-10")).toBe("later");
    expect(deliveryDateState(null, "2026-11-10")).toBe("none");
  });

  it("terilganidan beri vaqt", () => {
    const now = Date.parse("2026-11-10T03:00:00Z");
    expect(minutesSince("2026-11-10T02:15:00Z", now)).toBe(45);
    expect(agoText(45, t)).toBe("45 daqiqa oldin");
    expect(agoText(150, t)).toBe("2 soat oldin");
    expect(agoText(3000, t)).toBe("2 kun oldin");
  });

  it("reys progressi", () => {
    expect(tripProgress({ status: "PLANNED", orders: 4, delivered: 0, marked: 0 }, t)).toBe("0 / 4 yetkazildi");
    expect(tripProgress({ status: "IN_TRANSIT", orders: 4, delivered: 1, marked: 2 }, t)).toBe("2 / 4 bekat belgilandi");
    expect(tripProgress({ status: "DONE", orders: 4, delivered: 3, marked: 4 }, t)).toBe("3 / 4 yetkazildi");
  });
});
