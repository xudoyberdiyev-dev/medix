import { describe, expect, it } from "vitest";
import { otherBatchOptions, type PickBatch } from "./other-batch-modal";

const b = (batchId: number, free: number, reserved: number): PickBatch => ({
  batchId,
  number: `P-${batchId}`,
  expiryDate: "2027-01-01",
  bonus: false,
  free,
  reserved,
});

describe("otherBatchOptions", () => {
  it("yagona zahira partiyasi roʻyxatga kirmaydi, yetmaydiganlar belgilanadi", () => {
    const r = otherBatchOptions([b(1, 6, 3), b(2, 10, 0), b(3, 2, 0)], 3);
    expect(r.map((x) => [x.batch.batchId, x.enough])).toEqual([
      [2, true],
      [3, false],
    ]);
  });

  it("zahira bir necha partiyada boʻlsa — har biri tanlanishi mumkin", () => {
    const r = otherBatchOptions([b(1, 2, 2), b(2, 5, 3)], 5);
    expect(r.map((x) => [x.batch.batchId, x.enough])).toEqual([
      [1, false],
      [2, true],
    ]);
  });
});
