/** Imzo chizig'i: kanvas koordinatalaridagi nuqtalar ketma-ketligi. */
export type Stroke = ReadonlyArray<{ x: number; y: number }>;

/** Bir tasodifiy teginish imzo hisoblanmasin — umumiy chiziq uzunligi shu qiymatdan katta bo'lishi kerak (px). */
export const MIN_SIGNATURE_LENGTH = 40;

/** Barcha chiziqlarning umumiy uzunligi (px). */
export function inkLength(strokes: ReadonlyArray<Stroke>): number {
  let total = 0;
  for (const s of strokes) {
    for (let i = 1; i < s.length; i++) {
      total += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    }
  }
  return total;
}

export function isSignatureEnough(strokes: ReadonlyArray<Stroke>): boolean {
  return inkLength(strokes) >= MIN_SIGNATURE_LENGTH;
}

/** Ekran nuqtasini kanvas piksellariga o'tkazadi (CSS o'lchami ≠ kanvas o'lchami bo'lsa ham). */
export function toCanvasPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvas: { width: number; height: number },
): { x: number; y: number } {
  const sx = rect.width > 0 ? canvas.width / rect.width : 1;
  const sy = rect.height > 0 ? canvas.height / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}
