import { describe, expect, it } from "vitest";
import { sectionsFor } from "./settings-sections";
import {
  activeZoneCount,
  filterBranches,
  groupByBranch,
  missingOptionalZones,
  warehouseTree,
  type Branch,
  type Warehouse,
  type WarehouseOverviewItem,
} from "./api";

const branch = (id: number, over: Partial<Branch> = {}): Branch => ({
  id,
  code: "TSH",
  name: "Toshkent",
  legalName: "Medix TSH MChJ",
  tin: "301234567",
  vatPayer: true,
  bankAccounts: [],
  active: true,
  ...over,
});

const warehouse = (id: number, branchId: number, types: Warehouse["zones"][number]["type"][]): Warehouse => ({
  id,
  branchId,
  name: `Ombor ${id}`,
  active: true,
  kind: "NORMAL",
  zones: types.map((type, i) => ({ id: id * 10 + i, type, name: type, sellable: type === "MAIN", active: true })),
});

describe("filterBranches", () => {
  const list = [branch(1), branch(2, { code: "SMQ", name: "Samarqand", tin: "302222222", legalName: "Medix SMQ" })];
  it("nom, kod va STIR boʻyicha qidiradi", () => {
    expect(filterBranches(list, "smq").map((b) => b.id)).toEqual([2]);
    expect(filterBranches(list, "30123").map((b) => b.id)).toEqual([1]);
    expect(filterBranches(list, "  ")).toHaveLength(2);
  });
});

describe("missingOptionalZones", () => {
  it("faqat yoʻq Sovuq/Seyf zonalarini qaytaradi", () => {
    expect(missingOptionalZones(warehouse(1, 1, ["RECEIVING", "MAIN", "QUARANTINE", "SHIPPING"]))).toEqual(["COLD", "SAFE"]);
    expect(missingOptionalZones(warehouse(2, 1, ["MAIN", "COLD"]))).toEqual(["SAFE"]);
  });
});

describe("groupByBranch", () => {
  it("omborsiz nofaol filialni yashiradi", () => {
    const groups = groupByBranch([branch(1), branch(2, { active: false }), branch(3, { active: false })], [warehouse(1, 3, ["MAIN"])]);
    expect(groups.map((g) => g.branch.id)).toEqual([1, 3]);
  });
});

describe("sectionsFor", () => {
  it("Filial rahbari (staff.view, audit.view) — Xodimlar, Audit, Profil", () => {
    expect(sectionsFor(["staff.view", "audit.view"]).map((s) => s.href)).toEqual(["/settings/employees", "/settings/audit", "/profile"]);
  });
  it("Sozlash ustasi — company.edit bilan", () => {
    expect(sectionsFor(["staff.view"]).some((s) => s.href === "/setup")).toBe(false);
    expect(sectionsFor(["company.edit"]).some((s) => s.href === "/setup")).toBe(true);
  });
});

const item = (id: number, branchId: number, zones: [WarehouseOverviewItem["zones"][number]["type"], boolean][]): WarehouseOverviewItem => ({
  id,
  branchId,
  branchName: branchId === 1 ? "Toshkent" : "Samarqand",
  branchCode: branchId === 1 ? "TSH" : "SMQ",
  name: `Ombor ${id}`,
  active: true,
  kind: "NORMAL",
  qty: 0,
  products: 0,
  zones: zones.map(([type, active], i) => ({ id: id * 10 + i, type, name: type, sellable: type === "MAIN", active, qty: 0, products: 0 })),
});

describe("Omborlar va zonalar daraxti", () => {
  it("omborlarni filial boʻyicha guruhlaydi, tartibni saqlaydi", () => {
    const tree = warehouseTree([item(1, 1, []), item(2, 2, []), item(3, 1, [])]);
    expect(tree.map((g) => [g.code, g.items.map((w) => w.id)])).toEqual([
      ["TSH", [1, 3]],
      ["SMQ", [2]],
    ]);
  });

  it("faqat faol zonalarni sanaydi", () => {
    expect(
      activeZoneCount([
        item(1, 1, [
          ["MAIN", true],
          ["COLD", false],
        ]),
        item(2, 1, [["RECEIVING", true]]),
      ]),
    ).toBe(2);
    expect(activeZoneCount([])).toBe(0);
  });
});
