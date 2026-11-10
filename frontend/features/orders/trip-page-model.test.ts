import { describe, expect, it } from "vitest";
import type { ReadyOrder } from "./shipments-model";
import { availableOrders, moveItem, stopTotals, tripSteps } from "./trip-page-model";

const o = (id: number, x: Partial<ReadyOrder> = {}): ReadyOrder =>
  ({
    id,
    number: `BY-TSH-00000${id}`,
    branchId: 1,
    customer: "Medion Clinic",
    address: "Yunusobod",
    delivery: "DELIVERY",
    places: 1,
    total: "10.00",
    ...x,
  }) as ReadyOrder;

describe("reys sahifasi modeli", () => {
  it("sudrab koʻchirish", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });

  it("qoʻshish mumkin boʻlgan buyurtmalar: filial, yetkazish, qidiruv (apostrofsiz)", () => {
    const list = [o(1), o(2, { branchId: 2 }), o(3, { delivery: "PICKUP" }), o(4, { customer: "Mirzo Ulugʻbek apteka" })];
    expect(availableOrders(list, 1, "").map((x) => x.id)).toEqual([1, 4]);
    expect(availableOrders(list, 1, "ulugbek").map((x) => x.id)).toEqual([4]);
    expect(availableOrders(list, 1, "000001").map((x) => x.id)).toEqual([1]);
  });

  it("jamilar", () => {
    expect(
      stopTotals([
        { lines: 2, qty: 5, total: "10.50" },
        { lines: 1, qty: 3, total: "0.55" },
      ]),
    ).toEqual({ stops: 2, lines: 3, qty: 8, sum: "11.05" });
  });

  it("bosqichlar", () => {
    expect(tripSteps("IN_TRANSIT").map((s) => s.state)).toEqual(["done", "cur", "next", "next"]);
    expect(tripSteps("CANCELLED")).toEqual([
      { key: "PLANNED", state: "done" },
      { key: "CANCELLED", state: "fail" },
    ]);
  });
});
