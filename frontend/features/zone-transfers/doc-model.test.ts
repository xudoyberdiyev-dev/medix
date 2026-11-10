import { describe, expect, it } from "vitest";
import type { ZoneTransferDetail } from "./api";
import { zkHistory, zkSteps } from "./doc-model";

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
