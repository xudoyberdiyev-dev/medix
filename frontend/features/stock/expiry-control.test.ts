import { describe, expect, it } from "vitest";
import { expiryTip, groupRange, parseExpiry, serializeExpiry } from "./expiry-control";

describe("Muddat nazorati", () => {
  it("guruh → server oraligʻi", () => {
    expect(groupRange(null)).toEqual({ expiringWithinDays: 90 });
    expect(groupRange("EXPIRED")).toEqual({ expiringWithinDays: -1 });
    expect(groupRange("D30")).toEqual({ expiringWithinDays: 30, minDaysLeft: 0 });
    expect(groupRange("D90")).toEqual({ expiringWithinDays: 90, minDaysLeft: 31 });
    expect(groupRange("D180")).toEqual({ expiringWithinDays: 180, minDaysLeft: 91 });
  });
  it("tavsiya", () => {
    expect(expiryTip({ daysLeft: -1, reserved: 5 })).toBe("expired");
    expect(expiryTip({ daysLeft: 10, reserved: 5 })).toBe("reserved");
    expect(expiryTip({ daysLeft: 10, reserved: 0 })).toBe("d30");
    expect(expiryTip({ daysLeft: 60, reserved: 0 })).toBe("d90");
    expect(expiryTip({ daysLeft: 120, reserved: 0 })).toBe("watch");
  });
  it("URL: standartlar yozilmaydi, notoʻgʻri qiymatlar tashlanadi", () => {
    const f = parseExpiry(new URLSearchParams("group=D30&sort=QTY&desc=1&page=2&size=100"));
    expect(f).toEqual({ group: "D30", sort: "QTY", desc: true, page: 2, size: 100 });
    expect(serializeExpiry(f)).toBe("group=D30&sort=QTY&desc=1&page=2&size=100");
    expect(parseExpiry(new URLSearchParams("group=X&sort=Y&size=7"))).toEqual({ group: null, sort: null, desc: false, page: 1, size: 50 });
    expect(serializeExpiry(parseExpiry(new URLSearchParams("")))).toBe("");
  });
});
