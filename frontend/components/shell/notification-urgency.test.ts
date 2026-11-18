import { describe, expect, it } from "vitest";
import { unreadCounts, urgency } from "./notification-urgency";

describe("bildirishnoma muhimligi (U10)", () => {
  it("tasdiq, muammo, kamomad, kechikish, topshiriq — harakat kerak", () => {
    for (const k of [
      "order.approval",
      "order.issue",
      "transfer.ok.shortage",
      "receipt.due",
      "TASK",
      "inventory.check",
      "qm.accept",
      "TRIP_RETURN_WAIT",
    ])
      expect(urgency(k), k).toBe("action");
  });
  it("natija xabarlari — kulrang", () => {
    for (const k of [
      "order.approved",
      "cash.rejected",
      "receipt.accepted",
      "transfer.fs.sent",
      "ytpayment.returned",
      "bonus.idle",
      "MESSAGE",
    ])
      expect(urgency(k), k).toBe("info");
  });
  it("faqat oʻqilmaganlar sanaladi", () => {
    expect(
      unreadCounts([{ kind: "order.approval" }, { kind: "order.approved" }, { kind: "order.issue", readAt: "2026-11-19T00:00:00Z" }]),
    ).toEqual({
      action: 1,
      info: 1,
    });
  });
});
