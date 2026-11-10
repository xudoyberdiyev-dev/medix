import { describe, expect, it } from "vitest";
import type { WarehouseTransferDetail } from "./api";
import { draftKey, fefo, okHistory, okSteps } from "./doc-model";

const doc = (over: Partial<WarehouseTransferDetail>): WarehouseTransferDetail => ({
  id: 1,
  number: "OK-TSH-000001",
  branchId: 1,
  fromWarehouse: { id: 1, name: "Asosiy" },
  fromZone: { id: 1, name: "Asosiy saqlash", type: "MAIN" },
  toWarehouse: { id: 2, name: "Chilonzor" },
  createdAt: "2026-10-04T05:00:00Z",
  createdBy: "Sardor Aliyev",
  lines: [],
  status: "DRAFT",
  totalQty: 100,
  shortageQty: 0,
  ...over,
});

describe("OK hujjati — bosqichlar", () => {
  it("yoʻlda: qoralama bajarilgan, joʻnatildi joriy", () => {
    expect(okSteps("IN_TRANSIT").map((s) => s.state)).toEqual(["done", "cur", "next"]);
  });
  it("qabul qilingan — hammasi bajarilgan", () => {
    expect(okSteps("RECEIVED").map((s) => s.state)).toEqual(["done", "done", "done"]);
  });
  it("bekor qilingan — qoralama xato", () => {
    expect(okSteps("CANCELLED").map((s) => s.state)).toEqual(["fail", "next", "next"]);
  });
});

describe("OK hujjati — tarix", () => {
  it("farq bilan qabul — «diff», eng yangisi yuqorida", () => {
    const h = okHistory(
      doc({
        status: "RECEIVED",
        sentAt: "2026-10-04T05:20:00Z",
        sentBy: "Sardor Aliyev",
        receivedAt: "2026-10-04T08:00:00Z",
        receivedBy: "Bekzod Tursunov",
        receiveNote: "2 ta shikastlangan",
        shortageQty: 2,
      }),
    );
    expect(h.map((e) => e.action)).toEqual(["diff", "transit", "create"]);
    expect(h[0].reason).toBe("2 ta shikastlangan");
  });
  it("qoralama bekor qilingan", () => {
    const h = okHistory(doc({ status: "CANCELLED", cancelledAt: "2026-10-04T06:00:00Z", cancelledBy: "Akmal Karimov" }));
    expect(h.map((e) => e.action)).toEqual(["cancelled", "create"]);
  });
});

describe("OK qoralama kaliti va FEFO", () => {
  it("qatorlar tartibi va izoh boʻshliqlari kalitni oʻzgartirmaydi", () => {
    const a = {
      fromZoneId: 1,
      toWarehouseId: 2,
      note: " x ",
      lines: [
        { batchId: 5, qty: 1 },
        { batchId: 3, qty: 2 },
      ],
    };
    const b = {
      fromZoneId: 1,
      toWarehouseId: 2,
      note: "x",
      lines: [
        { batchId: 3, qty: 2 },
        { batchId: 5, qty: 1 },
      ],
    };
    expect(draftKey(a)).toBe(draftKey(b));
    expect(
      draftKey({
        ...b,
        lines: [
          { batchId: 3, qty: 3 },
          { batchId: 5, qty: 1 },
        ],
      }),
    ).not.toBe(draftKey(a));
    expect(draftKey(null)).toBeNull();
  });
  it("eng yaqin muddat birinchi", () => {
    const rows = [
      { expiryDate: "2027-05-01", productName: "B", batchNumber: "2" },
      { expiryDate: "2026-12-01", productName: "C", batchNumber: "1" },
      { expiryDate: "2027-05-01", productName: "A", batchNumber: "9" },
    ];
    expect(fefo(rows).map((r) => r.productName)).toEqual(["C", "A", "B"]);
  });
});
