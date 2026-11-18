import { describe, expect, it } from "vitest";
import { greetingKey, longDate } from "./login-greeting";
import { helpLine } from "./login-layout";
import { SHOWCASE_MODULES, nextModule } from "./login-showcase";

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
    const t = (k: string, v: Record<string, string>) => `${k}|${v.hours ?? ""}|${v.phone ?? ""}`;
    expect(helpLine(t, { supportPhone: "+998 71 200-00-00", supportHours: "du–ju 09:00–18:00" })).toBe(
      "helpBoth|du–ju 09:00–18:00|+998 71 200-00-00",
    );
    expect(helpLine(t, { supportPhone: " ", supportHours: "du–ju" })).toBe("help|du–ju|");
    expect(helpLine(t, { supportPhone: "+998", supportHours: null })).toBe("helpPhone||+998");
    expect(helpLine(t, undefined)).toBeNull();
  });

  it("modul kartasi aylanma almashadi (7 ta)", () => {
    expect(SHOWCASE_MODULES).toHaveLength(7);
    expect(nextModule("orders")).toBe("stock");
    expect(nextModule("messages")).toBe("orders");
  });
});
