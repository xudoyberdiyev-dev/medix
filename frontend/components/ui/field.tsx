import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export type ControlSize = "sm" | "md" | "lg";

export const controlSizes: Record<ControlSize, string> = {
  sm: "h-control-sm px-2 text-table",
  md: "h-control-md px-3 text-body",
  lg: "h-control-lg px-4 text-body",
};

/** Maydon ramkasi (`mx-control`) — TextField, Select va DatePicker uchun umumiy. */
export function controlClass({ size = "md", error, disabled }: { size?: ControlSize; error?: boolean; disabled?: boolean }) {
  return cn(
    "flex w-full items-center gap-2 rounded-control border bg-surface transition-colors duration-150 ease-out",
    controlSizes[size],
    error ? "border-danger" : "border-border",
    disabled
      ? "cursor-not-allowed bg-background text-text-disabled"
      : cn(
          !error && "hover:border-text-disabled",
          "focus-within:outline-2 focus-within:outline-offset-2",
          error ? "focus-within:outline-danger" : "focus-within:border-primary focus-within:outline-primary",
        ),
  );
}

export interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  /** Yorliq `<label>` emas, matn sifatida (masalan, Select tugmasi uchun). */
  labelAs?: "label" | "span";
}

export function hintId(id: string) {
  return `${id}-hint`;
}

/** Nom tepada → maydon → izoh yoki xato pastda (design/system: TextField). */
export function Field({ id, label, required, hint, error, children, className, labelAs = "label" }: FieldProps) {
  const LabelTag = labelAs;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <LabelTag {...(labelAs === "label" ? { htmlFor: id } : { id: `${id}-label` })} className="font-medium text-text-secondary">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        ) : null}
      </LabelTag>
      {children}
      {error ? (
        <p id={hintId(id)} className="flex items-start gap-1 text-caption text-danger">
          <Icon icon={CircleAlert} />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId(id)} className="text-caption text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
