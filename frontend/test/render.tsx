import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { IntlProvider } from "@/i18n/intl-provider";
import type { Locale } from "@/i18n/config";

/** Testing Library `render` — tarjima konteksti bilan (asosiy til uz-Latn). */
export function renderIntl(ui: ReactElement, { locale = "uz-Latn", ...options }: RenderOptions & { locale?: Locale } = {}) {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <IntlProvider locale={locale}>{children}</IntlProvider>,
    ...options,
  });
}
