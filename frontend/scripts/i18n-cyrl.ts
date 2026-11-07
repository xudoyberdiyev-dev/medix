/**
 * uz-Cyrl lugʻatini uz-Latn dan yasaydi: `pnpm i18n:cyrl`.
 * Qoʻlda tuzatish kerak boʻlsa — `messages/uz-Cyrl.overrides.json` ga yozing (shu kalitlar ustun).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildCyrillic } from "../i18n/cyrl.ts";

const dir = new URL("../messages/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
const overrides = existsSync(new URL("uz-Cyrl.overrides.json", dir)) ? read("uz-Cyrl.overrides.json") : {};
writeFileSync(new URL("uz-Cyrl.json", dir), `${JSON.stringify(buildCyrillic(read("uz-Latn.json"), overrides), null, 2)}\n`);
console.log("messages/uz-Cyrl.json yangilandi");
