import { describe, expect, it } from "vitest";
import { isThemePref, resolveTheme } from "./theme";
import { THEME_INIT_SCRIPT, THEME_KEY } from "./theme-init";

describe("mavzu (O24)", () => {
  it("tizim boʻyicha — qurilma sozlamasiga qarab", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
  it("faqat maʼlum qiymatlar qabul qilinadi", () => {
    expect(isThemePref("dark")).toBe(true);
    expect(isThemePref("blue")).toBe(false);
    expect(isThemePref(null)).toBe(false);
  });
  it("<head> skripti shu kalitni oʻqiydi va xatoda jim qoladi", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_KEY);
    expect(THEME_INIT_SCRIPT).toContain("catch");
  });
});
