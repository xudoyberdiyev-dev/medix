import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, docHref, inView, kpisOf, matches, sumMoney, tashkentDayOf, type TransferItem } from "./model";

const item = (p: Partial<TransferItem>): TransferItem => ({
  kind: "OK",
  id: 1,
  number: "OK-TSH-000001",
  createdAt: "2026-11-09T20:30:00Z",
  from: { warehouse: "Asosiy ombor", zone: "Asosiy saqlash" },
  to: { warehouse: "Chilonzor ombori" },
  state: "DRAFT",
  direction: "INTERNAL",
  lines: 1,
  qty: 10,
  shortageQty: 0,
  createdBy: "Sardor Aliyev",
  ...p,
});

describe("transfers model", () => {
  it("koʻrinishlar prototip boʻyicha", () => {
    const zk = item({ kind: "ZK" });
    const fsIn = item({ kind: "FS", direction: "IN", state: "TRANSIT" });
    const fsOut = item({ kind: "FS", direction: "OUT" });
    expect(inView(zk, "in")).toBe(false);
    expect(inView(zk, "out")).toBe(true);
    expect(inView(fsIn, "in")).toBe(true);
    expect(inView(fsIn, "out")).toBe(false);
    expect(inView(fsOut, "in")).toBe(false);
    expect(inView(item({}), "in")).toBe(true);
    expect(inView(fsIn, "transit")).toBe(true);
    expect(inView(fsOut, "fs")).toBe(true);
  });

  it("qidiruv kirill/lotin va sana Toshkent boʻyicha", () => {
    const x = item({});
    expect(matches(x, { ...EMPTY_FILTERS, q: "чилонзор" })).toBe(true);
    expect(matches(x, { ...EMPTY_FILTERS, q: "sardor" })).toBe(true);
    expect(matches(x, { ...EMPTY_FILTERS, q: "samarqand" })).toBe(false);
    // 20:30 UTC = 10.11 01:30 Toshkent
    expect(tashkentDayOf(x.createdAt)).toBe("2026-11-10");
    expect(matches(x, { ...EMPTY_FILTERS, from: "2026-11-10" })).toBe(true);
    expect(matches(x, { ...EMPTY_FILTERS, from: "2026-11-09", to: "2026-11-09" })).toBe(false);
    expect(matches(x, { ...EMPTY_FILTERS, kinds: ["FS"] })).toBe(false);
    expect(matches(x, { ...EMPTY_FILTERS, states: ["DRAFT"] })).toBe(true);
  });

  it("KPI va summa float ishlatmaydi", () => {
    const k = kpisOf([
      item({ kind: "FS", state: "TRANSIT", direction: "IN", total: "0.10", qty: 3 }),
      item({ kind: "FS", state: "TRANSIT", direction: "OUT", total: "0.20", qty: 2 }),
      item({ state: "PENDING" }),
      item({ state: "DIFF" }),
    ]);
    expect(k).toMatchObject({ transit: 2, transitQty: 5, transitSum: "0.30", incoming: 1, drafts: 1, pending: 1, diffs: 1 });
    expect(kpisOf([item({ state: "TRANSIT" })]).transitSum).toBeNull();
    expect(sumMoney(["1250000.5", "-0.75", "3"])).toBe("1250002.75");
  });

  it("hujjat havolasi tur sahifasiga", () => {
    expect(docHref({ kind: "FS", id: 7 })).toBe("/branch-sales?open=7");
    expect(docHref({ kind: "ZK", id: 3 })).toBe("/zone-transfers?open=3");
    expect(docHref({ kind: "OK", id: 5 })).toBe("/warehouse-transfers/5");
  });
});
