import type { LucideIcon, LucideProps } from "lucide-react";

export type { LucideIcon };

/**
 * Lucide ikonka — dizayn tizimi qoidasi bilan: stroke 1.5, `currentColor`, 16px (sm) yoki 20px (md).
 * Shartnomada `icon` — Lucide nomi; Reactda tree-shaking uchun komponentning o'zi uzatiladi.
 */
export function Icon({ icon: Glyph, size = "sm", ...rest }: { icon: LucideIcon; size?: "sm" | "md" } & Omit<LucideProps, "size">) {
  return <Glyph size={size === "sm" ? 16 : 20} strokeWidth={1.5} aria-hidden {...rest} />;
}
