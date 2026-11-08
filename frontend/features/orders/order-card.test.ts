import { describe, expect, it } from "vitest";
import { cents, fromCents, orderSteps } from "./order-card";

const states = (s: ReturnType<typeof orderSteps>) => s.map((x) => `${x.status}:${x.state}`);

describe("orderSteps — buyurtma bosqichlari (prototip OrderCard)", () => {
  it("yetkazib berish: joriy bosqich, oldingilari bajarilgan", () => {
    const s = orderSteps({ status: "PICKING", deliveryType: "DELIVERY" });
    expect(s).toHaveLength(9);
    expect(states(s).slice(0, 4)).toEqual(["DRAFT:done", "QUEUED:done", "PICKING:current", "MARKING:todo"]);
  });

  it("oʻzi olib ketadi — yuklash va yoʻl bosqichlarisiz", () => {
    const s = orderSteps({ status: "DOCUMENTING", deliveryType: "PICKUP" });
    expect(s.map((x) => x.status)).not.toContain("LOADING");
    expect(s.map((x) => x.status)).not.toContain("IN_TRANSIT");
  });

  it("tasdiq talab qilingan — «Tasdiqlashda» qoʻshiladi; rad etilsa qizil", () => {
    expect(orderSteps({ status: "QUEUED", deliveryType: "DELIVERY", approvalLevel: "BRANCH" })[1]).toEqual({
      status: "PENDING_APPROVAL",
      state: "done",
    });
    expect(orderSteps({ status: "REJECTED", deliveryType: "DELIVERY" })[1]).toEqual({ status: "PENDING_APPROVAL", state: "fail" });
  });

  it("yetkazildi — hammasi bajarilgan; yetkazilmadi — oxirgisi qizil", () => {
    expect(orderSteps({ status: "DELIVERED", deliveryType: "DELIVERY" }).every((x) => x.state === "done")).toBe(true);
    expect(orderSteps({ status: "UNDELIVERED", deliveryType: "DELIVERY" }).at(-1)?.state).toBe("fail");
  });

  it("bekor qilingan — toʻxtagan joyi qizil", () => {
    const s = orderSteps({ status: "CANCELLED", deliveryType: "DELIVERY", submittedAt: "x", pickStartedAt: "y" });
    expect(s.find((x) => x.state === "fail")?.status).toBe("PICKING");
  });
});

describe("cents — pul tiyinda (float yoʻq)", () => {
  it("satr ↔ tiyin", () => {
    expect(cents("1250.50")).toBe(125050n);
    expect(cents("-3257360.00")).toBe(-325736000n);
    expect(cents("7")).toBe(700n);
    expect(fromCents(cents("13257360.00") + cents("1920000.00") - cents("10000000.00"))).toBe("5177360.00");
    expect(fromCents(-5n)).toBe("-0.05");
  });
});
