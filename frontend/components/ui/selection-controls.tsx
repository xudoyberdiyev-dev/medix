"use client";

import { Check, Minus } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

const choiceClass = "relative inline-flex min-h-8 cursor-pointer items-center gap-2 text-text-primary";
const disabledClass = "cursor-not-allowed text-text-disabled";

function Label({ label, description }: { label?: string; description?: string }) {
  if (!label) return null;
  return (
    <span className="flex flex-col">
      <span>{label}</span>
      {description ? <span className="text-caption text-text-secondary">{description}</span> : null}
    </span>
  );
}

export interface CheckboxProps {
  label?: string;
  description?: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  error?: boolean;
  onChange: (checked: boolean) => void;
  /** Matnsiz (jadvaldagi) checkbox uchun majburiy. */
  "aria-label"?: string;
  className?: string;
}

/** Checkbox — mustaqil tanlov va jadvaldagi ommaviy tanlash; «qisman» holati bor. */
export function Checkbox({
  label,
  description,
  checked,
  indeterminate = false,
  disabled,
  error,
  onChange,
  className,
  ...aria
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const on = checked || indeterminate;
  return (
    <label className={cn(choiceClass, disabled && disabledClass, className)}>
      <input
        ref={ref}
        type="checkbox"
        className="peer absolute size-px opacity-0"
        checked={checked}
        disabled={disabled}
        aria-checked={indeterminate ? "mixed" : checked}
        aria-label={aria["aria-label"]}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm border text-white transition-colors duration-150 ease-out",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
          disabled
            ? cn("border-border", on ? "bg-border text-text-disabled" : "bg-background")
            : on
              ? "border-primary-button bg-primary-button"
              : cn("bg-surface", error ? "border-danger" : "border-text-disabled", "hover:border-primary"),
        )}
      >
        {indeterminate ? <Minus size={12} strokeWidth={2.5} /> : checked ? <Check size={12} strokeWidth={2.5} /> : null}
      </span>
      <Label label={label} description={description} />
    </label>
  );
}

export interface RadioProps {
  label: string;
  description?: string;
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/** Radio — 2–5 ta oʻzaro istisno variant, hammasi koʻrinib turadi. */
export function Radio({ label, description, name, value, checked, disabled, onChange }: RadioProps) {
  return (
    <label className={cn(choiceClass, disabled && disabledClass)}>
      <input
        type="radio"
        className="peer absolute size-px opacity-0"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span
        aria-hidden
        className={cn(
          "size-4 shrink-0 rounded-full border transition-colors duration-150 ease-out",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
          disabled
            ? "border-border bg-background"
            : checked
              ? "border-[5px] border-primary-button"
              : "border-text-disabled hover:border-primary",
        )}
      />
      <Label label={label} description={description} />
    </label>
  );
}

export interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Switch — darhol kuchga kiradigan sozlama. Formada saqlanadigan qiymat uchun Checkbox. */
export function Switch({ label, description, checked, disabled, onChange }: SwitchProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn(choiceClass, disabled && disabledClass)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="peer absolute size-px opacity-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150 ease-out",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
          "after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-white after:transition-transform after:duration-150",
          disabled ? "bg-border" : checked ? "bg-primary-button hover:bg-primary-button-hover" : "bg-text-disabled hover:bg-text-secondary",
          checked && "after:translate-x-3.5",
        )}
      />
      <Label label={label} description={description} />
    </label>
  );
}
