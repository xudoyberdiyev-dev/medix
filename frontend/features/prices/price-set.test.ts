import { describe, expect, it } from "vitest";
import { parseMoneyInput } from "@/features/counterparties/api";
import {
  applyMarkup,
  formatPct,
  fromCents,
  markupBase,
  matchesFilter,
  parsePercent,
  roundUp,
  rowState,
  toCents,
  toInput,
  withoutVat,
  EMPTY_SET_FILTER,
  type GridRowLike,
} from "./price-set";

const row: GridRowLike = {
  productId: 1,
  code: "10001",
  name: "Paracetamol 500 mg",
  manufacturer: "Nobel",
  category: "Analgetik",
  searchText: "paracetamol 500 mg nobel 4780001",
  vatRate: "12",
  currentPrice: "10000.00",
  basePrice: "10000.00",
  avgCost: "8000.00",
  lastCost: "8500.00",
  costLimit: "9000.00",
};

describe("pul arifmetikasi (tiyin, BigInt)", () => {
  it("toCents / fromCents", () => {
    expect(toCents("1250.5")).toBe(125050n);
    expect(toCents("7")).toBe(700n);
    expect(toCents("1,5")).toBeNull();
    expect(fromCents(125050n)).toBe("1250.50");
  });
  it("yuqoriga yaxlitlash", () => {
    expect(roundUp(1234501n, 100)).toBe(1240000n);
    expect(roundUp(1240000n, 100)).toBe(1240000n);
    expect(roundUp(1234501n, 1000)).toBe(1300000n);
    expect(roundUp(1234501n, 0)).toBe(1234501n);
  });
  it("foiz kiritish", () => {
    expect(parsePercent("+25")).toBe(2500n);
    expect(parsePercent("−5")).toBe(-500n);
    expect(parsePercent("12,5")).toBe(1250n);
    expect(parsePercent("-100")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
  });
  it("ustama: tiyingacha HALF_UP, keyin qadam", () => {
    expect(applyMarkup(800000n, 2500n, 0)).toBe(1000000n);
    expect(applyMarkup(333333n, 1000n, 0)).toBe(366666n); // 3666,663 → 3666,66
    expect(applyMarkup(333335n, 1000n, 0)).toBe(366669n); // 3666,685 → 3666,69
    expect(applyMarkup(333333n, 1000n, 100)).toBe(370000n);
  });
  it("QQSsiz", () => {
    expect(fromCents(withoutVat(1120000n, "12"))).toBe("10000.00");
  });
  it("foiz koʻrinishi", () => {
    expect(formatPct(12.34)).toBe("+12,3%");
    expect(formatPct(-5)).toBe("−5%");
    expect(formatPct(null)).toBe("—");
  });
});

describe("qator holati", () => {
  it("oʻzgarmagan / oʻzgargan / notoʻgʻri", () => {
    expect(rowState(row, undefined, parseMoneyInput).changed).toBe(false);
    expect(rowState(row, "10000", parseMoneyInput).changed).toBe(false);
    const s = rowState(row, "11.000", parseMoneyInput);
    expect(s).toMatchObject({ next: "11000.00", changed: true, chg: 10, below: false, big: false, markup: 37.5 });
    expect(rowState(row, "abc", parseMoneyInput).bad).toBe(true);
    expect(rowState(row, "0", parseMoneyInput).bad).toBe(true);
  });
  it("tannarxdan past va 20% dan koʻp", () => {
    expect(rowState(row, "8500", parseMoneyInput)).toMatchObject({ below: true, big: false });
    expect(rowState(row, "13000", parseMoneyInput)).toMatchObject({ below: false, big: true });
    expect(rowState({ ...row, costLimit: null }, "100", parseMoneyInput).below).toBe(false);
  });
  it("narxi yoʻq mahsulot — har qanday toʻgʻri narx oʻzgarish", () => {
    expect(rowState({ ...row, currentPrice: null }, "500", parseMoneyInput)).toMatchObject({ changed: true, chg: null });
  });
});

describe("filtr va asos", () => {
  it("qidiruv kirillda ham, chiplar", () => {
    expect(matchesFilter(row, { ...EMPTY_SET_FILTER, q: "парацетамол" })).toBe(true);
    expect(matchesFilter(row, { ...EMPTY_SET_FILTER, q: "4780001" })).toBe(true);
    expect(matchesFilter(row, { ...EMPTY_SET_FILTER, q: "ibuprofen" })).toBe(false);
    expect(matchesFilter(row, { ...EMPTY_SET_FILTER, makers: ["Nobel"] })).toBe(true);
    expect(matchesFilter(row, { ...EMPTY_SET_FILTER, countries: ["Hindiston"] })).toBe(false);
    expect(matchesFilter(row, { ...EMPTY_SET_FILTER, supply: ["—"] })).toBe(true);
  });
  it("ustama asosi", () => {
    expect(markupBase(row, "avg")).toBe(800000n);
    expect(markupBase(row, "last")).toBe(850000n);
    expect(markupBase({ ...row, basePrice: null }, "base")).toBeNull();
  });
  it("kiritish koʻrinishi", () => {
    expect(toInput("1250.00")).toBe("1250");
    expect(toInput("1250.50")).toBe("1250,50");
  });
});

describe("isBelowCost (NO hujjati)", () => {
  it("tannarxdan past — tiyin aniqligida", async () => {
    const { isBelowCost } = await import("./price-change-document");
    expect(isBelowCost({ newPrice: "11999.99", cost: "12000.00" })).toBe(true);
    expect(isBelowCost({ newPrice: "12000.00", cost: "12000" })).toBe(false);
    expect(isBelowCost({ newPrice: "100.00", cost: null })).toBe(false);
  });
});
