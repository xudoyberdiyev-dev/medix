import { describe, expect, it } from "vitest";
import { balanceAfter, checkOp, needsApproval, opAccountKinds, parseDir, parseIoType, parseKind, type OpInput } from "./op-doc-model";

const base: OpInput = {
  kind: "ko",
  dir: "OUT",
  account: "1",
  from: null,
  to: null,
  item: "5",
  amount: "100000.00",
  date: "04.10.2026",
  dateIso: "2026-10-04",
  today: "2026-10-04",
  sourceBalance: "500000.00",
};

describe("op-doc-model", () => {
  it("URL parametrlarini xavfsiz oʻqiydi", () => {
    expect(parseKind("bo")).toBe("bo");
    expect(parseKind("x")).toBe("ko");
    expect(parseDir("IN")).toBe("IN");
    expect(parseDir(null)).toBe("OUT");
    expect(parseIoType("t2b")).toBe("t2b");
    expect(parseIoType("zz")).toBe("k2b");
    expect(opAccountKinds("bo")).toEqual(["BANK", "TERMINAL"]);
  });

  it("faqat kassadan limitdan katta chiqim tasdiqqa ketadi", () => {
    expect(needsApproval("ko", "OUT", "2000000.00")).toBe(false);
    expect(needsApproval("ko", "OUT", "2000000.01")).toBe(true);
    expect(needsApproval("ko", "IN", "9000000.00")).toBe(false);
    expect(needsApproval("bo", "OUT", "9000000.00")).toBe(false);
    expect(needsApproval("ko", "OUT", "")).toBe(false);
  });

  it("amaldan keyingi qoldiq tiyin aniqligida", () => {
    expect(balanceAfter("6694000.00", "1250000.55", -1)).toBe("5443999.45");
    expect(balanceAfter("0.10", "0.20", 1)).toBe("0.30");
    expect(balanceAfter("100.00", "", -1)).toBe("100.00");
  });

  it("KO/BO: hisob, modda, summa va sana majburiy; kelajak sana — xato", () => {
    expect(checkOp(base).errors).toEqual([]);
    const e = checkOp({ ...base, account: null, item: null, amount: "", date: "", dateIso: null }).errors.map((x) => x.key);
    expect(e).toEqual(["acct", "date", "sum", "item"]);
    expect(checkOp({ ...base, dateIso: "2026-10-05" }).errors.map((x) => x.key)).toEqual(["future"]);
    expect(checkOp({ ...base, amount: "0.00" }).errors.map((x) => x.key)).toEqual(["sumPos"]);
  });

  it("IO: ikki hisob, bir xil boʻlmasin; modda va sana soʻralmaydi", () => {
    const io: OpInput = { ...base, kind: "io", account: null, item: null, from: "1", to: "1", date: "", dateIso: null };
    expect(checkOp(io).errors.map((x) => x.key)).toEqual(["same"]);
    expect(checkOp({ ...io, from: null, to: null }).errors.map((x) => x.field)).toEqual(["from", "to"]);
  });

  it("chiqimda qoldiq yetmasa — ogohlantirish, kirimda emas", () => {
    expect(checkOp({ ...base, amount: "500000.01" }).short).toBe(true);
    expect(checkOp({ ...base, amount: "500000.00" }).short).toBe(false);
    expect(checkOp({ ...base, dir: "IN", amount: "900000.00" }).short).toBe(false);
  });
});
