import { describe, expect, it } from "vitest";
import { navigationFor } from "./nav";

const keys = (perms: string[]) => navigationFor(perms).flatMap((g) => g.items.map((i) => i.key));

describe("ruxsatga qarab menyu", () => {
  it("panel rollari (masalan, haydovchi) faqat bosh sahifani koʻradi", () => {
    expect(keys(["trip.driver"])).toEqual(["home"]);
    expect(keys(["orders.view", "picking.do"])).toEqual(["home"]);
  });

  it("kalitga qarab: Qoldiqlar — stock.view, Sozlamalar — xodimlar/audit/…", () => {
    expect(keys(["receipt.view", "products.view"])).toEqual(["home", "receipts", "products"]);
    expect(keys(["staff.view"])).toContain("settings");
    expect(keys(["stock.view"])).toContain("stock");
    expect(navigationFor(undefined)).toEqual([]);
  });
});
