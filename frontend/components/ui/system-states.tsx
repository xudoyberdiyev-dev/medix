"use client";

import { useTranslations } from "next-intl";
import { CircleAlert, Lock, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/errors";
import { Alert } from "./alert";
import { Button } from "./button";
import { Icon, type LucideIcon } from "./icon";

/**
 * Tizim holatlari (design/system: SystemStates) — har jadval va kartada bir xil:
 * yuklanish (skelet), boʻsh, qidiruv natija bermadi, xato, ruxsat yoʻq.
 */

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Sahifaning yagona asosiy harakati. */
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-background text-text-secondary">
        <Icon icon={icon} size="md" />
      </div>
      <h2 className="text-subtitle">{title}</h2>
      <p className="mt-1 max-w-90 text-text-secondary">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function NoResultsState({ onClearFilters }: { onClearFilters?: () => void }) {
  const t = useTranslations("ui");
  return (
    <EmptyState
      icon={SearchX}
      title={t("noResults")}
      description={t("noResultsHint")}
      action={
        onClearFilters ? (
          <Button variant="secondary" onClick={onClearFilters}>
            {t("clearFilters")}
          </Button>
        ) : undefined
      }
    />
  );
}

export function ForbiddenState({ description }: { description?: string }) {
  const t = useTranslations("ui");
  return <EmptyState icon={Lock} title={t("forbidden")} description={description ?? t("forbiddenHint")} />;
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  /** Soʻrov xatosi: 404 boʻlsa — «Topilmadi» holati (qayta urinish foydasiz). */
  error?: unknown;
}

export function ErrorState({ title, description, onRetry, error }: ErrorStateProps) {
  const t = useTranslations("ui");
  if (error instanceof ApiError && error.status === 404)
    return <EmptyState icon={SearchX} title={t("notFound")} description={t("notFoundHint")} />;
  // Server ruxsat bermadi (403) — «Yuklab boʻlmadi» emas, «Ruxsat yoʻq» holati.
  if (error instanceof ApiError && error.status === 403) return <ForbiddenState />;
  return (
    <div className="p-4">
      <Alert
        tone="danger"
        icon={CircleAlert}
        title={title ?? t("loadError")}
        action={
          onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : undefined
        }
      >
        {description ?? t("loadErrorHint")}
      </Alert>
    </div>
  );
}

/** Skelet chiziq: `border` rangida, sekin pulsatsiya (harakatni kamaytirish sozlamasida toʻxtaydi). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block h-3 animate-skeleton rounded-sm bg-border motion-reduce:animate-none", className)} />;
}
