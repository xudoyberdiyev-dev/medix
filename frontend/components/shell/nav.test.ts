import { describe, expect, it } from "vitest";
import { navigationFor } from "./nav";

const keys = (role: string) => navigationFor(role).flatMap((g) => g.items.map((i) => i.key));

describe("rolga qarab menyu", () => {
  it("panel rollari faqat bosh sahifani koʻradi", () => {
    expect(keys("PICKER")).toEqual(["home"]);
    expect(keys("DRIVER")).toEqual(["home"]);
  });

  it("Buxgalterga Qoldiqlar yopiq, Sozlamalar faqat Direktor va Admin", () => {
    expect(keys("ACCOUNTANT")).not.toContain("stock");
    expect(keys("ACCOUNTANT")).not.toContain("settings");
    expect(keys("DIRECTOR")).toContain("settings");
    expect(keys("OPERATOR")).toContain("orders");
    expect(navigationFor(undefined)).toEqual([]);
  });
});
