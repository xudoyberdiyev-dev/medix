import { describe, expect, it } from "vitest";
import { scanFeedbackEnabled, setScanFeedback, vibrationPattern } from "./scan-feedback";

describe("skanerlash ovozi va tebranishi (U14)", () => {
  it("standart — yoqilgan; oʻchirilsa saqlanadi", () => {
    window.localStorage.clear();
    expect(scanFeedbackEnabled()).toBe(true);
    setScanFeedback(false);
    expect(scanFeedbackEnabled()).toBe(false);
    setScanFeedback(true);
    expect(scanFeedbackEnabled()).toBe(true);
  });
  it("tebranish: toʻgʻri — qisqa, xato — ikki marta", () => {
    expect(vibrationPattern(true)).toBe(40);
    expect(vibrationPattern(false)).toEqual([80, 60, 80]);
  });
});
