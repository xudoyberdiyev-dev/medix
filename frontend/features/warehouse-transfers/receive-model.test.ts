import { describe, expect, it } from "vitest";
import type { TransferLine } from "./api";
import { receivePlan } from "./receive-model";

const line = (id: number, qty: number): TransferLine => ({
  id,
  lineNo: id,
  batchId: id * 10,
  batchNumber: `P-${id}`,
  expiryDate: "2029-01-01",
  productId: 1,
  productCode: "10000001",
  productName: "Paratsetamol",
  qty,
  damagedQty: 0,
});

describe("OK qabul rejasi", () => {
  it("hammasi toʻgʻri keldi — sababsiz, farq 0", () => {
    const p = receivePlan([line(1, 10)], { 1: { recv: "10", reason: null, zoneId: 5 } });
    expect(p.errors).toEqual({});
    expect(p.diff).toBe(0);
    expect(p.lines).toEqual([{ lineId: 1, receivedQty: 10, damagedQty: 0, toZoneId: 5, reason: undefined }]);
  });
  it("farq boʻlsa sabab majburiy; zona majburiy; butun son va joʻnatilgandan koʻp emas", () => {
    const p = receivePlan([line(1, 10), line(2, 5), line(3, 4)], {
      1: { recv: "8", reason: null, zoneId: 5 },
      2: { recv: "6", reason: null, zoneId: null },
      3: { recv: "x", reason: null, zoneId: 5 },
    });
    expect(p.errors[1]).toEqual([{ kind: "reason" }]);
    expect(p.errors[2]).toEqual([{ kind: "over", sent: 5 }, { kind: "zone" }]);
    expect(p.errors[3]).toEqual([{ kind: "num" }]);
    expect(p.lines).toEqual([]);
  });
  it("shikastlangan farq — jismonan keldi, Karantinga; kam keldi — kamomad", () => {
    const p = receivePlan([line(1, 10), line(2, 5)], {
      1: { recv: "7", reason: "DAMAGED", zoneId: 5 },
      2: { recv: "4", reason: "SHORT", zoneId: 6 },
    });
    expect(p).toMatchObject({ sent: 15, received: 11, diff: 4, damaged: 3 });
    expect(p.lines).toEqual([
      { lineId: 1, receivedQty: 10, damagedQty: 3, toZoneId: 5, reason: "DAMAGED" },
      { lineId: 2, receivedQty: 4, damagedQty: 0, toZoneId: 6, reason: "SHORT" },
    ]);
  });
});
