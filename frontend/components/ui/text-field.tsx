"use client";

import { useTranslations } from "next-intl";
import { Eye, EyeOff, Search, X } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { Field, controlClass, hintId, type ControlSize } from "./field";
import { Icon } from "./icon";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "value" | "onChange" | "type"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  variant?: "text" | "search" | "password" | "amount";
  suffix?: string;
  hint?: string;
  error?: string;
  size?: ControlSize;
}

/** Summa maydoniga kiritilgan matnni kanonik satrga aylantiradi: «1.250.000,5» → «1250000.50». */
export function parseAmount(input: string): string | null {
  const cleaned = input.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (cleaned === "") return "";
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [int, frac = ""] = cleaned.replace("-", "").split(".");
  const canonical = `${BigInt(int)}.${frac.padEnd(2, "0")}`;
  return negative && /[1-9]/.test(canonical) ? `-${canonical}` : canonical;
}

/**
 * Matn maydoni (design/system: TextField). Xato = nima boʻldi + nima qilish kerak.
 * `amount` — qiymat kanonik satr («1250000.00»), fokusdan chiqqanda `1.250.000,00` koʻrinishida.
 */
export function TextField({
  label,
  value,
  onChange,
  variant = "text",
  suffix,
  hint,
  error,
  size = "md",
  required,
  disabled,
  id: idProp,
  className,
  onBlur,
  onFocus,
  ...rest
}: TextFieldProps) {
  const t = useTranslations("ui");
  const autoId = useId();
  const id = idProp ?? autoId;
  const [showPassword, setShowPassword] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const isAmount = variant === "amount";
  const shown = isAmount ? (draft ?? (value === "" ? "" : formatMoney(value))) : value;

  return (
    <Field id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <div className={controlClass({ size, error: Boolean(error), disabled })}>
        {variant === "search" ? <Icon icon={Search} className="text-text-secondary" /> : null}
        <input
          id={id}
          type={variant === "password" && !showPassword ? "password" : variant === "search" ? "search" : "text"}
          inputMode={isAmount ? "decimal" : undefined}
          value={shown}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? hintId(id) : undefined}
          onChange={(e) => (isAmount ? setDraft(e.target.value) : onChange(e.target.value))}
          onFocus={(e) => {
            if (isAmount) setDraft(value === "" ? "" : formatMoney(value));
            onFocus?.(e);
          }}
          onBlur={(e) => {
            if (isAmount && draft !== null) {
              const parsed = parseAmount(draft);
              if (parsed !== null) onChange(parsed);
              setDraft(null);
            }
            onBlur?.(e);
          }}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-disabled disabled:cursor-not-allowed",
            isAmount && "tabular text-right",
            variant === "search" && "[&::-webkit-search-cancel-button]:hidden",
          )}
          {...rest}
        />
        {suffix ? <span className="whitespace-nowrap text-text-secondary">{suffix}</span> : null}
        {variant === "search" && value && !disabled ? (
          <button
            type="button"
            aria-label={t("clear")}
            onClick={() => onChange("")}
            className="-mr-1 flex size-7 items-center justify-center rounded-control text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Icon icon={X} />
          </button>
        ) : null}
        {variant === "password" ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            onClick={() => setShowPassword((v) => !v)}
            className="-mr-1 flex size-7 items-center justify-center rounded-control text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Icon icon={showPassword ? EyeOff : Eye} />
          </button>
        ) : null}
      </div>
    </Field>
  );
}
