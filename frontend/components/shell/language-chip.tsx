"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { LOCALE_NAMES, LOCALES, writeLocaleCookie } from "@/i18n/config";

export const LANG_CODE: Record<string, string> = { "uz-Latn": "UZ", "uz-Cyrl": "ЎЗ", ru: "RU" };

/** Yuqori paneldagi til belgisi (prototip: «UZ») — bosilsa uch til roʻyxati. */
export function LanguageChip() {
  const t = useTranslations("shell");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative max-md:hidden">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("language")}: ${LOCALE_NAMES[locale as keyof typeof LOCALE_NAMES] ?? locale}`}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className="flex h-control-sm min-w-9 items-center justify-center rounded-control px-2 text-[13px] font-medium text-text-secondary hover:bg-background hover:text-text-primary"
      >
        {LANG_CODE[locale] ?? locale}
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 min-w-44 rounded-control border border-border bg-surface py-1 shadow-overlay"
        >
          {LOCALES.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (l === locale) return;
                  writeLocaleCookie(l);
                  startTransition(() => router.refresh());
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background",
                  l === locale && "text-primary-button",
                )}
              >
                <span className="w-7 font-mono text-caption text-text-secondary">{LANG_CODE[l]}</span>
                {LOCALE_NAMES[l]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
