"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Bookmark, CalendarClock, CalendarX, CircleCheck, CircleX, FilePenLine, Hourglass, ShieldCheck, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon, type LucideIcon } from "./icon";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

export type BadgeStatus = "draft" | "pending" | "approved" | "cancelled" | "valid" | "expiring" | "expired" | "in_transit" | "reserved";

const tones: Record<Tone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-background text-text-secondary",
  primary: "bg-primary-soft text-primary-button",
};

/** Tayyor holatlar — nomlar hamma joyda bir xil (design/system: Badge). */
export const BADGE_STATUSES: Record<BadgeStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  draft: { tone: "neutral", icon: FilePenLine, label: "Qoralama" },
  pending: { tone: "warning", icon: Hourglass, label: "Tasdiqlashda" },
  approved: { tone: "success", icon: CircleCheck, label: "Tasdiqlangan" },
  cancelled: { tone: "danger", icon: CircleX, label: "Bekor qilingan" },
  valid: { tone: "success", icon: ShieldCheck, label: "Yaroqli" },
  expiring: { tone: "warning", icon: CalendarClock, label: "Muddati yaqin" },
  expired: { tone: "danger", icon: CalendarX, label: "Muddati oʻtgan" },
  in_transit: { tone: "info", icon: Truck, label: "Yoʻlda" },
  reserved: { tone: "primary", icon: Bookmark, label: "Band qilingan" },
};

export interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  status?: BadgeStatus;
  children?: ReactNode;
  className?: string;
}

/** Holat belgisi: doim ikonka + soʻz + rang. Bosilmaydi. */
export function Badge({ tone, icon, status, children, className }: BadgeProps) {
  const t = useTranslations("ui.status");
  const preset = status ? BADGE_STATUSES[status] : undefined;
  const finalTone = tone ?? preset?.tone ?? "neutral";
  const finalIcon = icon ?? preset?.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-control px-2 text-caption font-medium",
        tones[finalTone],
        className,
      )}
    >
      {finalIcon ? <Icon icon={finalIcon} /> : null}
      {children ?? (status ? t(status) : null)}
    </span>
  );
}
