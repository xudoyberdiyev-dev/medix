"use client";

import { useTranslations } from "next-intl";

export function PasswordIntro() {
  const t = useTranslations("password");
  return (
    <>
      <h1 className="text-section-title">{t("title")}</h1>
      <p className="mt-1 mb-8 text-text-secondary">{t("intro")}</p>
    </>
  );
}
