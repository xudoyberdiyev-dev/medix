import { describe, expect, it } from "vitest";
import { groupPermissions } from "./roles-page";

describe("groupPermissions", () => {
  it("modullar boʻyicha, belgilangan tartibda", () => {
    const g = groupPermissions([
      { key: "staff.view", module: "staff" },
      { key: "orders.create", module: "orders" },
      { key: "orders.view", module: "orders" },
      { key: "zzz.x", module: "zzz" },
    ]);
    expect(g.map((x) => x.module)).toEqual(["orders", "staff", "zzz"]);
    expect(g[0].title).toBe("Buyurtmalar");
    expect(g[0].items).toHaveLength(2);
  });
});
