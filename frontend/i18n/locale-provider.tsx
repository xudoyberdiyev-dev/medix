import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { LOCALE_COOKIE, resolveLocale } from "./config";
import { IntlProvider } from "./intl-provider";

/**
 * Tilni cookie'dan oʻqiydi. `cacheComponents` yoqilgani uchun cookie oʻqish dinamik —
 * shu komponent root layoutda `<Suspense>` ichida turadi (Next 16: internationalization qoʻllanmasi).
 */
export async function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return <IntlProvider locale={locale}>{children}</IntlProvider>;
}
