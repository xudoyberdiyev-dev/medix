import { describe, expect, it } from "vitest";
import { purchaserAttentionRows } from "./purchaser-home";

const base = {
  today: "2026-11-05",
  branchId: 1,
  receipts: { toAccept: 0, toAcceptMine: 0, toPost: 2, toPostMine: 1 },
  supplierDebt: { debt: "700000.00", overdue: "0.00", advance: "0.00" },
  due: { overdue: "0.00", today: "700000.00", next3Days: "0.00" },
  topSuppliers: [],
  bonus: { balance: "0.00", pending: 1, pendingOverdue: 1 },
  ownGoods: { products: 0, broughtQty: 0, leftQty: 0, expiring90: 0 },
};

describe("purchaserAttentionRows", () => {
  it("faqat noldan farqli qatorlar, filtrli havolalar bilan", () => {
    const rows = purchaserAttentionRows(base);
    expect(rows.map((r) => r.key)).toEqual(["s1", "post", "bo"]);
    expect(rows[1]?.href).toBe("/receipts?status=ACCEPTED");
    expect(rows[2]?.danger).toBe(true);
  });
});
