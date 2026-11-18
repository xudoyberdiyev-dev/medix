"use client";

import { ArrowBigUp, CircleAlert, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Icon, type LucideIcon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

type AuthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size"> & {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  password?: boolean;
  /** Yashirin matn, lekin koʻz tugmasisiz (koʻrinish `shown` bilan boshqariladi). */
  masked?: boolean;
  /** Parol koʻrinishi tashqaridan boshqariladi (yangi parol va takrori birga). */
  shown?: boolean;
  onToggleShown?: () => void;
  /** Oʻng tomondagi belgi (masalan, parollar mos — ✓). */
  trailing?: ReactNode;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Kirish sahifasi (O20): 56 px maydon, parol uchun matnli «Koʻrsatish» tugmasi. */
  large?: { show: string; hide: string };
  /** Maydon ostidagi izoh (xato boʻlmaganda). */
  hint?: string;
  children?: ReactNode;
};

/** Kirish sahifalari maydoni (prototip LoginScreen): yorliq, 44 px maydon chap ikonka bilan, xato pastda. */
export function AuthInput({
  id,
  label,
  icon,
  value,
  onChange,
  password = false,
  masked = false,
  shown: shownProp,
  onToggleShown,
  trailing,
  error,
  disabled,
  inputRef,
  large,
  hint,
  className,
  children,
  ...rest
}: AuthInputProps) {
  const t = useTranslations("ui");
  const [ownShown, setOwnShown] = useState(false);
  const shown = shownProp ?? ownShown;
  const toggle = onToggleShown ?? (() => setOwnShown((v) => !v));
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const top = large ? "top-[20px]" : "top-[14px]";
  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={id} className={cn("font-medium text-text-primary", large ? "text-subtitle" : "text-table")}>
        {label}
      </label>
      <div className={cn("relative", large ? "mt-[8px]" : "mt-[6px]")}>
        <Icon icon={icon} className={cn("pointer-events-none absolute left-[14px] text-text-secondary", top)} />
        <input
          id={id}
          ref={inputRef}
          type={(password || masked) && !shown ? "password" : "text"}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            large ? "h-[56px] rounded-[12px] text-subtitle font-normal" : "h-[44px] rounded-card text-body",
            "w-full border bg-surface pl-[40px] text-text-primary outline-none placeholder:text-text-disabled",
            "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
            password && large ? "pr-[120px]" : password || trailing ? "pr-[44px]" : "pr-[14px]",
            error
              ? "border-danger focus:shadow-[0_0_0_3px_var(--color-danger-bg)]"
              : "border-border hover:border-text-disabled focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)]",
            disabled && "cursor-not-allowed bg-table-header text-text-secondary",
          )}
          {...rest}
        />
        {password && large ? (
          <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            aria-pressed={shown}
            className="absolute top-[8px] right-[8px] flex h-[40px] items-center rounded-control px-[10px] text-body font-medium text-link transition-colors duration-150 ease-out hover:bg-primary-soft"
          >
            {shown ? large.hide : large.show}
          </button>
        ) : password ? (
          <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            aria-label={shown ? t("hidePassword") : t("showPassword")}
            title={shown ? t("hidePassword") : t("showPassword")}
            className="absolute top-[6px] right-[6px] flex size-[32px] items-center justify-center rounded-control text-text-secondary transition-colors duration-150 ease-out hover:bg-background hover:text-text-primary"
          >
            <Icon icon={shown ? EyeOff : Eye} />
          </button>
        ) : trailing ? (
          <span className={cn("absolute right-[14px] flex", top)}>{trailing}</span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="mt-[6px] flex items-center gap-[6px] text-caption text-danger">
          <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-[8px] text-table text-text-secondary">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** Caps Lock holatini kuzatish (parol maydonlari uchun). */
export function useCapsLock() {
  const [caps, setCaps] = useState(false);
  const check = (e: KeyboardEvent<HTMLInputElement>) => {
    const on = e.getModifierState?.("CapsLock") ?? false;
    if (on !== caps) setCaps(on);
  };
  return { caps, onKeyDown: check, onKeyUp: check };
}

export function CapsWarning({ show }: { show: boolean }) {
  const t = useTranslations("login");
  if (!show) return null;
  return (
    <p role="status" className="mt-[6px] flex items-center gap-[6px] text-caption text-warning">
      <ArrowBigUp size={14} strokeWidth={1.5} aria-hidden />
      {t("caps")}
    </p>
  );
}
