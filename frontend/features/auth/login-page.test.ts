import { describe, expect, it } from "vitest";
import { greetingKey, longDate } from "./login-greeting";
import { helpLine } from "./login-layout";
import { SHOWCASE_MODULES, dataMatrixCells, nextModule } from "./login-showcase";

// 18.11.2026 (chorshanba): UTC vaqti → Toshkent +5
const at = (utcHour: number) => new Date(Date.UTC(2026, 10, 18, utcHour, 30));

describe("kirish sahifasi (O20)", () => {
  it("vaqtga qarab salom — Toshkent vaqtida", () => {
    expect(greetingKey(at(1))).toBe("greetingMorning"); // 06:30
    expect(greetingKey(at(9))).toBe("greetingDay"); // 14:30
    expect(greetingKey(at(14))).toBe("greetingEvening"); // 19:30
    expect(greetingKey(at(21))).toBe("greetingEvening"); // 02:30
  });

  it("sana tanlangan tilda", () => {
    expect(longDate(at(9), "uz-Latn")).toBe("Chorshanba, 18-noyabr");
    expect(longDate(at(9), "uz-Cyrl")).toBe("Чоршанба, 18-ноябр");
    expect(longDate(at(9), "ru")).toBe("Среда, 18 ноября");
    // UTC 20:00 — Toshkentda ertasi kun
    expect(longDate(new Date(Date.UTC(2026, 10, 18, 20, 0)), "uz-Latn")).toBe("Payshanba, 19-noyabr");
  });

  it("yordam qatori — faqat toʻldirilgan qismlar", () => {
    expect(helpLine({ supportPhone: "+998 71 200-00-00", supportHours: "du–ju 09:00–18:00" })).toBe(
      "+998 71 200-00-00 · du–ju 09:00–18:00",
    );
    expect(helpLine({ supportPhone: " ", supportHours: "du–ju" })).toBe("du–ju");
    expect(helpLine({ supportPhone: "+998", supportHours: null })).toBe("+998");
    expect(helpLine(undefined)).toBeNull();
  });

  it("sahnalar aylanma almashadi (O22 — 5 ta)", () => {
    expect(SHOWCASE_MODULES).toEqual(["orders", "stock", "marking", "delivery", "money"]);
    expect(nextModule("orders")).toBe("stock");
    expect(nextModule("money")).toBe("orders");
  });

  it("DataMatrix namunasi deterministik, chegaralari toʻgʻri", () => {
    const a = dataMatrixCells();
    expect(a).toHaveLength(196);
    expect(dataMatrixCells()).toEqual(a);
    for (let r = 0; r < 14; r++) expect(a[r * 14]).toBe(true); // chap chegara
    for (let c = 0; c < 14; c++) expect(a[13 * 14 + c]).toBe(true); // pastki chegara
  });
});
