import type { Locale } from "./config";
import type uzLatn from "@/messages/uz-Latn.json";

/** next-intl tiplari: kalitlar uz-Latn lugʻatidan tekshiriladi (notoʻgʻri kalit — typecheck xatosi). */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof uzLatn;
  }
}
