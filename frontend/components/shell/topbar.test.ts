import { describe, expect, it } from "vitest";
import { navGroupFor } from "./topbar";

describe("yuqori panel: «Guruh / Sahifa»", () => {
  it("sahifa menyu guruhini topadi (yorliq sahifalari ham)", () => {
    expect(navGroupFor("/orders/12")).toBe("sales");
    expect(navGroupFor("/zone-transfers")).toBe("warehouse");
    expect(navGroupFor("/bonuses")).toBe("money");
    expect(navGroupFor("/settings/roles")).toBe("admin");
    expect(navGroupFor("/reports")).toBeUndefined();
    expect(navGroupFor("/")).toBeUndefined();
  });
});
