"use client";

import { Ban, CircleAlert, CircleCheck, CirclePause, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatIsoDate, licenseState, todayTashkent } from "./api";
export function StatusBadge({ blocked, active }: { blocked: boolean; active: boolean }) {
  const t = useTranslations("counterparties.status");
  if (blocked)
    return (
      <Badge tone="danger" icon={Ban}>
        {t("BLOCKED")}
      </Badge>
    );
  return active ? (
    <Badge tone="success" icon={CircleCheck}>
      {t("ACTIVE")}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CirclePause}>
      {t("INACTIVE")}
    </Badge>
  );
}

export function LicenseBadge({ validUntil }: { validUntil?: string | null }) {
  const t = useTranslations("counterparties.license");
  const state = licenseState(validUntil, todayTashkent());
  if (state === "none")
    return (
      <Badge tone="warning" icon={CircleAlert}>
        {t("none")}
      </Badge>
    );
  if (state === "expired")
    return (
      <Badge tone="danger" icon={CircleAlert}>
        {t("expired", { date: formatIsoDate(validUntil) })}
      </Badge>
    );
  if (state === "expiring")
    return (
      <Badge tone="warning" icon={Clock}>
        {t("until", { date: formatIsoDate(validUntil) })}
      </Badge>
    );
  return (
    <Badge tone="success" icon={CircleCheck}>
      {t("until", { date: formatIsoDate(validUntil) })}
    </Badge>
  );
}
