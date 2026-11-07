"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

/** Faol filtr belgisi (masalan, hisobotdan oʻtilganda «Mijoz: …»): matn va olib tashlash tugmasi. */
export function FilterChip({ label, what, onClear }: { label: string; what: string; onClear: () => void }) {
  const t = useTranslations("ui");
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-caption">
      {label}
      <button
        type="button"
        aria-label={t("removeFilter", { what })}
        className="text-text-secondary hover:text-text-primary"
        onClick={onClear}
      >
        <X size={14} strokeWidth={1.5} aria-hidden />
      </button>
    </span>
  );
}
