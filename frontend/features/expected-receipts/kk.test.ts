import { describe, expect, it } from "vitest";
import { centsToMoney, checkKkFile, inTransitOf, kkTotal, receivableLines, type InTransitRow, type KkLine } from "./api";

const line = (id: number, qty: number, received: number, off = 0): KkLine => ({
  id,
  lineNo: id,
  productId: 100 + id,
  productCode: `1000000${id}`,
  productName: `Dori ${id}`,
  qty,
  price: "10.00",
  amount: String(qty * 10),
  receivedQty: received,
  writtenOffQty: off,
  remainingQty: Math.max(0, qty - received - off),
});

describe("KK (O15)", () => {
  it("jami tiyinlarda, narxsiz qator belgilanadi", () => {
    const r = kkTotal([
      { qty: 500, price: "1200.50" },
      { qty: 3, price: "0.1" },
      { qty: 2, price: "" },
    ]);
    expect(centsToMoney(r.cents)).toBe("600250.30");
    expect(r.missing).toBe(true);
    expect(kkTotal([{ qty: 1, price: "5" }]).missing).toBe(false);
  });

  it("manfiy summa ham toʻgʻri koʻrinadi", () => {
    expect(centsToMoney(-25000n)).toBe("-250.00");
    expect(centsToMoney(7n)).toBe("0.07");
  });

  it("qabul qilish — faqat qolgani bor qatorlar", () => {
    expect(receivableLines([line(1, 100, 55, 5), line(2, 10, 10), line(3, 4, 0)]).map((l) => l.id)).toEqual([1, 3]);
  });

  it("yuk xati fayli: tur va hajm", () => {
    expect(checkKkFile({ name: "ttn.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(checkKkFile({ name: "ttn.JPG", type: "", size: 1000 })).toBeNull();
    expect(checkKkFile({ name: "ttn.docx", type: "application/msword", size: 1000 })).toBe("type");
    expect(checkKkFile({ name: "ttn.png", type: "image/png", size: 11 * 1024 * 1024 })).toBe("size");
    expect(checkKkFile({ name: "ttn.png", type: "image/png", size: 0 })).toBe("size");
  });

  it("yoʻldagi tovar mahsulot boʻyicha topiladi", () => {
    const rows: InTransitRow[] = [{ productId: 7, productCode: "1", productName: "A", qty: 500, nearestDate: "2026-11-21", docs: [] }];
    expect(inTransitOf(rows, 7)?.qty).toBe(500);
    expect(inTransitOf(rows, 8)).toBeUndefined();
    expect(inTransitOf(undefined, 7)).toBeUndefined();
  });
});
