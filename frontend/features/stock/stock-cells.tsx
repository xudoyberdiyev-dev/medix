"use client";

import { CircleX, FileText, Gift, Lock, ScanBarcode, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { StockFlag } from "./overview-state";

export const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** Yaroqlilik belgisi (prototip): oʻtgan — qizil, ≤30 kun — qizil, ≤90 — sariq, aks holda — sana. */
export function ExpiryCell({ date, days }: { date: string | null | undefined; days: number | null | undefined }) {
  const t = useTranslations("stock");
  if (!date || days == null) return <span className="text-text-secondary">—</span>;
  if (days < 0)
    return (
      <span className="flex items-center gap-2">
        {day(date)}
        <Badge tone="danger" icon={CircleX}>
          {t("ov.expiredShort")}
        </Badge>
      </span>
    );
  if (days <= 90)
    return (
      <span className="flex items-center gap-2">
        {day(date)}
        <Badge tone={days <= 30 ? "danger" : "warning"}>{t("ov.daysLeft", { days })}</Badge>
      </span>
    );
  return <span>{day(date)}</span>;
}

const FLAG_ICON: Record<StockFlag, { icon: LucideIcon; cls: string }> = {
  MARKED: { icon: ScanBarcode, cls: "text-text-secondary" },
  CONTROLLED: { icon: Lock, cls: "text-danger" },
  PRESCRIPTION: { icon: FileText, cls: "text-info" },
  BONUS: { icon: Gift, cls: "text-primary" },
};

export function Flags({ flags }: { flags: StockFlag[] }) {
  const t = useTranslations("stock");
  if (!flags.length) return null;
  return (
    <span className="flex items-center gap-1.5">
      {flags.map((f) => {
        const { icon: I, cls } = FLAG_ICON[f];
        return (
          <span key={f} title={t(`ov.flag.${f}`)} aria-label={t(`ov.flag.${f}`)}>
            <I size={15} strokeWidth={1.5} className={cls} aria-hidden />
          </span>
        );
      })}
    </span>
  );
}
