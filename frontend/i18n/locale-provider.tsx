import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { LEGACY_LOCALE_COOKIE, LOCALE_COOKIE, resolveLocale } from "./config";
import { IntlProvider } from "./intl-provider";

/**
 * Tilni cookie'dan oʻqiydi. `cacheComponents` yoqilgani uchun cookie oʻqish dinamik —
 * shu komponent root layoutda `<Suspense>` ichida turadi (Next 16: internationalization qoʻllanmasi).
 */
export async function LocaleProvider({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const locale = resolveLocale(jar.get(LOCALE_COOKIE)?.value ?? jar.get(LEGACY_LOCALE_COOKIE)?.value);
  return <IntlProvider locale={locale}>{children}</IntlProvider>;
}
