import { describe, expect, it } from "vitest";
import { fefoPrefKey, parseFefoPref, withFefo } from "./fefo-invoice-pref";
import { COL_TITLES, FORM_TYPES, changedCells, isWarehouseForm, moveRow, rowTotal, seriesLabel } from "./invoice-forms";

const row = (over: Partial<Parameters<typeof changedCells>[0][number]> = {}) => ({
  area: "B-2",
  farmId: undefined,
  name: "Dori",
  manufacturer: undefined,
  series: "LOT",
  qty: 2,
  expiry: "31.05.2029",
  unit: "dona",
  price: "1250.50",
  total: "2501.00",
  ...over,
});

describe("O18 fakturalar", () => {
  it("ustunlar shablondagidek (5 tur)", () => {
    expect(FORM_TYPES.map((f) => f.title)).toEqual([
      "Фактура для склада",
      "Фактура для склада №2",
      "Фактура для Клиентов отправка",
      "Фактура Для клиента №1",
      "Фактура Для Клиента №2",
    ]);
    expect(FORM_TYPES[4].cols.map((c) => COL_TITLES[c])).toEqual([
      "Махсулот номи",
      "Ишлаб чикарувчиси",
      "Сони",
      "Яроклик муддати",
      "Ул/Бирлиги",
      "ККС билан Нархи",
      "ККС билан Жами киймати (Сумма)",
    ]);
    expect(FORM_TYPES[1].priced).toBe(false);
  });

  it("summa: soni × narx tiyin aniqligida", () => {
    expect(rowTotal(3, "0.10")).toBe("0.30");
    expect(rowTotal(12, "105840")).toBe("1270080.00");
    expect(rowTotal(0, "99.99")).toBe("0.00");
    expect(rowTotal(2, undefined)).toBe("0.00");
  });

  it("tuzatilgan kataklar soni", () => {
    expect(changedCells([row()], [row()])).toBe(0);
    expect(changedCells([row({ name: "Boshqa", qty: 3 })], [row()])).toBe(2);
    expect(changedCells([row(), row({ area: undefined, series: undefined, expiry: undefined, unit: undefined })], [row()])).toBe(3);
    expect(changedCells([], [row()])).toBe(1);
  });
});

describe("moveRow (sudrab tartiblash)", () => {
  it("qatorni pastga va yuqoriga koʻchiradi", () => {
    expect(moveRow(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveRow(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("chegaradan tashqari yoki bir joy — oʻzgarmaydi", () => {
    const rows = ["a", "b"];
    expect(moveRow(rows, 1, 1)).toBe(rows);
    expect(moveRow(rows, 0, 5)).toBe(rows);
  });
});

describe("O25 FEFO faktura", () => {
  const labels = { reserved: "zahira", proposed: "taklif", shortage: (n: number) => `Yetishmaydi: ${n}` };
  it("seriya belgisi: zahira, taklif, yetishmaydi, oddiy", () => {
    expect(seriesLabel(row({ batchHint: "RESERVED" }), labels)).toBe("LOT (zahira)");
    expect(seriesLabel(row({ batchHint: "PROPOSED" }), labels)).toBe("LOT (taklif)");
    expect(seriesLabel(row({ series: undefined, shortage: 5 }), labels)).toBe("Yetishmaydi: 5");
    expect(seriesLabel(row(), labels)).toBe("LOT");
    expect(seriesLabel(row({ series: undefined }), labels)).toBe("");
  });
  it("soʻrov faqat ombor fakturalarida", () => {
    expect(FORM_TYPES.filter((f) => isWarehouseForm(f.type)).map((f) => f.type)).toEqual(["WAREHOUSE", "WAREHOUSE2"]);
  });
  it("yuklab olish manzili va eslab qolingan tanlov", () => {
    expect(withFefo("/api/orders/1/invoice-forms/WAREHOUSE/pdf", true)).toBe("/api/orders/1/invoice-forms/WAREHOUSE/pdf?fefo=true");
    expect(withFefo("/api/orders/invoice-forms/WAREHOUSE/xlsx?ids=1,2", true)).toBe(
      "/api/orders/invoice-forms/WAREHOUSE/xlsx?ids=1,2&fefo=true",
    );
    expect(withFefo("/x", false)).toBe("/x");
    expect(parseFefoPref("yes")).toBe("yes");
    expect(parseFefoPref("no")).toBe("no");
    expect(parseFefoPref(null)).toBe("ask");
    expect(parseFefoPref("boshqa")).toBe("ask");
    expect(fefoPrefKey(7)).toBe("yuzplus.fefoInvoice.7");
  });
});
