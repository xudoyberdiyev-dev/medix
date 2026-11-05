import { describe, expect, it } from "vitest";
import { keeperTabs } from "./monitor-page";

describe("Ombor mudiri paneli yorliqlari", () => {
  it("ruxsatga qarab: kirim qabuli va qaytgan tovar faqat ruxsat bilan", () => {
    expect(keeperTabs({ waitingTime: 2, receipts: false, returns: false }).map((t) => t.key)).toEqual(["monitor", "time", "issues"]);
    const all = keeperTabs({ waitingTime: 0, receipts: true, returns: true, receiptCount: 3 });
    expect(all.map((t) => t.key)).toEqual(["monitor", "time", "issues", "receipts", "returns"]);
    expect(all.find((t) => t.key === "receipts")?.count).toBe(3);
    expect(all.find((t) => t.key === "time")?.count).toBe(0);
  });
});
