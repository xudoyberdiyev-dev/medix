/** Interfeys tillari (SPEC 10: uz-Latn asosiy, uz-Cyrl, ru). Til URL'da emas — cookie'da saqlanadi. */
export const LOCALES = ["uz-Latn", "uz-Cyrl", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "uz-Latn";
export const LOCALE_COOKIE = "MEDIX_LOCALE";
export const TIME_ZONE = "Asia/Tashkent";

/** Til tanlagichida koʻrsatiladigan nom — har til oʻz yozuvida. */
export const LOCALE_NAMES: Record<Locale, string> = {
  "uz-Latn": "Oʻzbekcha",
  "uz-Cyrl": "Ўзбекча",
  ru: "Русский",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cookie qiymatini tekshiradi; notoʻgʻri yoki boʻsh boʻlsa — asosiy til. */
export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Tanlangan tilni brauzerda saqlaydi (1 yil). Server keyingi soʻrovda shu cookie'dan oʻqiydi. */
export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
