import { describe, expect, it } from "vitest";
import { validatePasswordForm } from "@/app/password/password-form";
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

describe("validatePasswordForm", () => {
  it("qisqa, bir xil va mos kelmagan parollar", () => {
    expect(validatePasswordForm({ currentPassword: "", newPassword: "123", repeat: "1" })).toEqual({
      currentPassword: "currentRequired",
      newPassword: "tooShort",
      repeat: "mismatch",
    });
    expect(validatePasswordForm({ currentPassword: "Eski-parol-1", newPassword: "Eski-parol-1", repeat: "Eski-parol-1" }).newPassword).toBe(
      "sameAsCurrent",
    );
    expect(validatePasswordForm({ currentPassword: "Eski-parol-1", newPassword: "Yangi-parol-2", repeat: "Yangi-parol-2" })).toEqual({});
  });
});
