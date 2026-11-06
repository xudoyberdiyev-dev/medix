import { describe, expect, it } from "vitest";
import { accountFormErrors } from "./account-dialog";

describe("accountFormErrors", () => {
  it("nom majburiy", () => {
    expect(accountFormErrors("CASH", "  ", "")).toEqual({ name: "Hisob nomini kiriting." });
  });
  it("bank hisobi — 20 raqam", () => {
    expect(accountFormErrors("BANK", "Asosiy", "1234").accountNo).toBeDefined();
    expect(accountFormErrors("BANK", "Asosiy", "20208000900123456789")).toEqual({});
  });
  it("kassa va Terminalda hisob raqami soʻralmaydi", () => {
    expect(accountFormErrors("TERMINAL", "Terminal 2", "")).toEqual({});
  });
});
