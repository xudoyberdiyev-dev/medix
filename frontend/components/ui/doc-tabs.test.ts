import { describe, expect, it } from "vitest";
import { docEvents } from "./doc-tabs";

describe("docEvents", () => {
  it("yaratish, rad etish va bekor qilish vaqt boʻyicha", () => {
    const ev = docEvents({
      createdAt: "2026-11-11T09:00:00Z",
      createdBy: "Operator",
      cancelledAt: "2026-11-11T11:00:00Z",
      cancelledBy: "Rahbar",
      cancelReason: "Xato",
      rejectedAt: "2026-11-11T10:00:00Z",
      rejectedBy: "Ombor mudiri",
      rejectReason: "Tovar yoʻq",
    });
    expect(ev.map((e) => e.kind)).toEqual(["create", "reject", "cancel"]);
    expect(ev[2]).toMatchObject({ who: "Rahbar", reason: "Xato" });
  });
  it("faqat yaratilgan", () => {
    expect(docEvents({ createdAt: "2026-11-11T09:00:00Z", createdBy: "CEO", postedAt: null })).toHaveLength(1);
  });
});
