import type { Locale } from "./config";
import { ru, uzCyrl, uzLatn } from "./messages.generated";

/** Barcha lugʻatlar (hozircha bundlega birga kiradi; kattalashsa til boʻyicha ajratiladi). */
export const MESSAGES: Record<Locale, typeof uzLatn> = { "uz-Latn": uzLatn, "uz-Cyrl": uzCyrl, ru };
