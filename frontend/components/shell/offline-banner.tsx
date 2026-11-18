"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOnline } from "@/lib/use-online";

/** U13: internet uzilganda yuqorida ogohlantirish lentasi (ish yoʻqolmaydi — amallar ulanish tiklangach yuboriladi). */
export function OfflineBanner() {
  const t = useTranslations("shell");
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 bg-warning-bg px-4 py-2 text-table text-warning print:hidden"
    >
      <WifiOff size={16} strokeWidth={1.5} aria-hidden />
      <span>
        <strong className="font-semibold">{t("offlineTitle")}</strong> {t("offlineText")}
      </span>
    </div>
  );
}
