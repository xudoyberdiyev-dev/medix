import { describe, expect, it } from "vitest";
import { IDLE_DAYS, isIdle } from "./bonus-page";

describe("bonus balans", () => {
  it("30 kundan koʻp ishlatilmagan balans — eslatma", () => {
    expect(isIdle({ idleDays: IDLE_DAYS })).toBe(true);
    expect(isIdle({ idleDays: IDLE_DAYS - 1 })).toBe(false);
    expect(isIdle({ idleDays: undefined })).toBe(false);
  });
});
