// uz-Latn → uz-Cyrl (frontend bilan bir xil transliteratsiya). Tuzatishlar: messages/uz-Cyrl.overrides.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildCyrillic } from "../../frontend/i18n/cyrl.ts";

const root = new URL("../messages/", import.meta.url);
const latin = JSON.parse(readFileSync(new URL("uz-Latn.json", root), "utf8"));
const ovPath = new URL("uz-Cyrl.overrides.json", root);
const overrides = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, "utf8")) : {};
const cyr = buildCyrillic(latin, overrides);
writeFileSync(new URL("uz-Cyrl.json", root), `${JSON.stringify(cyr, null, 2)}\n`);
