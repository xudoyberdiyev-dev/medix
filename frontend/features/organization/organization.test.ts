import { describe, expect, it } from "vitest";
import { sectionsFor } from "./settings-sections";
import { filterBranches, groupByBranch, missingOptionalZones, type Branch, type Warehouse } from "./api";

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
  zones: types.map((type, i) => ({ id: id * 10 + i, type, name: type, sellable: type === "MAIN" })),
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
