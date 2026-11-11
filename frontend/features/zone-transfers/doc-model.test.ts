import { describe, expect, it } from "vitest";
import type { ZoneTransferDetail } from "./api";
import { zkDraftKey, zkHistory, zkSteps } from "./doc-model";

const doc = (over: Partial<ZoneTransferDetail>): ZoneTransferDetail => ({
  id: 1,
  number: "ZK-TSH-000001",
  branchId: 1,
  warehouse: "Asosiy",
  warehouseId: 1,
  from: { id: 1, name: "Karantin", type: "QUARANTINE" },
  to: { id: 2, name: "Asosiy saqlash", type: "MAIN" },
  createdAt: "2026-10-04T05:00:00Z",
  createdBy: "Sardor Aliyev",
  needsApproval: true,
  lines: [],
  status: "PENDING",
  totalQty: 10,
  ...over,
});

describe("ZK hujjati — bosqichlar", () => {
  it("tasdiq kutilmoqda — rahbar tasdigʻi joriy", () => {
    expect(zkSteps("PENDING", true).map((s) => s.state)).toEqual(["done", "cur", "next"]);
  });
  it("rad etilgan — tasdiq bosqichi xato", () => {
    expect(zkSteps("REJECTED", true).map((s) => s.state)).toEqual(["done", "fail", "next"]);
  });
  it("tasdiqsiz — ikki bosqich, ikkalasi bajarilgan", () => {
    expect(zkSteps("POSTED", false)).toEqual([
      { key: "draft", state: "done" },
      { key: "posted", state: "done" },
    ]);
  });
});

describe("ZK hujjati — tarix", () => {
  it("tasdiqqa yuborildi → rad etildi (sabab bilan)", () => {
    const h = zkHistory(
      doc({ status: "REJECTED", rejectedAt: "2026-10-04T07:00:00Z", rejectedBy: "Akmal Karimov", rejectReason: "Sertifikat yoʻq" }),
    );
    expect(h.map((e) => e.action)).toEqual(["rejected", "pending"]);
    expect(h[0].reason).toBe("Sertifikat yoʻq");
  });
  it("tasdiqsiz darhol oʻtkazilgan — bitta «yaratdi» hodisasi", () => {
    const h = zkHistory(doc({ status: "POSTED", needsApproval: false, postedAt: "2026-10-04T05:00:00Z", postedBy: "Sardor Aliyev" }));
    expect(h.map((e) => e.action)).toEqual(["create"]);
  });
});

describe("ZK qoralamasi", () => {
  it("qoralama — birinchi bosqich joriy, bekor qilingan — «fail»", () => {
    expect(zkSteps("DRAFT", true).map((s) => s.state)).toEqual(["cur", "next", "next"]);
    expect(zkSteps("DRAFT", false).map((s) => s.state)).toEqual(["cur", "next"]);
    expect(zkSteps("CANCELLED", false).map((s) => s.state)).toEqual(["fail", "next"]);
  });

  it("qoralamadan koʻchirilgan — ikki voqea", () => {
    const ev = zkHistory(doc({ status: "POSTED", needsApproval: false, postedAt: "2026-10-04T05:10:00Z", postedBy: "Ali" }));
    expect(ev.map((e) => e.action)).toEqual(["moved", "draft"]);
    const now = zkHistory(doc({ status: "POSTED", needsApproval: false, postedAt: "2026-10-04T05:00:01Z" }));
    expect(now.map((e) => e.action)).toEqual(["create"]);
  });

  it("bekor qilish tarixda", () => {
    const ev = zkHistory(doc({ status: "CANCELLED", needsApproval: false, cancelledAt: "2026-10-04T06:00:00Z", cancelledBy: "Ali" }));
    expect(ev[0]).toMatchObject({ action: "cancelled", employee: "Ali" });
  });

  it("kalit qatorlar tartibiga bogʻliq emas, miqdor oʻzgarsa — boshqa", () => {
    const a = zkDraftKey({
      fromZoneId: 1,
      toZoneId: 2,
      note: " x ",
      lines: [
        { batchId: 5, qty: 1 },
        { batchId: 3, qty: 2 },
      ],
    });
    const b = zkDraftKey({
      fromZoneId: 1,
      toZoneId: 2,
      note: "x",
      lines: [
        { batchId: 3, qty: 2 },
        { batchId: 5, qty: 1 },
      ],
    });
    expect(a).toBe(b);
    expect(zkDraftKey({ fromZoneId: 1, toZoneId: 2, note: "x", lines: [{ batchId: 3, qty: 3 }] })).not.toBe(a);
    expect(zkDraftKey(null)).toBeNull();
  });
});
