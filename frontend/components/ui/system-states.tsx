import { CircleAlert, Lock, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
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
  return (
    <EmptyState
      icon={SearchX}
      title="Hech narsa topilmadi"
      description="Qidiruv soʻzini yoki filtrlarni oʻzgartiring."
      action={
        onClearFilters ? (
          <Button variant="secondary" onClick={onClearFilters}>
            Filtrlarni tozalash
          </Button>
        ) : undefined
      }
    />
  );
}

export function ForbiddenState({
  description = "Bu boʻlimni koʻrish uchun ruxsatingiz yoʻq. Administratorga murojaat qiling.",
}: {
  description?: string;
}) {
  return <EmptyState icon={Lock} title="Ruxsat yoʻq" description={description} />;
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Maʼlumot yuklanmadi",
  description = "Internet aloqasini tekshirib, qayta urinib koʻring.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="p-4">
      <Alert
        tone="danger"
        icon={CircleAlert}
        title={title}
        action={
          onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Qayta urinish
            </Button>
          ) : undefined
        }
      >
        {description}
      </Alert>
    </div>
  );
}

/** Skelet chiziq: `border` rangida, sekin pulsatsiya (harakatni kamaytirish sozlamasida toʻxtaydi). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block h-3 animate-skeleton rounded-sm bg-border motion-reduce:animate-none", className)} />;
}
