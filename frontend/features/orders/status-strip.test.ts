import { describe, expect, it } from "vitest";
import { quickOn, quickPatch, splitStatuses } from "./status-strip";

const c = (status: string | null, count: number) => ({ status, count });
const counts = [
  c(null, 20),
  c("DRAFT", 0),
  c("PENDING_APPROVAL", 3),
  c("QUEUED", 0),
  c("PICKING", 5),
  c("DELIVERED", 12),
  c("CANCELLED", 0),
];
const keys = (l: { status?: string | null }[]) => l.map((x) => x.status ?? "ALL");

describe("ixcham holat chizigʻi (U5)", () => {
  it("«Hammasi» va soni borlar koʻrinadi, nollar «Yana»da — tartib saqlanadi", () => {
    const r = splitStatuses(counts, "ALL", "ALL");
    expect(keys(r.shown)).toEqual(["ALL", "PENDING_APPROVAL", "PICKING", "DELIVERED"]);
    expect(keys(r.more)).toEqual(["DRAFT", "QUEUED", "CANCELLED"]);
  });

  it("tanlangan holat soni nol boʻlsa ham koʻrinadi", () => {
    expect(keys(splitStatuses(counts, "QUEUED", "ALL").shown)).toContain("QUEUED");
  });

  it("koʻpi bilan max ta: kam sonlilari «Yana»ga", () => {
    const r = splitStatuses(counts, "ALL", "ALL", 2);
    expect(keys(r.shown)).toEqual(["ALL", "PICKING", "DELIVERED"]);
    expect(keys(r.more)).toEqual(["DRAFT", "PENDING_APPROVAL", "QUEUED", "CANCELLED"]);
    expect(keys(splitStatuses(counts, "PENDING_APPROVAL", "ALL", 2).shown)).toEqual(["ALL", "PENDING_APPROVAL", "DELIVERED"]);
  });
});

describe("tayyor koʻrinishlar (U5)", () => {
  const base = { mine: false, overdue: false, orderFrom: null, orderTo: null };
  it("yoqish va oʻchirish", () => {
    expect(quickPatch("mine", false, "2026-11-19")).toEqual({ mine: true });
    expect(quickPatch("overdue", true, "2026-11-19")).toEqual({ overdue: false });
    expect(quickPatch("today", false, "2026-11-19")).toEqual({ orderFrom: "2026-11-19", orderTo: "2026-11-19" });
    expect(quickPatch("today", true, "2026-11-19")).toEqual({ orderFrom: null, orderTo: null });
  });
  it("faolligi filtrlardan", () => {
    expect(quickOn("today", { ...base, orderFrom: "2026-11-19", orderTo: "2026-11-19" }, "2026-11-19")).toBe(true);
    expect(quickOn("today", { ...base, orderFrom: "2026-11-18", orderTo: "2026-11-19" }, "2026-11-19")).toBe(false);
    expect(quickOn("overdue", { ...base, overdue: true }, "2026-11-19")).toBe(true);
    expect(quickOn("mine", base, "2026-11-19")).toBe(false);
  });
});
