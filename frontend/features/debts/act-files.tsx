"use client";

import { FileSpreadsheet, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/** O17: akt sverka hujjat tili — ru (standart, shablon kabi), uz-Latn, uz-Cyrl. */
export const ACT_LANGS = ["ru", "uz-Latn", "uz-Cyrl"] as const;
export type ActLang = (typeof ACT_LANGS)[number];

/** Akt fayli manzili: asos (…/act yoki /api/reconciliations/{id}) + /pdf|/xlsx, til va mavjud soʻrov parametrlari. */
export function actFileUrl(base: string, format: "pdf" | "xlsx", lang: ActLang, query?: URLSearchParams): string {
  const q = new URLSearchParams(query);
  q.set("lang", lang);
  return `${base}/${format}?${q.toString()}`;
}

/** Til tanlovi + «PDF» va «Excel» tugmalari (akt sverka — egasi shablonida). */
export function ActFiles(props: { base: string; query?: URLSearchParams; disabled?: boolean }) {
  const t = useTranslations("debts.act");
  const [lang, setLang] = useState<ActLang>("ru");
  const open = (format: "pdf" | "xlsx") => window.open(actFileUrl(props.base, format, lang, props.query), "_blank", "noopener");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-44">
        <Select
          label={t("lang")}
          size="sm"
          value={lang}
          onChange={(v) => setLang((v as ActLang | null) ?? "ru")}
          options={ACT_LANGS.map((l) => ({ value: l, label: t(`langs.${l}`) }))}
        />
      </div>
      <Button variant="secondary" size="sm" icon={Printer} disabled={props.disabled} onClick={() => open("pdf")}>
        {t("pdf")}
      </Button>
      <Button variant="secondary" size="sm" icon={FileSpreadsheet} disabled={props.disabled} onClick={() => open("xlsx")}>
        {t("excel")}
      </Button>
    </div>
  );
}
