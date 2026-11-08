"use client";

import { useTranslations } from "next-intl";
import type { LineError } from "./api";

/** `LineError` → foydalanuvchi tilidagi matn (ZK, OK, FS, HC, QY formalarida umumiy). */
export function useLineErrorText(): (e: LineError) => string {
  const t = useTranslations("zoneTransfers.lineError");
  return (e) =>
    e.code === "overFree"
      ? t("overFree", { product: e.product, batch: e.batch, free: String(e.free), got: String(e.got) })
      : t("notPositiveInt", { product: e.product, batch: e.batch });
}
