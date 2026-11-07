"use client";

import { useTranslations } from "next-intl";
import type { ReceiveLineError } from "./api";

/** `ReceiveLineError` → foydalanuvchi tilidagi matn (OK va FS qabulida umumiy). */
export function useReceiveErrorText(): (e: ReceiveLineError) => string {
  const t = useTranslations("warehouseTransfers.lineError");
  return (e) =>
    e.code === "overSent"
      ? t("overSent", { product: e.product, batch: e.batch, sent: String(e.sent), got: String(e.got) })
      : t("notInt", { product: e.product, batch: e.batch });
}
