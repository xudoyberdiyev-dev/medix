import { describe, expect, it } from "vitest";
import { formatIsoDate, licenseState, parseMoneyInput, parseUzDate, todayTashkent } from "./api";

describe("sana", () => {
  it("KK.OO.YYYY ↔ ISO", () => {
    expect(parseUzDate("04.10.2026")).toBe("2026-10-04");
    expect(parseUzDate("31.02.2026")).toBeNull();
    expect(parseUzDate("2026-10-04")).toBeNull();
    expect(parseUzDate(" ")).toBeUndefined();
    expect(formatIsoDate("2026-10-04")).toBe("04.10.2026");
  });
  it("Toshkent sanasi", () => {
    expect(todayTashkent(new Date("2026-10-31T20:30:00Z"))).toBe("2026-11-01");
  });
});

describe("litsenziya holati", () => {
  it("muddat boʻyicha", () => {
    expect(licenseState(null, "2026-11-01")).toBe("none");
    expect(licenseState("2026-10-31", "2026-11-01")).toBe("expired");
    expect(licenseState("2026-11-20", "2026-11-01")).toBe("expiring");
    expect(licenseState("2027-11-20", "2026-11-01")).toBe("valid");
  });
});

describe("summa kiritish", () => {
  it("formatlar", () => {
    expect(parseMoneyInput("15.000.000")).toBe("15000000");
    expect(parseMoneyInput("15000000,50")).toBe("15000000.50");
    expect(parseMoneyInput("1.250.000,00")).toBe("1250000.00");
    expect(parseMoneyInput("15000000.5")).toBe("15000000.5");
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("")).toBeUndefined();
  });
});
