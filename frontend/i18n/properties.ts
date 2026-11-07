import { toCyrillic } from "./translit.ts";

const HEADER = "# AVTOMATIK YASALGAN — qoʻlda oʻzgartirmang. Manba: messages.properties (uz-Latn), `cd frontend && pnpm i18n:cyrl`.\n";

/** `.properties` qiymatlarini kirillga oʻgiradi; kalitlar, boʻsh qatorlar saqlanadi, izohlar tashlanadi. */
export function propertiesToCyrillic(source: string): string {
  const lines = source.split("\n").flatMap((line) => {
    if (line.trimStart().startsWith("#")) return [];
    const eq = line.indexOf("=");
    if (eq < 0) return [line];
    return [line.slice(0, eq + 1) + toCyrillic(line.slice(eq + 1))];
  });
  return HEADER + lines.join("\n").replace(/^\n+/, "");
}
