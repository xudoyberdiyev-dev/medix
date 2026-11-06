import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type LucideIcon } from "./icon";

export type AlertTone = "success" | "warning" | "danger" | "info";

const tones: Record<AlertTone, { className: string; icon: LucideIcon }> = {
  success: { className: "bg-success-bg text-success", icon: CircleCheck },
  warning: { className: "bg-warning-bg text-warning", icon: TriangleAlert },
  danger: { className: "bg-danger-bg text-danger", icon: CircleAlert },
  info: { className: "bg-info-bg text-info", icon: Info },
};

export interface AlertProps {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

/** Sahifa ichidagi xabar: sarlavha — nima boʻldi; matn — nima qilish kerak. */
export function Alert({ tone, title, children, action, icon, className }: AlertProps) {
  const t = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-card px-4 py-3", t.className, className)}
    >
      <Icon icon={icon ?? t.icon} size="md" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-0.5">{children}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap gap-2 text-text-primary">{action}</div> : null}
      </div>
    </div>
  );
}
