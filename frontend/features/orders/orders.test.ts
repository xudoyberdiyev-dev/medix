import { describe, expect, it } from "vitest";
import { canApprove, canCancelOrder } from "./api";
import { counterText } from "./marking-page";
import { groupByStage, sinceText, type MonitorCard } from "./monitor-page";
import { timerText } from "./picking-page";

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
