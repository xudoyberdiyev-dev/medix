import { describe, expect, it } from "vitest";
import { groupAccountNo, isoToDay } from "./model";

describe("Bank modeli", () => {
  it("hisob raqami 4 tadan guruhlanadi", () => {
    expect(groupAccountNo("20208000900412873001")).toBe("2020 8000 9004 1287 3001");
    expect(groupAccountNo("2020 8000 12")).toBe("2020 8000 12");
  });
  it("sana", () => {
    expect(isoToDay("2026-10-03")).toBe("03.10.2026");
  });
});
