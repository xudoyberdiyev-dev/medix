"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { useMe } from "@/features/auth/session";
import { useSetupStatus } from "./api";

/** Bosh sahifada CEO uchun: sozlash ustasi yakunlanmagan boʻlsa eslatma. */
export function SetupBanner() {
  const me = useMe();
  if (me.data?.role.code !== "DIRECTOR") return null;
  return <DirectorSetupBanner />;
}

function DirectorSetupBanner() {
  const t = useTranslations("setup.banner");
  const status = useSetupStatus();
  if (!status.data || status.data.completed) return null;
  return (
    <Alert
      tone="info"
      title={t("title")}
      action={
        <Link
          href="/setup"
          className="inline-flex h-control-sm items-center rounded-control border border-border bg-surface px-3 text-table font-medium hover:bg-background"
        >
          {t("open")}
        </Link>
      }
    >
      {t("description")}
    </Alert>
  );
}
