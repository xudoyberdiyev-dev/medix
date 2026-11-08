"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { useMe } from "@/features/auth/session";
import { useSetupStatus } from "./api";

/**
 * Bosh sahifada CEO uchun: sozlash ustasi yakunlanmagan boʻlsa — avtomatik ustaga oʻtkaziladi
 * (egasi talabi 08.11: birinchi kirishda Direktor darhol kompaniyani sozlaydi); qaytsa — eslatma.
 */
export function SetupBanner() {
  const me = useMe();
  if (me.data?.role.code !== "DIRECTOR") return null;
  return <DirectorSetupBanner />;
}

function DirectorSetupBanner() {
  const t = useTranslations("setup.banner");
  const status = useSetupStatus();
  const router = useRouter();
  const pending = status.data !== undefined && !status.data.completed;
  useEffect(() => {
    if (pending && sessionStorageGet("medix.setup.redirected") !== "1") {
      sessionStorageSet("medix.setup.redirected", "1");
      router.replace("/setup");
    }
  }, [pending, router]);
  if (!pending) return null;
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

function sessionStorageGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionStorageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // brauzer xotirasi yopiq — har safar yoʻnaltiriladi, bu ham maqbul
  }
}
