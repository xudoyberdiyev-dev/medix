import { describe, expect, it } from "vitest";
import { firstIncompleteStep, logoProblem, logoUrl, type SetupStatus } from "./api";
import { canLeaveStep } from "./setup-wizard";

const base: SetupStatus = { completed: false, branches: [], warehouses: [], employees: [], blockers: [] };
const branch = { id: 1, code: "TSH", name: "Toshkent", legalName: "Medix TSH", tin: "301234567", active: true, vatPayer: true, bankAccounts: [] };
const warehouse = { id: 7, branchId: 1, name: "Markaziy", active: true, zones: [] };

describe("sozlash ustasi qadamlari", () => {
  it("birinchi bajarilmagan qadamdan davom etadi", () => {
    expect(firstIncompleteStep(base)).toBe(0);
    const withCompany = { ...base, company: { id: 1, name: "Medix Group", defaultLocale: "uz-Latn" } };
    expect(firstIncompleteStep(withCompany)).toBe(1);
    expect(firstIncompleteStep({ ...withCompany, branches: [branch] })).toBe(2);
    expect(firstIncompleteStep({ ...withCompany, branches: [branch], warehouses: [warehouse] })).toBe(3);
  });

  it("har filialda ombor boʻlmaguncha omborlar qadamidan oʻtilmaydi", () => {
    const s = {
      ...base,
      company: { id: 1, name: "M", defaultLocale: "uz-Latn" },
      branches: [branch, { ...branch, id: 2, code: "SMQ" }],
      warehouses: [warehouse],
    };
    expect(canLeaveStep(1, s)).toBe(true);
    expect(canLeaveStep(2, s)).toBe(false);
    expect(canLeaveStep(2, { ...s, warehouses: [warehouse, { ...warehouse, id: 8, branchId: 2 }] })).toBe(true);
  });

  it("logotip: tur va hajm, versiyali URL", () => {
    expect(logoProblem({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(logoProblem({ name: "a.svg", type: "", size: 1000 })).toBeNull();
    expect(logoProblem({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBe("badType");
    expect(logoProblem({ name: "a.png", type: "image/png", size: 2 * 1024 * 1024 + 1 })).toBe("tooBig");
    expect(logoUrl({ logoVersion: 17 })).toBe("/api/company/logo?v=17");
    expect(logoUrl({})).toBeNull();
    expect(logoUrl(null)).toBeNull();
  });
});
