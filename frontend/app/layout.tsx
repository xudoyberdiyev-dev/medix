import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MEDIX",
  description: "Farmatsevtika ulgurji distribyutsiyasi uchun ERP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz-Latn" className="h-full">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
