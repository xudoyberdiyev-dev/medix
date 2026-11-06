import { describe, expect, it } from "vitest";
import { partialTotals } from "./partial";

const lines = [
  { id: 1, qty: 5, price: "1000.00" },
  { id: 2, qty: 2, price: "12345.67" },
];

describe("partialTotals", () => {
  it("qaytgan summa va mijoz toʻlaydigan qism (tiyinlarda, float yoʻq)", () => {
    const r = partialTotals(lines, { 1: "2", 2: "1" }, "29691.34");
    expect(r.returned).toBe("14345.67");
    expect(r.net).toBe("15345.67");
    expect(r.units).toBe(3);
    expect(r.invalid).toBe(false);
    expect(r.all).toBe(false);
  });

  it("boʻsh maydon — 0, sotilgandan koʻp — xato, hammasi qaytsa — belgi", () => {
    expect(partialTotals(lines, {}, "29691.34").units).toBe(0);
    expect(partialTotals(lines, { 1: "6" }, "29691.34").invalid).toBe(true);
    expect(partialTotals(lines, { 1: "5", 2: "2" }, "29691.34").all).toBe(true);
    expect(partialTotals([{ id: 1, qty: 1, price: "0.50" }], { 1: "1" }, "0.50").net).toBe("0.00");
  });
});
