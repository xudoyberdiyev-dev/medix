import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// O24: qorongʻi mavzu tokenlari WCAG AA kontrastiga mos boʻlishi va komponentlarda
// mavjud boʻlmagan rang tokeni (masalan, `text-text-muted`) ishlatilmasligi.

const root = join(__dirname, "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

function tokens(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/gi)) out[m[1]] = m[2].trim().toLowerCase();
  return out;
}

const light = tokens(block("@theme"));
const dark = { ...light, ...tokens(block(".theme-dark {")) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [matn, fon, minimal kontrast]. Matn — 4.5 (AA), ikonka/chegara — 3.
const pairs: [string, string, number][] = [
  ["text-primary", "surface", 4.5],
  ["text-primary", "background", 4.5],
  ["text-primary", "primary-soft", 4.5],
  ["text-secondary", "surface", 4.5],
  ["text-secondary", "background", 4.5],
  ["text-secondary", "table-header", 4.5],
  ["link", "surface", 4.5],
  ["link", "background", 4.5],
  ["primary", "surface", 3],
  ["white", "primary-button", 4.5],
  ["white", "primary-button-hover", 4.5],
  ["on-solid", "danger", 4.5],
  ["on-solid", "text-primary", 4.5],
  ["success", "success-bg", 4.5],
  ["warning", "warning-bg", 4.5],
  ["danger", "danger-bg", 4.5],
  ["info", "info-bg", 4.5],
  ["danger", "surface", 4.5],
  ["sidebar-text", "brand-900", 4.5],
  ["sidebar-active", "brand-900", 4.5],
];

describe("qorongʻi mavzu kontrasti (WCAG AA)", () => {
  it.each(pairs)("%s / %s", (fg, bg, min) => {
    expect(dark[fg], fg).toBeDefined();
    expect(dark[bg], bg).toBeDefined();
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(min);
  });

  it("oʻchiq matn qorongʻi fonda ham oʻqiladi", () => {
    expect(contrast(dark["text-disabled"], dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("toʻq fon ustidagi matn ikkala mavzuda ham oʻqiladi", () => {
    for (const bg of ["primary", "success", "warning", "danger"]) {
      expect(contrast(dark["on-solid"], dark[bg]), bg).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(light["on-solid"], light.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light["on-solid"], light["text-primary"])).toBeGreaterThanOrEqual(4.5);
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });
}

describe("komponentlar faqat mavjud rang tokenlarini ishlatadi", () => {
  const known = new Set(Object.keys(light));
  // Tokenga oʻxshash, lekin yoʻq nomlar (avval topilgan xatolar) — rangsiz qoladi va qorongʻida buziladi.
  const suspicious =
    /(?<![\w-])(?:bg|text|border|ring|outline|fill|stroke)-((?:text|border|primary|surface|sidebar|brand)-[a-z0-9-]+)(?:\/\d+)?(?![\w-])/g;

  it("nomaʼlum token yoʻq", () => {
    const bad: string[] = [];
    for (const f of ["app", "components", "features"].flatMap((d) => files(join(root, d)))) {
      for (const m of readFileSync(f, "utf8").matchAll(suspicious)) {
        if (!known.has(m[1])) bad.push(`${f.slice(root.length + 1)}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("toʻq rangli fon ustida `text-white` emas, `text-on-solid`", () => {
    const bad: string[] = [];
    const solid =
      /bg-(?:primary|success|warning|danger|text-primary)(?![\w-])[^"`]*text-white|text-white[^"`]*bg-(?:primary|success|warning|danger|text-primary)(?![\w-])/;
    for (const f of ["app", "components", "features"].flatMap((d) => files(join(root, d)))) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (solid.test(line)) bad.push(`${f.slice(root.length + 1)}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
