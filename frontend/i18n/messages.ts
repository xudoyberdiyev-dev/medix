import ru from "@/messages/ru.json";
import uzCyrl from "@/messages/uz-Cyrl.json";
import uzLatn from "@/messages/uz-Latn.json";
import type { Locale } from "./config";

/** Barcha lugʻatlar (hozircha kichik — bundlega birga kiradi; kattalashsa modul boʻyicha ajratiladi). */
export const MESSAGES: Record<Locale, typeof uzLatn> = { "uz-Latn": uzLatn, "uz-Cyrl": uzCyrl, ru };
