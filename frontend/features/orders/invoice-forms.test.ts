import { describe, expect, it } from "vitest";
import { COL_TITLES, FORM_TYPES, changedCells, rowTotal } from "./invoice-forms";

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
