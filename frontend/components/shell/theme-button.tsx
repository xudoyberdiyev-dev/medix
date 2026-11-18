"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/lib/theme";

/** O24 — topbar: yorugʻ ↔ qorongʻi rejim (toʻliq tanlov, jumladan «Tizim boʻyicha» — Profil sahifasida). */
export function ThemeButton() {
  const t = useTranslations("shell");
  const { resolved, toggle } = useTheme();
  const label = resolved === "dark" ? t("themeToLight") : t("themeToDark");
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex size-control-md items-center justify-center rounded-control text-text-secondary hover:bg-background max-md:hidden"
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
