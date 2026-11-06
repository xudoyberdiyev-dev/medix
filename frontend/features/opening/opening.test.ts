import { describe, expect, it } from "vitest";
import { duplicateKey, lineTotal, tiyinToMoney } from "./api";

describe("BQ summalari (float yoʻq)", () => {
  it("tannarx × soni tiyinda", () => {
    expect(lineTotal("12500.50", 100)).toBe(125005000n);
    expect(lineTotal("0.1", 3)).toBe(30n);
    expect(lineTotal("40000", 3)).toBe(12000000n);
    expect(tiyinToMoney(125005000n + 6250250n + 12000000n)).toBe("1432552.50");
    expect(tiyinToMoney(5n)).toBe("0.05");
    expect(tiyinToMoney(0n)).toBe("0.00");
  });

  it("takror qator kaliti — partiya katta-kichik harf farqsiz", () => {
    const a = { productId: 1, batchNumber: " pr-1 ", zoneId: 2, bonus: false };
    expect(duplicateKey(a)).toBe(duplicateKey({ ...a, batchNumber: "PR-1" }));
    expect(duplicateKey(a)).not.toBe(duplicateKey({ ...a, bonus: true }));
    expect(duplicateKey(a)).not.toBe(duplicateKey({ ...a, zoneId: 3 }));
  });
});
