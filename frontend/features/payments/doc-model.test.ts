import { describe, expect, it } from "vitest";
import { autoAlloc, checkDoc, docSteps, gridRows, isAuto, postEffects, totals, type DocInput, type DocRow } from "./doc-model";

const doc = (id: number, open: string, overdueDays = 0): DocRow => ({
  docType: "SV",
  docId: id,
  docNumber: `SV-TSH-${id}`,
  date: "2026-10-01",
  dueDate: "2026-10-15",
  open,
  overdueDays,
  total: open,
  returned: "0.00",
  paid: "0.00",
});

const base = (o: Partial<DocInput> = {}): DocInput => ({
  kind: "mt",
  party: "7",
  date: "09.11.2026",
  amount: "7000.00",
  method: "CASH",
  account: { id: 1, kind: "CASH", balance: "100.00" },
  payOrderNo: "",
  checkNo: "",
  today: "2026-11-09",
  docs: [doc(1, "5000.00", 12), doc(2, "4000.00")],
  alloc: {},
  cashOnly: false,
  ...o,
});

describe("toʻlov hujjati modeli", () => {
  it("avtomatik taqsimot eng eskisidan, qolgani avans", () => {
    const docs = [doc(1, "5000.00"), doc(2, "4000.00")];
    expect(autoAlloc(docs, "7000")).toEqual({ "SV:1": "5000.00", "SV:2": "2000.00" });
    expect(autoAlloc(docs, "12000.50")).toEqual({ "SV:1": "5000.00", "SV:2": "4000.00" });
    expect(totals("12000.50", autoAlloc(docs, "12000.50"))).toEqual({ sum: "12000.50", allocated: "9000.00", advance: "3000.50" });
    expect(isAuto(docs, "7000", { "SV:1": "5000", "SV:2": "2000.00", "SV:3": "0" })).toBe(true);
    expect(isAuto(docs, "7000", { "SV:2": "7000" })).toBe(false);
  });

  it("qator: toʻliq yopiladi / qisman / qoldiqdan koʻp", () => {
    const [a, b] = gridRows([doc(1, "5000.00"), doc(2, "4000.00")], { "SV:1": "5000.00", "SV:2": "4500" });
    expect(a).toMatchObject({ closes: true, partial: false, over: false, after: "0.00" });
    expect(b).toMatchObject({ closes: true, over: true, after: "0.00" });
    const [c] = gridRows([doc(1, "5000.00")], { "SV:1": "1000.10" });
    expect(c).toMatchObject({ partial: true, after: "3999.90", value: "1000.10" });
  });

  it("tekshiruv: majburiy maydonlar, kelajak sana, bank/terminal rekvizitlari, kassir", () => {
    const e = checkDoc(base({ party: null, date: "10.11.2026", amount: "", account: null, method: "BANK", cashOnly: true })).errors;
    expect(e.map((x) => x.key)).toEqual(["eParty", "eFuture", "eSum", "eBank", "ePayNo", "eCashier"]);
    expect(checkDoc(base({ amount: "0" })).errors.map((x) => x.key)).toEqual(["eSumPos"]);
    expect(checkDoc(base({ method: "TERMINAL", account: { id: 2, kind: "TERMINAL" } })).errors.map((x) => x.key)).toEqual(["eCheck"]);
    expect(checkDoc(base({ date: "31.02.2026" })).errors[0].key).toBe("eDate");
  });

  it("tekshiruv: taqsimot summadan oshmaydi, YT naqd — kassa yetishmasligi, avans ogohlantirishi", () => {
    const over = checkDoc(base({ amount: "1000", alloc: { "SV:1": "2000" } }));
    expect(over.errors.map((x) => x.key)).toEqual(["eOverAlloc"]);
    const row = checkDoc(base({ amount: "9000", alloc: { "SV:2": "4500" } }));
    expect(row.errors[0]).toMatchObject({ key: "eRow", params: { n: "SV-TSH-2", s: "4000.00" } });
    const yt = checkDoc(base({ kind: "yt", amount: "150" }));
    expect(yt.errors[0]).toMatchObject({ key: "eCashShort", params: { a: "100.00", b: "150.00", c: "50.00" } });
    const adv = checkDoc(base({ amount: "7000", alloc: { "SV:1": "5000" } }));
    expect(adv.warnings[0]).toMatchObject({ key: "wAdvMt", params: { s: "2000.00" } });
    expect(adv.errors).toEqual([]);
  });

  it("tasdiqlash oqibatlari va bosqichlar", () => {
    const fx = postEffects("9000.00", [doc(1, "5000.00", 12), doc(2, "4000.00")], { "SV:1": "5000", "SV:2": "2000" });
    expect(fx).toEqual({ before: "9000.00", after: "2000.00", full: 1, part: 1, overdueClosed: "5000.00" });
    expect(postEffects("9000.00", [doc(1, "5000.00", 12)], { "SV:1": "100" }).overdueClosed).toBeNull();
    expect(docSteps("mt", "DRAFT").map((s) => s.state)).toEqual(["cur", "next"]);
    expect(docSteps("yt", "PENDING").map((s) => s.state)).toEqual(["done", "cur", "next"]);
    expect(docSteps("yt", "CANCELLED").map((s) => s.status)).toEqual(["DRAFT", "PENDING", "POSTED", "CANCELLED"]);
  });
});
