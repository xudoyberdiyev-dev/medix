/**
 * Backend xato/xabar matnlari: `messages_uz_Cyrl.properties` ni `messages.properties` (uz-Latn) dan yasaydi.
 * `pnpm i18n:cyrl` bilan birga ishlaydi. Rus tili (`messages_ru.properties`) — qoʻlda.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { propertiesToCyrillic } from "../i18n/properties.ts";

const dir = new URL("../../backend/src/main/resources/", import.meta.url);
const latin = readFileSync(new URL("messages.properties", dir), "utf8");
writeFileSync(new URL("messages_uz_Cyrl.properties", dir), propertiesToCyrillic(latin));
console.log("backend messages_uz_Cyrl.properties yangilandi");
