import { describe, expect, it } from "vitest";
import type { Employee } from "./api";
import { checkStaff, cleanLogin, displayName, formatPhone, generatePassword, inView, staffStatus, type StaffForm } from "./staff";

const emp = (over: Partial<Employee>): Employee => ({
  id: 1,
  login: "s.aliyev",
  fullName: "Sanjar Aliyev",
  lastName: "Aliyev",
  firstName: "Sanjar",
  middleName: undefined,
  phone: "+998 93 410 27 65",
  position: undefined,
  roleCode: "OPERATOR",
  roleName: "Operator",
  branchId: 1,
  status: "ACTIVE",
  mustChangePassword: true,
  allBranches: false,
  lastLoginAt: undefined,
  blockedReason: undefined,
  warehouseIds: [],
  cashAccountIds: [],
  ...over,
});

const form: StaffForm = {
  last: "Karimov",
  first: "Aziz",
  mid: "",
  phone: "+998 90 123 45 67",
  role: "OPERATOR",
  branch: "1",
  whs: [],
  cash: [],
  login: "a.karimov",
  loginTouched: false,
};

describe("staff", () => {
  it("telefonni +998 XX XXX XX XX koʻrinishiga keltiradi", () => {
    expect(formatPhone("901234567")).toBe("+998 90 123 45 67");
    expect(formatPhone("+998901")).toBe("+998 90 1");
    expect(formatPhone("")).toBe("+998");
  });

  it("loginni tozalaydi", () => {
    expect(cleanLogin("A.Karimov-1!")).toBe("a.karimov1");
  });

  it("parol 10 belgi, harf va raqam bilan", () => {
    let n = 0;
    // Avval faqat harflar chiqadi — qayta yaratiladi
    const pw = generatePassword((m) => (n++ < 10 ? 0 : (n * 7) % m));
    expect(pw).toHaveLength(10);
    expect(pw).toMatch(/\d/);
    expect(pw).toMatch(/[A-Za-z]/);
  });

  it("holat: bloklangan / kirmagan / faol", () => {
    expect(staffStatus(emp({ status: "BLOCKED" }))).toBe("blocked");
    expect(staffStatus(emp({}))).toBe("new");
    expect(staffStatus(emp({ lastLoginAt: "2026-11-08T10:00:00Z" }))).toBe("active");
    expect(displayName(emp({ firstName: undefined, lastName: undefined, fullName: "Eski Ism" }))).toBe("Eski Ism");
  });

  it("xatolar va telefon takrori", () => {
    const base = {
      id: null as number | null,
      scope: () => "own" as const,
      loginBusy: false,
      seats: { used: 1, limit: null },
      employees: [emp({})],
    };
    expect(checkStaff({ ...base, form }).errors).toEqual([]);
    expect(checkStaff({ ...base, form: { ...form, last: " ", phone: "+998 90", branch: "" } }).errors).toEqual(["last", "phone", "branch"]);
    expect(checkStaff({ ...base, scope: () => "all", form: { ...form, branch: "" } }).errors).toEqual([]);
    expect(checkStaff({ ...base, loginBusy: true, form }).errors).toEqual(["login"]);
    expect(checkStaff({ ...base, seats: { used: 40, limit: 40 }, form }).errors).toEqual(["limit"]);
    expect(checkStaff({ ...base, form: { ...form, phone: "+998 93 410 27 65" } }).dupPhone?.login).toBe("s.aliyev");
    expect(checkStaff({ ...base, id: 1, form: { ...form, phone: "+998 93 410 27 65" } }).dupPhone).toBeNull();
  });
});

describe("inView (prototip AdminStaff koʻrinishlari)", () => {
  const now = Date.parse("2026-11-09T00:00:00Z");
  const week = now - 7 * 24 * 3600 * 1000;
  const fresh = emp({ status: "ACTIVE", lastLoginAt: "2026-11-08T10:00:00Z" });
  const old = emp({ status: "ACTIVE", lastLoginAt: "2026-10-20T10:00:00Z" });
  const never = emp({ status: "ACTIVE", lastLoginAt: undefined });
  const blocked = emp({ status: "BLOCKED", lastLoginAt: "2026-11-08T10:00:00Z" });
  it("ajratadi", () => {
    expect([fresh, old, never, blocked].filter((e) => inView(e, "never", week))).toEqual([never]);
    expect([fresh, old, never, blocked].filter((e) => inView(e, "blocked", week))).toEqual([blocked]);
    expect([fresh, old, never, blocked].filter((e) => inView(e, "week", week))).toEqual([old, never]);
    expect([fresh, old, never, blocked].filter((e) => inView(e, "all", week))).toHaveLength(4);
  });
});
