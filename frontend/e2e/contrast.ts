import type { Page } from "@playwright/test";

/**
 * O24 — sahifadagi koʻrinadigan matnlar kontrastini (WCAG AA) brauzerda oʻlchaydi.
 * Har matn tuguni uchun: hisoblangan `color` va ota elementlardagi birinchi shaffof boʻlmagan fon
 * (yarim shaffof fonlar ustma-ust aralashtiriladi). Oddiy matn ≥ 4.5, katta (≥ 24px yoki ≥ 18.66px qalin) ≥ 3.
 * Oʻtkazib yuboriladi: oʻchirilgan elementlar, `aria-hidden`, fon rasmi/gradient ustidagi matn, nolga yaqin shaffoflik.
 * Qaytaradi: muammolar roʻyxati va ekranning katta qismini egallagan oq (yorugʻ) fonlar (qorongʻi rejimda boʻlmasligi kerak).
 */
export async function auditContrast(page: Page): Promise<{ low: string[]; bright: string[] }> {
  return page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const parse = (c: string): RGBA => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) {
        const srgb = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
        if (srgb) return [+srgb[1] * 255, +srgb[2] * 255, +srgb[3] * 255, srgb[4] === undefined ? 1 : +srgb[4]];
        return [0, 0, 0, 0];
      }
      const p = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
    };
    const over = (top: RGBA, under: RGBA): RGBA => {
      const a = top[3];
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
    const lum = ([r, g, b]: RGBA) =>
      [r, g, b]
        .map((v) => v / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a: RGBA, b: RGBA) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };

    // Elementning ostidagi fon (null — rasm/gradient, aniqlab boʻlmaydi).
    const backdrop = (el: Element): RGBA | null => {
      const layers: RGBA[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== "none") return null;
        const bg = parse(cs.backgroundColor);
        if (bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      let base: RGBA = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
      return base;
    };

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.95) return false;
        if (e.getAttribute("aria-hidden") === "true" || e.hasAttribute("inert")) return false;
        if (e.matches(":disabled, [aria-disabled='true'], .sr-only")) return false;
      }
      return true;
    };

    const low: string[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!text || !el || seen.has(el)) continue;
      seen.add(el);
      if (!visible(el)) continue;
      const bg = backdrop(el);
      if (!bg) continue;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      if (fg[3] === 0) continue;
      const size = parseFloat(cs.fontSize);
      const bold = +cs.fontWeight >= 700;
      const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const r = ratio(over(fg, bg), bg);
      if (r < min - 0.01) {
        const tag = `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 4).join(".") : ""}`;
        low.push(`«${text.slice(0, 40)}» ${r.toFixed(2)} < ${min} (${tag})`);
      }
    }

    // Ekranning ≥ 4% ini egallagan juda yorugʻ fon — qorongʻi rejimda «oq dogʻ».
    const bright: string[] = [];
    const area = innerWidth * innerHeight;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const bg = parse(getComputedStyle(el).backgroundColor);
      if (bg[3] < 0.9 || lum(bg) < 0.6) continue;
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (w * h >= area * 0.04 && visible(el))
        bright.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 4).join(".")}`);
    }
    return { low: Array.from(new Set(low)).slice(0, 30), bright: bright.slice(0, 10) };
  });
}
