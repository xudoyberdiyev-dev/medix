"use client";

import { NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { TIME_ZONE, type Locale } from "./config";
import { MESSAGES } from "./messages";

/** Tarjimalar konteksti. Tilni server cookie'dan aniqlaydi (`LocaleProvider`), bu yerda faqat lugʻat ulanadi. */
export function IntlProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone={TIME_ZONE}>
      {children}
    </NextIntlClientProvider>
  );
}
