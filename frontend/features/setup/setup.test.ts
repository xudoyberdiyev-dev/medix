import { describe, expect, it } from "vitest";
import { firstIncompleteStep, type SetupStatus } from "./api";
import { canLeaveStep } from "./setup-wizard";

const base: SetupStatus = { completed: false, branches: [], warehouses: [], employees: [], blockers: [] };
const branch = { id: 1, code: "TSH", name: "Toshkent", legalName: "Medix TSH", tin: "301234567", active: true };
const warehouse = { id: 7, branchId: 1, name: "Markaziy", active: true, zones: [] };

describe("sozlash ustasi qadamlari", () => {
  it("birinchi bajarilmagan qadamdan davom etadi", () => {
    expect(firstIncompleteStep(base)).toBe(0);
    const withCompany = { ...base, company: { id: 1, name: "Medix Group" } };
    expect(firstIncompleteStep(withCompany)).toBe(1);
    expect(firstIncompleteStep({ ...withCompany, branches: [branch] })).toBe(2);
    expect(firstIncompleteStep({ ...withCompany, branches: [branch], warehouses: [warehouse] })).toBe(3);
  });

  it("har filialda ombor boʻlmaguncha omborlar qadamidan oʻtilmaydi", () => {
    const s = { ...base, company: { id: 1, name: "M" }, branches: [branch, { ...branch, id: 2, code: "SMQ" }], warehouses: [warehouse] };
    expect(canLeaveStep(1, s)).toBe(true);
    expect(canLeaveStep(2, s)).toBe(false);
    expect(canLeaveStep(2, { ...s, warehouses: [warehouse, { ...warehouse, id: 8, branchId: 2 }] })).toBe(true);
  });
});
