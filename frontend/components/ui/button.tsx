import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { Icon, type LucideIcon } from "./icon";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "tertiary" | "danger" | "icon";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "border-transparent bg-primary-button text-white hover:bg-primary-button-hover active:bg-primary-button-hover",
  secondary:
    "border-border bg-surface text-text-primary hover:border-text-disabled hover:bg-background active:border-primary active:bg-primary-soft",
  tertiary: "border-transparent bg-transparent px-2 text-primary-button hover:bg-background active:bg-primary-soft",
  danger: "border-transparent bg-danger text-white hover:shadow-[inset_0_0_0_999px_rgb(23_43_42/0.16)]",
  icon: "border-transparent bg-transparent px-0 text-text-secondary hover:bg-background hover:text-text-primary active:bg-primary-soft active:text-primary-button",
};

const sizes: Record<Size, string> = {
  sm: "h-control-sm text-table",
  md: "h-control-md text-body",
  lg: "h-control-lg text-body",
};

const paddings: Record<Size, string> = { sm: "px-3", md: "px-4", lg: "px-5" };

const iconSizes: Record<Size, string> = { sm: "w-control-sm", md: "w-control-md", lg: "w-control-lg" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

/**
 * Tugma (design/system: Button). Matn doim feʼl bilan: «Saqlash», «Kirimni oʻtkazish».
 * Bir ekranda faqat bitta `primary`. `icon` varianti faqat jadval qatorida va `aria-label` bilan.
 * Yuklanishda `disabled` emas, `aria-busy`; ikki marta bosish bloklanadi, kenglik oʻzgarmaydi.
 */
export function Button({ variant = "primary", size = "md", icon, loading = false, className, children, onClick, ...rest }: ButtonProps) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  }

  return (
    <button
      type="button"
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control border font-medium transition-colors duration-150 ease-out select-none",
        "disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-text-disabled disabled:shadow-none",
        (variant === "tertiary" || variant === "icon") && "disabled:border-transparent disabled:bg-transparent",
        sizes[size],
        variant !== "tertiary" && variant !== "icon" && paddings[size],
        variants[variant],
        variant === "icon" && iconSizes[size],
        loading && "cursor-progress",
        className,
      )}
      {...rest}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {icon ? <Icon icon={icon} /> : null}
        {children}
      </span>
      {loading ? <Spinner className="absolute inset-0 m-auto" /> : null}
    </button>
  );
}
