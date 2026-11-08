import { describe, expect, it } from "vitest";
import { shortName, stageHint } from "./stage-hint";

const T0 = Date.parse("2026-11-08T05:00:00Z");
const at = (min: number) => new Date(T0 + min * 60000).toISOString();
const base = { pickMinutes: undefined, pickStartedAt: undefined, pickFinishedAt: undefined };

describe("buyurtma bosqich izohi (prototip)", () => {
  it("navbatda — vaqt kutilmoqda / berildi", () => {
    expect(stageHint({ ...base, status: "QUEUED" }, T0)).toEqual({ key: "wait", tone: "warning" });
    expect(stageHint({ ...base, status: "QUEUED", pickMinutes: 15 }, T0)).toEqual({ key: "given", tone: "info" });
  });

  it("yigʻilmoqda — qolgan yoki kechikkan daqiqa", () => {
    const o = { ...base, status: "PICKING" as const, pickMinutes: 20, pickStartedAt: at(0) };
    expect(stageHint(o, T0 + 5 * 60000)).toEqual({ key: "left", n: 15, tone: "secondary" });
    expect(stageHint(o, T0 + 27 * 60000)).toEqual({ key: "late", n: 7, tone: "danger" });
  });

  it("yigʻib boʻlingach — natija", () => {
    const o = { ...base, status: "MARKING" as const, pickMinutes: 20, pickStartedAt: at(0) };
    expect(stageHint({ ...o, pickFinishedAt: at(12) }, T0)).toEqual({ key: "resOk", s: 12, d: 8, tone: "success" });
    expect(stageHint({ ...o, pickFinishedAt: at(20) }, T0)).toEqual({ key: "resOnTime", s: 20, tone: "success" });
    expect(stageHint({ ...o, pickFinishedAt: at(26) }, T0)).toEqual({ key: "resLate", d: 6, tone: "danger" });
    expect(stageHint({ ...o, status: "DELIVERED", pickFinishedAt: at(12) }, T0)).toBeNull();
  });

  it("qisqa ism", () => {
    expect(shortName("Malika Yusupova")).toBe("Malika Y.");
    expect(shortName("Aziz")).toBe("Aziz");
  });
});
