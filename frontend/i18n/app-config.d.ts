import type { Locale } from "./config";
import type { uzLatn } from "./messages.generated";

/** next-intl tiplari: kalitlar uz-Latn lugʻatidan tekshiriladi (notoʻgʻri kalit — typecheck xatosi). */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof uzLatn;
  }
}
