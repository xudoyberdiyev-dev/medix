import { describe, expect, it } from "vitest";
import { inkLength, isSignatureEnough, toCanvasPoint } from "./signature";

describe("imzo", () => {
  it("chiziq uzunligi barcha chiziqlar bo'yicha yig'iladi", () => {
    const strokes = [
      [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
      [
        { x: 10, y: 10 },
        { x: 10, y: 20 },
        { x: 20, y: 20 },
      ],
    ];
    expect(inkLength(strokes)).toBe(25);
    expect(inkLength([])).toBe(0);
  });

  it("bitta nuqta yoki qisqa chiziq imzo hisoblanmaydi", () => {
    expect(isSignatureEnough([[{ x: 5, y: 5 }]])).toBe(false);
    expect(
      isSignatureEnough([
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      ]),
    ).toBe(false);
    expect(
      isSignatureEnough([
        [
          { x: 0, y: 0 },
          { x: 60, y: 0 },
        ],
      ]),
    ).toBe(true);
  });

  it("ekran nuqtasi kanvas piksellariga masshtablanadi", () => {
    const rect = { left: 100, top: 50, width: 300, height: 100 };
    expect(toCanvasPoint(250, 100, rect, { width: 600, height: 200 })).toEqual({ x: 300, y: 100 });
    expect(toCanvasPoint(100, 50, { ...rect, width: 0, height: 0 }, { width: 600, height: 200 })).toEqual({ x: 0, y: 0 });
  });
});
