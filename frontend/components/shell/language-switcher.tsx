"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
