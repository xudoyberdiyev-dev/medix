"use client";

import { useTranslations } from "next-intl";

/** Sozlash ustasi sarlavhasi (server layout/page ichida tarjima uchun). */
export function SetupHeaderLabel() {
  const t = useTranslations("setup");
  return <span className="text-text-secondary">· {t("wizard")}</span>;
}

export function SetupIntro() {
  const t = useTranslations("setup");
  return (
    <>
      <h1 className="mb-1 text-page-title">{t("title")}</h1>
      <p className="mb-6 text-text-secondary">{t("intro")}</p>
    </>
  );
}
