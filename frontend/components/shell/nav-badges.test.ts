import { describe, expect, it } from "vitest";
import { badgeMap } from "./nav-badges";

describe("badgeMap", () => {
  it("0 va ruxsatsiz (yoʻq) nishonlar koʻrsatilmaydi", () => {
    expect(badgeMap({ orders: { count: 0, danger: false }, expiry: { count: 3, danger: true } })).toEqual({
      orders: null,
      shipments: null,
      expiry: { count: 3, danger: true },
    });
    expect(badgeMap(undefined)).toEqual({});
  });
});
