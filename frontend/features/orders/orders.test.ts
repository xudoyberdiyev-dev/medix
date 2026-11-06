import { describe, expect, it } from "vitest";
import { canApprove, canCancelOrder, codesExportUrl } from "./api";
import { counterText } from "./marking-page";
import { statusTabs, tabSummary } from "./orders-page";
import { groupByStage, sinceText, type MonitorCard } from "./monitor-page";
import { timerText } from "./picking-page";
import { capacityState } from "./shipments-page";

const none = { own: false, cancel: false, manage: false, cancelPick: false };

describe("buyurtma qoidalari (server bilan bir xil)", () => {
  it("bekor qilish", () => {
    expect(canCancelOrder("DRAFT", { ...none, own: true, cancel: true })).toBe(true);
    expect(canCancelOrder("DRAFT", { ...none, cancel: true })).toBe(false);
    expect(canCancelOrder("PENDING_APPROVAL", { ...none, manage: true })).toBe(true);
    expect(canCancelOrder("QUEUED", { ...none, own: true, cancel: true })).toBe(false);
    expect(canCancelOrder("LOADING", { ...none, cancelPick: true })).toBe(true);
    expect(canCancelOrder("IN_TRANSIT", { own: true, cancel: true, manage: true, cancelPick: true })).toBe(false);
  });

  it("tasdiq darajasi", () => {
    expect(canApprove("BRANCH", true, false)).toBe(true);
    expect(canApprove("DIRECTOR", true, false)).toBe(false);
    expect(canApprove("DIRECTOR", false, true)).toBe(true);
    expect(canApprove(null, true, true)).toBe(false);
  });
});

describe("timerText", () => {
  it("qolgan va kechikkan vaqt", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(timerText(new Date("2026-11-01T10:12:05Z"), now)).toEqual({ text: "12:05", late: false });
    expect(timerText(new Date("2026-11-01T09:57:30Z"), now)).toEqual({ text: "Kechikdi: 3 daqiqa", late: true });
  });
});

describe("markirovka hisoblagichi", () => {
  it("quti va dona alohida", () => {
    expect(counterText({ boxesScanned: 10, boxesNeeded: 10, unitsScanned: 3, unitsNeeded: 25 })).toBe("10 / 10 quti · 3 / 25 dona");
    expect(counterText({ boxesScanned: 0, boxesNeeded: 0, unitsScanned: 1, unitsNeeded: 2 })).toBe("1 / 2 dona");
  });
});

describe("monitor", () => {
  const card = (id: number, status: MonitorCard["status"], since: string, late = false, stale = false): MonitorCard => ({
    id,
    number: `BY-TSH-${id}`,
    customer: "Dorixona",
    status,
    lines: 1,
    totalQty: 1,
    marked: false,
    timeGiven: true,
    since,
    late,
    stale,
  });

  it("ustunlar: kechikkanlar tepada, keyin eng eski", () => {
    const g = groupByStage([
      card(1, "QUEUED", "2026-11-01T09:00:00Z"),
      card(2, "QUEUED", "2026-11-01T08:00:00Z"),
      card(3, "QUEUED", "2026-11-01T10:00:00Z", true),
      card(4, "PICKING", "2026-11-01T10:00:00Z"),
    ]);
    expect(g.QUEUED.map((c) => c.id)).toEqual([3, 2, 1]);
    expect(g.PICKING.map((c) => c.id)).toEqual([4]);
    expect(g.LOADING).toEqual([]);
  });

  it("holatda turgan vaqt", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(sinceText(new Date("2026-11-03T11:15:00Z"), now)).toBe("45 daqiqa");
    expect(sinceText(new Date("2026-11-03T08:50:00Z"), now)).toBe("3 soat 10 daqiqa");
    expect(sinceText(new Date("2026-11-01T08:00:00Z"), now)).toBe("2 kun 4 soat");
  });
});

describe("reys sigʻimi", () => {
  it("band joylar bilan birga hisoblanadi", () => {
    expect(capacityState(3, 1, 5)).toEqual({ text: "4 / 5 joy", over: false });
    expect(capacityState(4, 2, 5)).toEqual({ text: "6 / 5 joy", over: true });
    expect(capacityState(7, 0, null)).toEqual({ text: "7 joy · sigʻim belgilanmagan", over: false });
  });
});

describe("codesExportUrl", () => {
  it("faqat berilgan filtrlar", () => {
    expect(codesExportUrl({})).toBe("/api/marking/codes/export");
    expect(codesExportUrl({ orderId: 7 })).toBe("/api/marking/codes/export?orderId=7");
    expect(codesExportUrl({ today: true, mine: true, q: " ab1 " })).toBe("/api/marking/codes/export?today=true&mine=true&q=ab1");
  });
});

describe("buyurtma holat yorliqlari", () => {
  const counts = [
    { count: 3, total: "3500.00" },
    { status: "DRAFT" as const, count: 1, total: "500.00" },
    { status: "CANCELLED" as const, count: 2, total: "3000.00" },
  ];

  it("«Hammasi» birinchi, har yorliqda soni; tanlangan yorliq ostida summasi", () => {
    expect(statusTabs(counts).map((t) => [t.key, t.label, t.count])).toEqual([
      ["ALL", "Hammasi", 3],
      ["DRAFT", "Qoralama", 1],
      ["CANCELLED", "Bekor qilingan", 2],
    ]);
    expect(tabSummary(counts, null)).toBe("Hammasi: 3 ta · 3.500,00 soʻm");
    expect(tabSummary(counts, "CANCELLED")).toBe("Bekor qilingan: 2 ta · 3.000,00 soʻm");
  });
});
