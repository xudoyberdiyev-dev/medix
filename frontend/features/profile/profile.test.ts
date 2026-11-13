import { describe, expect, it } from "vitest";
import { checkProfile, describeDevice, profileForm, validatePin, type Profile } from "./api";

describe("validatePin", () => {
  it("4–6 raqam talab qiladi", () => {
    expect(validatePin("12", "12").pin).toBeDefined();
    expect(validatePin("12a4", "12a4").pin).toBeDefined();
    expect(validatePin("1234567", "1234567").pin).toBeDefined();
  });
  it("oson PIN'larni rad etadi", () => {
    expect(validatePin("1111", "1111").pin).toBeDefined();
    expect(validatePin("123456", "123456").pin).toBeDefined();
    expect(validatePin("9876", "9876").pin).toBeDefined();
  });
  it("takrori mos kelishi kerak", () => {
    expect(validatePin("4826", "4827").repeat).toBeDefined();
    expect(validatePin("4826", "4826")).toEqual({});
  });
});

describe("describeDevice", () => {
  it("brauzer va tizimni ajratadi", () => {
    expect(
      describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"),
    ).toEqual({ browser: "Chrome", os: "Windows", mobile: false });
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browser: "Safari", os: "iPhone", mobile: true });
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0").browser).toBe("Edge");
    expect(describeDevice(null)).toEqual({ browser: null, os: null, mobile: false });
  });
});

describe("profil shakli (O0)", () => {
  const base = {
    id: 1,
    login: "ceo",
    fullName: "CEO",
    roleCode: "DIRECTOR",
    roleName: "Direktor",
    pinSet: false,
  } as Profile;
  it("eski yozuvda F.I.Sh. qismlari toʻliq ismdan olinadi", () => {
    expect(profileForm(base)).toMatchObject({ first: "CEO", last: "", login: "ceo", birth: "" });
    expect(profileForm({ ...base, fullName: "Aziz Karimov" })).toMatchObject({ first: "Aziz", last: "Karimov" });
    expect(profileForm({ ...base, lastName: "Karimov", firstName: "Aziz", birthDate: "1985-03-21" })).toMatchObject({
      last: "Karimov",
      birth: "21.03.1985",
    });
  });
  it("majburiy maydonlar, login, telefon, email va tugʻilgan sana tekshiriladi", () => {
    const ok = { ...profileForm(base), last: "Karimov", first: "Aziz" };
    expect(checkProfile(ok, "2026-11-13")).toEqual([]);
    expect(checkProfile({ ...ok, last: " ", first: "" }, "2026-11-13")).toEqual(["last", "first"]);
    expect(checkProfile({ ...ok, login: "a b" }, "2026-11-13")).toEqual(["login"]);
    expect(checkProfile({ ...ok, phone: "+998 90 12" }, "2026-11-13")).toEqual(["phone"]);
    expect(checkProfile({ ...ok, phone: "+998 90 123 45 67" }, "2026-11-13")).toEqual([]);
    expect(checkProfile({ ...ok, phone: "+998" }, "2026-11-13")).toEqual([]);
    expect(checkProfile({ ...ok, email: "notogri" }, "2026-11-13")).toEqual(["email"]);
    expect(checkProfile({ ...ok, birth: "31.02.1990" }, "2026-11-13")).toEqual(["birth"]);
    expect(checkProfile({ ...ok, birth: "14.11.2026" }, "2026-11-13")).toEqual(["birth"]);
    expect(checkProfile({ ...ok, birth: "21.03.1985" }, "2026-11-13")).toEqual([]);
  });
});
