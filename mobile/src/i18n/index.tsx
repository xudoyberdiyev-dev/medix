import { createContext, useCallback, useContext, useMemo, useState, type ReactNode, useEffect } from "react";
import { setApiLocale } from "../lib/api";
import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import uzLatn from "../../messages/uz-Latn.json";
import uzCyrl from "../../messages/uz-Cyrl.json";
import ru from "../../messages/ru.json";

export type Locale = "uz-Latn" | "uz-Cyrl" | "ru";
export const LOCALES: readonly Locale[] = ["uz-Latn", "uz-Cyrl", "ru"];
const DICT: Record<Locale, unknown> = { "uz-Latn": uzLatn, "uz-Cyrl": uzCyrl, ru };

/** Kalit uch tilda bir xil (testda tekshiriladi), shuning uchun uz-Latn tuzilmasi asos. */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<typeof uzLatn>;

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const LOCALE_KEY = "yuzplus.locale";

function savedLocale(): Locale | null {
  try {
    const v = SecureStore.getItem(LOCALE_KEY);
    return v === "uz-Latn" || v === "uz-Cyrl" || v === "ru" ? v : null;
  } catch {
    return null;
  }
}

function initialLocale(): Locale {
  const saved = savedLocale();
  if (saved) return saved;
  const tag = getLocales()[0]?.languageTag ?? "";
  if (tag.startsWith("ru")) return "ru";
  if (tag.includes("Cyrl")) return "uz-Cyrl";
  return "uz-Latn";
}

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (k: MessageKey, v?: Record<string, string | number>) => string };
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  // Tanlangan til telefonda saqlanadi (keyingi ochilishda ham shu til)
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      SecureStore.setItem(LOCALE_KEY, l);
    } catch {
      // saqlab boʻlmasa — faqat shu sessiyada
    }
  }, []);
  const t = useCallback(
    (k: MessageKey, v?: Record<string, string | number>) => format(lookup(DICT[locale], k) ?? lookup(DICT["uz-Latn"], k) ?? k, v),
    [locale],
  );
  useEffect(() => setApiLocale(locale), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useT(): Ctx {
  const c = useContext(I18n);
  if (!c) throw new Error("I18nProvider yoʻq");
  return c;
}
