import { describe, expect, it } from "vitest";
import type { components } from "@/lib/api/schema";
import { buildPickSheet, parseIds } from "./pick-sheet";

type OrderDetail = components["schemas"]["OrderDetail"];
type Line = components["schemas"]["OrderLine"];

function line(id: number, code: string, name: string, qty: number, reserved: Line["reserved"], marked = false): Line {
  return {
    id,
    lineNo: id,
    productId: id,
    productCode: code,
    productName: name,
    qty,
    reserved,
    available: 0,
    controlled: false,
    marked,
    discountPct: "0.00",
  };
}

function order(id: number, number: string, lines: Line[]): OrderDetail {
  return { id, number, customer: `Mijoz ${id}`, lines } as unknown as OrderDetail;
}

describe("parseIds", () => {
  it("vergul bilan, takror va notoʻgʻri qiymatlarsiz", () => {
    expect(parseIds("3, 5,x,5,-1,0,8")).toEqual([3, 5, 8]);
    expect(parseIds(null)).toEqual([]);
    expect(parseIds("")).toEqual([]);
  });
});

describe("buildPickSheet", () => {
  it("bir xil zona + partiya jamlanadi, zona → nom → muddat tartibida, zahirasiz qator oxirida", () => {
    const a = order(1, "BY-TSH-000001", [
      line(1, "P2", "Paratsetamol", 10, [
        { zone: "B-01", batch: "L2", expiryDate: "2027-05-01", qty: 6 },
        { zone: "A-01", batch: "L1", expiryDate: "2027-01-01", qty: 4 },
      ]),
      line(2, "P9", "Yod", 3, []),
    ]);
    const b = order(2, "BY-TSH-000002", [
      line(3, "P2", "Paratsetamol", 5, [{ zone: "A-01", batch: "L1", expiryDate: "2027-01-01", qty: 5 }], true),
      line(4, "P1", "Analgin", 2, [{ zone: "A-01", batch: "X", expiryDate: "2026-12-01", qty: 2 }]),
    ]);
    const s = buildPickSheet([a, b]);
    expect(s.rows.map((r) => `${r.zone}|${r.productCode}|${r.batch}|${r.qty}`)).toEqual([
      "A-01|P1|X|2",
      "A-01|P2|L1|9",
      "B-01|P2|L2|6",
      "|P9||3",
    ]);
    expect(s.rows[1]!.orders).toEqual([
      { number: "BY-TSH-000001", qty: 4 },
      { number: "BY-TSH-000002", qty: 5 },
    ]);
    expect(s.totalQty).toBe(20);
    expect(s.orders).toEqual([
      { id: 1, number: "BY-TSH-000001", customer: "Mijoz 1", lines: 2, qty: 13, marked: false },
      { id: 2, number: "BY-TSH-000002", customer: "Mijoz 2", lines: 2, qty: 7, marked: true },
    ]);
  });
});

describe("qator boʻyicha qayta yigʻish (SPEC 188)", () => {
  it("faqat qaytarilgan qatorlar; boʻsh roʻyxat — hammasi", async () => {
    const { repickLines } = await import("./pick-sheet");
    const lines = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(repickLines({ lines, repickLineIds: [] })).toEqual(lines);
    expect(repickLines({ lines, repickLineIds: [2] })).toEqual([{ id: 2 }]);
    expect(repickLines({ lines })).toEqual(lines);
  });

  it("Hisobdan oʻtkazish: belgilanmagan yoki hammasi — butun buyurtma", async () => {
    const { returnLineIds } = await import("./order-drawer");
    const lines = [{ id: 1 }, { id: 2 }];
    expect(returnLineIds(lines, {})).toBeNull();
    expect(returnLineIds(lines, { 1: true, 2: true })).toBeNull();
    expect(returnLineIds(lines, { 2: true, 1: false })).toEqual([2]);
  });
});
