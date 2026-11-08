import { describe, expect, it } from "vitest";
import type { OrderDetail } from "./api";
import { pickPhase, pickRows } from "./order-pick";

type Line = OrderDetail["lines"][number];
const line = (id: number, marked: boolean, reserved: Line["reserved"]) =>
  ({ id, productName: `P${id}`, marked, reserved }) as unknown as Line;

describe("OrderCard «Terish»", () => {
  it("partiyalar qatorlarga yoyiladi, markirovka holati bilan", () => {
    const lines = [
      line(1, true, [
        { batch: "A1", expiryDate: "2027-01-01", zone: "Asosiy", qty: 5 },
        { batch: "A2", expiryDate: "2027-02-01", zone: "Asosiy", qty: 3 },
      ]),
      line(2, false, [{ batch: "B1", expiryDate: "2027-03-01", zone: "Sovuq", qty: 2 }]),
    ];
    const picking = pickRows({ lines, status: "MARKING" });
    expect(picking.map((r) => [r.batch, r.mark])).toEqual([
      ["A1", "wait"],
      ["A2", "wait"],
      ["B1", "none"],
    ]);
    expect(pickRows({ lines, status: "CHECKING" })[0].mark).toBe("done");
  });

  it("terish bosqichi", () => {
    expect(pickPhase({ status: "PENDING_APPROVAL" })).toBe("notYet");
    expect(pickPhase({ status: "QUEUED" })).toBe("reserved");
    expect(pickPhase({ status: "PICKING", pickStartedAt: "2026-11-08T05:00:00Z" })).toBe("running");
    expect(pickPhase({ status: "MARKING", pickStartedAt: "2026-11-08T05:00:00Z", pickFinishedAt: "2026-11-08T05:20:00Z" })).toBe("done");
  });
});
