import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type LucideIcon } from "./icon";

export interface CardProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Tana ichki chetisiz (jadval kartaga toʻliq joylashganda). */
  flush?: boolean;
}

/** Karta: `surface`, 1px `border`, `radius-card`. Soya yoʻq. */
export function Card({ title, actions, children, className, flush }: CardProps) {
  return (
    <section className={cn("rounded-card border border-border bg-surface", className)}>
      {title || actions ? (
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          {title ? <h2 className="min-w-0 flex-1 text-subtitle">{title}</h2> : null}
          {actions}
        </header>
      ) : null}
      <div className={flush ? undefined : "p-5"}>{children}</div>
    </section>
  );
}

export interface KpiCardProps {
  label: string;
  icon?: LucideIcon;
  /** Formatlangan qiymat (`formatMoney`, `formatQuantity`). */
  value: string;
  unit?: string;
  /** Maʼlumot qayerdan va qachon olingani. */
  note?: string;
  tone?: "default" | "warning";
}

/** Koʻrsatkich kartasi: faqat real hisoblangan raqam va uning manbasi — toʻqilgan «oʻsish» yoʻq. */
export function KpiCard({ label, icon, value, unit, note, tone = "default" }: KpiCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-5">
      <p className="flex items-center gap-2 text-text-secondary">
        {icon ? <Icon icon={icon} className="text-primary" /> : null}
        {label}
      </p>
      <p className="tabular text-kpi whitespace-nowrap">
        {value}
        {unit ? <span className="ml-1 text-body font-medium text-text-secondary">{unit}</span> : null}
      </p>
      {note ? <p className={cn("text-caption", tone === "warning" ? "text-warning" : "text-text-secondary")}>{note}</p> : null}
    </div>
  );
}
