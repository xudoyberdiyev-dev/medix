import { describe, expect, it } from "vitest";
import { passwordChecks, passwordScore, passwordValid } from "./password-rules";
import { safeNext } from "./session";

describe("safeNext", () => {
  it("faqat ichki yoʻllar", () => {
    expect(safeNext("/orders?status=new")).toBe("/orders?status=new");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/login")).toBe("/");
  });
});

describe("parol talablari", () => {
  it("uzunlik, raqam, harf, vaqtinchalikdan farq", () => {
    expect(passwordChecks("", "Vaqt-1")).toEqual({ length: false, digit: false, letter: false, different: false });
    expect(passwordChecks("Vaqt-1", "Vaqt-1")).toEqual({ length: false, digit: true, letter: true, different: false });
    expect(passwordChecks("Yangi-parol-2", "Vaqt-1")).toEqual({ length: true, digit: true, letter: true, different: true });
    expect(passwordValid("faqatharflar", "x")).toBe(false);
    expect(passwordValid("Parol2026", "x")).toBe(true);
    expect(passwordChecks("Пароль2026", "x").letter).toBe(true);
  });

  it("kuch 0–4", () => {
    expect(passwordScore("")).toBe(0);
    expect(passwordScore("abc")).toBe(1);
    expect(passwordScore("abcdefgh1")).toBe(3);
    expect(passwordScore("Abcdefgh1")).toBe(4);
    expect(passwordScore("abcdefgh1234")).toBe(4);
  });
});
