import { describe, expect, it } from "vitest";
import { emptyFinLine, finLinesFrom, parseSignedMoney } from "./finance-api";

describe("BQ pul qatorlari", () => {
  it("summa: musbat, manfiy (avans), notoʻgʻri", () => {
    expect(parseSignedMoney("1.250.000,50")).toBe("1250000.50");
    expect(parseSignedMoney("−200")).toBe("-200");
    expect(parseSignedMoney("")).toBeUndefined();
    expect(parseSignedMoney("abc")).toBeNull();
  });

  it("boʻsh qatorlar tashlanadi, xatolar raqami bilan", () => {
    expect(finLinesFrom("MONEY", [emptyFinLine()])).toEqual({ ok: false, error: { key: "needLine" } });
    expect(finLinesFrom("MONEY", [emptyFinLine(), { ...emptyFinLine(), ref: "7", amount: "x" }])).toEqual({
      ok: false,
      error: { key: "badAmount", n: 2 },
    });
    expect(finLinesFrom("MONEY", [{ ...emptyFinLine(), ref: "7", amount: "5 000" }])).toEqual({
      ok: true,
      lines: [{ accountId: 7, amount: "5000" }],
    });
    expect(
      finLinesFrom("CUSTOMER_DEBT", [
        { ref: "3", refLabel: "A", amount: "-10,5", dueDate: "2026-12-01", docRef: " SV-1 " },
        emptyFinLine(),
      ]),
    ).toEqual({ ok: true, lines: [{ counterpartyId: 3, amount: "-10.5", dueDate: "2026-12-01", docRef: "SV-1" }] });
  });
});
