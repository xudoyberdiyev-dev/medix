"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/select";
import { LOCALE_NAMES, LOCALES, isLocale, writeLocaleCookie } from "@/i18n/config";

const OPTIONS = LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }));

/** Interfeys tili: cookie'ga yoziladi, sahifa serverdan yangi til bilan qayta chiziladi (URL oʻzgarmaydi). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      label={t("label")}
      hint={t("hint")}
      options={OPTIONS}
      value={locale}
      disabled={pending}
      className={className}
      onChange={(v) => {
        if (!isLocale(v) || v === locale) return;
        writeLocaleCookie(v);
        startTransition(() => router.refresh());
      }}
    />
  );
}

/** Profil → Til (prototip Profile): uchta radio karta — «Oʻzbek (lotin)», «Ўзбек (кирилл)», «Русский». */
export function LanguageRadios() {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="radiogroup" aria-label={t("label")} className="flex flex-col gap-2">
      {LOCALES.map((l) => {
        const on = l === locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={pending}
            onClick={() => {
              if (on) return;
              writeLocaleCookie(l);
              startTransition(() => router.refresh());
            }}
            className={cn(
              "flex h-10 items-center gap-3 rounded-card border px-3 text-left transition-colors",
              on ? "border-primary bg-primary-soft" : "border-border hover:border-text-secondary",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-4 flex-none items-center justify-center rounded-full border",
                on ? "border-primary" : "border-border",
              )}
            >
              {on ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            {LOCALE_FULL_NAMES[l]}
          </button>
        );
      })}
    </div>
  );
}

const LOCALE_FULL_NAMES: Record<(typeof LOCALES)[number], string> = {
  "uz-Latn": "Oʻzbek (lotin)",
  "uz-Cyrl": "Ўзбек (кирилл)",
  ru: "Русский",
};
