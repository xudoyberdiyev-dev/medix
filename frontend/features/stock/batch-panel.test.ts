import { describe, expect, it } from "vitest";
import { batchState, daysLeft, lifeUsed, moveHref } from "./batch-panel";

const at = (iso: string) => Date.parse(`${iso}T00:00:00+05:00`);

describe("Partiya kartasi", () => {
  it("holat: muddati oʻtgan ustun, keyin zona turi", () => {
    expect(batchState({ expired: true, zoneType: "MAIN" })).toBe("expired");
    expect(batchState({ expired: false, zoneType: "QUARANTINE" })).toBe("quar");
    expect(batchState({ expired: false, zoneType: "RECEIVING" })).toBe("recv");
    expect(batchState({ expired: false, zoneType: "SHIPPING" })).toBe("ship");
    expect(batchState({ expired: false, zoneType: "COLD" })).toBe("open");
  });
  it("yaroqlilik: oʻtgan ulush va qolgan kun", () => {
    expect(lifeUsed("2026-01-01", "2027-01-01", at("2026-07-02"))).toBe(50);
    expect(lifeUsed(null, "2027-01-01", at("2026-07-02"))).toBe(0);
    expect(lifeUsed("2026-01-01", "2026-06-01", at("2026-07-02"))).toBe(100);
    expect(daysLeft("2026-11-18", at("2026-11-08"))).toBe(10);
    expect(daysLeft("2026-11-01", at("2026-11-08"))).toBe(-7);
  });
  it("harakat hujjatiga havola", () => {
    expect(moveHref("KR", 5)).toBe("/receipts/5");
    expect(moveHref("BY", 9)).toBe("/orders/9");
    expect(moveHref("ZK", 2)).toBe("/zone-transfers?open=2");
    expect(moveHref("BQ", 1)).toBeNull();
  });
});
