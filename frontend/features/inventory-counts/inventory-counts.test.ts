import { describe, expect, it } from "vitest";
import { changedEntries, progress, type InventoryCountLine } from "./api";

const line = (id: number, countedQty: number | null): InventoryCountLine => ({
  id,
  zone: { id: 1, name: "Asosiy", type: "MAIN" },
  batchId: id,
  batchNumber: `P-${id}`,
  expiryDate: "2029-01-01",
  productId: 1,
  productCode: "10000001",
  productName: "Paratsetamol",
  controlled: false,
  bookQty: 5,
  countedQty: countedQty ?? undefined,
  added: false,
});

describe("inventarizatsiya", () => {
  it("faqat oʻzgargan qatorlar yuboriladi, 0 ham miqdor", () => {
    const r = changedEntries([line(1, 5), line(2, null), line(3, null)], { 1: "5", 2: "0", 3: " " });
    expect(r.error).toBeNull();
    expect(r.entries).toEqual([{ lineId: 2, countedQty: 0 }]);
  });

  it("notoʻgʻri miqdor — xato matni", () => {
    expect(changedEntries([line(1, null)], { 1: "-2" }).error).toContain("Paratsetamol · P-1");
    expect(changedEntries([line(1, null)], { 1: "2,5" }).entries).toEqual([]);
  });

  it("sanoq ulushi", () => {
    expect(progress([])).toBe(0);
    expect(progress([line(1, 3), line(2, null), line(3, 0)])).toBe(67);
  });
});
