import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";
import { Suspense } from "react";
import { LocaleProvider } from "@/i18n/locale-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "100+",
  description: "Farmatsevtika ulgurji distribyutsiyasi uchun ERP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: mavzu sinfi gidratatsiyadan oldin skript bilan qoʻyiladi (O24).
    <html lang="uz-Latn" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {/* Til cookie'dan oʻqiladi (dinamik) — shu sabab Suspense ichida. */}
        <Suspense>
          <LocaleProvider>
            <Providers>{children}</Providers>
          </LocaleProvider>
        </Suspense>
      </body>
    </html>
  );
}
