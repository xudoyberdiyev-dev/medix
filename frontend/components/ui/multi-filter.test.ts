import { describe, expect, it } from "vitest";
import { chipSummary, datePresets, tashkentDay } from "./multi-filter";

describe("filtr chiplari (prototip FilterBar)", () => {
  it("chip yozuvi — 2 tagacha nom, keyin «… +N»", () => {
    expect(chipSummary(["A"])).toBe("A");
    expect(chipSummary(["A", "B"])).toBe("A, B");
    expect(chipSummary(["A", "B", "C", "D"])).toBe("A, B … +2");
  });

  it("tayyor davrlar Toshkent vaqtida", () => {
    // 2026-11-07 21:30 UTC = 08.11.2026 02:30 Toshkent (yakshanba)
    const now = Date.parse("2026-11-07T21:30:00Z");
    expect(tashkentDay(now)).toBe("2026-11-08");
    const p = datePresets(now);
    expect(p.today).toEqual(["2026-11-08", "2026-11-08"]);
    expect(p.yesterday).toEqual(["2026-11-07", "2026-11-07"]);
    expect(p.week).toEqual(["2026-11-02", "2026-11-08"]);
    expect(p.month).toEqual(["2026-11-01", "2026-11-08"]);
  });
});
