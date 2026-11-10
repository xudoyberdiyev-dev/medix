import { describe, expect, it } from "vitest";
import type { WarehouseTransferDetail } from "./api";
import { okHistory, okSteps } from "./doc-model";

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
