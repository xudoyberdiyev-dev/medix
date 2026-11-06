import { describe, expect, it } from "vitest";
import { matchesDebt } from "./debts-page";

describe("qarz qidiruvi", () => {
  it("nom yoki STIR boʻyicha, katta-kichik harf farqsiz", () => {
    const row = { name: "Shifo Dorixona", tin: "305123456" };
    expect(matchesDebt(row, "")).toBe(true);
    expect(matchesDebt(row, "shifo")).toBe(true);
    expect(matchesDebt(row, "3051")).toBe(true);
    expect(matchesDebt(row, "Nur")).toBe(false);
  });
});
