import { describe, expect, it } from "vitest";
import { MAX_RECENT, parseRecent, pushRecent } from "./recent";

describe("oxirgi ochilganlar (U6)", () => {
  it("yangisi boshida, takror — bitta, chegara 10", () => {
    let l: string[] = [];
    for (let i = 0; i < 12; i++) l = pushRecent(l, `/orders/${i}`);
    l = pushRecent(l, "/orders/5");
    expect(l[0]).toBe("/orders/5");
    expect(l).toHaveLength(MAX_RECENT);
    expect(l.filter((p) => p === "/orders/5")).toHaveLength(1);
  });
  it("bosh sahifa, kirish va notoʻgʻri qiymatlar yozilmaydi", () => {
    expect(pushRecent([], "/")).toEqual([]);
    expect(pushRecent([], "/login")).toEqual([]);
    expect(parseRecent("{bad")).toEqual([]);
    expect(parseRecent(JSON.stringify(["/stock", 5, "http://x"]))).toEqual(["/stock"]);
  });
});
