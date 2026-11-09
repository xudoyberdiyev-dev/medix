import { describe, expect, it } from "vitest";
import { buildMatrix, cellOf, legendOf, type BqDoc } from "./matrix";

const doc = (p: Partial<BqDoc>): BqDoc => ({
  key: "x",
  id: 1,
  type: "GOODS",
  number: "BQ-TSH-000001",
  branchId: 1,
  warehouseId: 10,
  place: "Asosiy ombor",
  cutoffDate: "2026-11-01",
  lines: 3,
  total: "100.00",
  source: "MANUAL",
  status: "DRAFT",
  postedAt: null,
  createdAt: "2026-11-01T10:00:00Z",
  ...p,
});

describe("BQ matritsasi", () => {
  it("oʻtkazilgani ustun, keyin eng yangi qoralama", () => {
    expect(cellOf([]).state).toBe("NONE");
    const a = doc({ id: 1, createdAt: "2026-11-01T10:00:00Z" });
    const b = doc({ id: 2, createdAt: "2026-11-02T10:00:00Z" });
    expect(cellOf([a, b]).doc?.id).toBe(2);
    expect(cellOf([a, doc({ id: 3, status: "POSTED" }), b]).doc?.id).toBe(3);
    expect(cellOf([doc({ status: "CANCELLED" })]).state).toBe("NONE");
  });

  it("tovar — har faol ombor, qolganlari — filial boʻyicha", () => {
    const rows = buildMatrix(
      [
        { id: 1, name: "Toshkent filiali" },
        { id: 2, name: "Samarqand filiali" },
      ],
      [
        { id: 10, branchId: 1, name: "Asosiy ombor", active: true },
        { id: 11, branchId: 1, name: "Chilonzor ombori", active: true },
        { id: 12, branchId: 1, name: "Yopiq", active: false },
        { id: 20, branchId: 2, name: "Asosiy ombor", active: true },
      ],
      [
        doc({ warehouseId: 10, status: "POSTED", postedAt: "2026-11-02T10:00:00Z" }),
        doc({ id: 5, type: "MONEY", warehouseId: null, branchId: 2, status: "DRAFT" }),
        doc({ id: 6, type: "CUSTOMER_DEBT", warehouseId: null, branchId: 1, status: "POSTED" }),
      ],
    );
    expect(rows[0].name).toBe("Toshkent");
    expect(rows[0].cells.GOODS.map((c) => c.state)).toEqual(["POSTED", "NONE"]);
    expect(rows[0]).toMatchObject({ postedWarehouses: 1, warehouses: 2 });
    expect(rows[0].cells.CUSTOMER_DEBT[0].state).toBe("POSTED");
    expect(rows[1].cells.MONEY[0].state).toBe("DRAFT");
    expect(rows[1].cells.CUSTOMER_DEBT[0].state).toBe("NONE");
    expect(legendOf(rows)).toEqual({ NONE: 6, DRAFT: 1, POSTED: 2 });
  });
});
