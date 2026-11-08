import { describe, expect, it } from "vitest";
import type { components } from "@/lib/api/schema";
import { visibleNodes } from "./stock-tree";

type N = components["schemas"]["TreeNode"];
const n = (level: string, warehouseId?: number, zoneId?: number): N => ({
  level,
  branchId: 1,
  branch: "TSH · Toshkent",
  warehouseId,
  warehouse: warehouseId ? "Asosiy" : undefined,
  zoneId,
  zone: zoneId ? "Zona" : undefined,
  zoneType: zoneId ? "MAIN" : undefined,
  products: 1,
  qty: 5,
});

describe("ombor daraxti — yigʻish", () => {
  const nodes = [n("BRANCH"), n("WAREHOUSE", 2), n("ZONE", 2, 3), n("ZONE", 2, 4)];
  it("hammasi ochiq", () => expect(visibleNodes(nodes, [])).toHaveLength(4));
  it("ombor yigʻilsa — zonalari yashirinadi", () => expect(visibleNodes(nodes, ["1:2:"])).toHaveLength(2));
  it("filial yigʻilsa — faqat filial", () => expect(visibleNodes(nodes, ["1::"])).toHaveLength(1));
});
