import { describe, expect, it } from "vitest";
import { checkRefs } from "./bank-refs";

const v = (p: Partial<{ payOrderNo: string; bankDate: string; checkNo: string }>) => ({ payOrderNo: "", bankDate: "", checkNo: "", ...p });

describe("toʻlov rekvizitlari", () => {
  it("bank — topshiriqnoma № majburiy, bank sanasi ixtiyoriy, lekin toʻgʻri boʻlishi kerak", () => {
    expect(checkRefs("BANK", v({}))).toEqual({ ok: false, key: "payOrderNoRequired" });
    expect(checkRefs("BANK", v({ payOrderNo: " 0702 ", bankDate: "31.02.2026" }))).toEqual({ ok: false, key: "badBankDate" });
    expect(checkRefs("BANK", v({ payOrderNo: " 0702 ", bankDate: "04.10.2026", checkNo: "1" }))).toEqual({
      ok: true,
      body: { payOrderNo: "0702", bankDate: "2026-10-04" },
    });
  });

  it("terminal — chek raqami majburiy; kassa — hech narsa yuborilmaydi", () => {
    expect(checkRefs("TERMINAL", v({}))).toEqual({ ok: false, key: "checkNoRequired" });
    expect(checkRefs("TERMINAL", v({ checkNo: "004811", payOrderNo: "x" }))).toEqual({ ok: true, body: { checkNo: "004811" } });
    expect(checkRefs("CASH", v({ payOrderNo: "x" }))).toEqual({ ok: true, body: {} });
  });
});
