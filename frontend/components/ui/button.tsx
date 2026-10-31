import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "tertiary" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary-button text-white hover:bg-primary-button-hover active:bg-primary-button-hover",
  secondary: "bg-surface text-text-primary border border-border hover:bg-background",
  tertiary: "bg-transparent text-primary-button hover:bg-background",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-control-sm px-3",
  md: "h-control-md px-4",
  lg: "h-control-lg px-4",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

/** Tugma (design/system: Button). Matn doim feʼl bilan: «Saqlash», «Kirimni oʻtkazish». */
export function Button({ variant = "primary", size = "md", icon, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-control text-body font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:bg-background disabled:text-text-disabled disabled:border-border ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
