import { describe, expect, it } from "vitest";
import { attentionRows, cellValue, nonZero } from "./director-home";
import { periodRange } from "./period";

describe("periodRange", () => {
  it("bugun", () => {
    expect(periodRange("today", "2026-11-05")).toEqual({ from: "2026-11-05", to: "2026-11-05" });
  });
  it("hafta — dushanbadan", () => {
    expect(periodRange("week", "2026-11-05")).toEqual({ from: "2026-11-02", to: "2026-11-05" }); // payshanba
    expect(periodRange("week", "2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-02" }); // dushanba
    expect(periodRange("week", "2026-11-08")).toEqual({ from: "2026-11-02", to: "2026-11-08" }); // yakshanba
    expect(periodRange("week", "2026-03-01")).toEqual({ from: "2026-02-23", to: "2026-03-01" }); // oy chegarasi
  });
  it("oy — 1-kundan", () => {
    expect(periodRange("month", "2026-11-05")).toEqual({ from: "2026-11-01", to: "2026-11-05" });
  });
});

describe("Diqqat talab qiladi", () => {
  const zero = {
    overdue1to30: "0.00",
    overdue31to60: "0.00",
    overdue61to90: "0.00",
    overdue90plus: "0.00",
    directorOrders: { count: 0, amount: "0.00" },
    branchOrders: { count: 0, amount: "0.00" },
    cashApprovals: { count: 0, amount: "0.00" },
    expiring: { d0to30: 0, d31to60: 0, d61to90: 0, expired: 0 },
    supplierOverdue: "0.00",
    supplierToday: "0.00",
    supplierNext3Days: "0.00",
    receiptsToPost: 0,
    driverCash: "0.00",
  };
  it("nol qatorlar yashiriladi", () => {
    expect(attentionRows(zero)).toEqual([]);
  });
  it("qatorlar filtr bilan sahifaga olib boradi", () => {
    const rows = attentionRows({
      ...zero,
      overdue31to60: "1000000.00",
      directorOrders: { count: 2, amount: "350000.50" },
      receiptsToPost: 3,
    });
    expect(rows.map((r) => r.key)).toEqual(["o2", "dir", "rcp"]);
    expect(rows[1].href).toBe("/orders?status=PENDING_APPROVAL");
    expect(rows[1].label).toContain("(2)");
    expect(rows[2].href).toBe("/receipts?status=ACCEPTED");
  });
  it("tasdiq qatorlari ruxsatga qarab", () => {
    const a = { ...zero, directorOrders: { count: 1, amount: "10.00" }, branchOrders: { count: 2, amount: "20.00" } };
    expect(attentionRows(a, { director: false, branch: true }).map((r) => r.key)).toEqual(["br"]);
    expect(attentionRows(a, { director: true, branch: false }).map((r) => r.key)).toEqual(["dir"]);
  });
  it("nonZero", () => {
    expect(nonZero("0.00")).toBe(false);
    expect(nonZero("0.01")).toBe(true);
    expect(nonZero("-5.00")).toBe(true);
  });
});

describe("Buyurtma holatlari katagi", () => {
  const c = { status: "QUEUED", count: 5, amount: "500.00", todayCount: 2, todayAmount: "200.00", staleCount: 1, staleAmount: "50.00" };
  it("filtr boʻyicha", () => {
    expect(cellValue(c, "all")).toEqual({ count: 5, amount: "500.00" });
    expect(cellValue(c, "today")).toEqual({ count: 2, amount: "200.00" });
    expect(cellValue(c, "stale")).toEqual({ count: 1, amount: "50.00" });
  });
});
