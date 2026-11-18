import { cn } from "@/lib/cn";

/**
 * «100+» belgisi (O22, egasi tasdiqlagan yakuniy dizayn): kvadrat ichida `sidebar-active` rangli «+» xoch.
 * Yorugʻ fonda — `brand-900` kvadrat, sidebar (qorongʻi fon)da — shaffof oq kvadrat. Bitta komponent: kirish sahifasi va sidebar.
 */
export function BrandGlyph({ size = 40, onDark = false, className }: { size?: 32 | 40; onDark?: boolean; className?: string }) {
  const icon = size === 40 ? 22 : 18;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-card",
        size === 40 ? "size-[40px]" : "size-[32px]",
        onDark ? "bg-white/10" : "bg-brand-900",
        className,
      )}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24">
        <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" className="fill-sidebar-active" />
      </svg>
    </span>
  );
}

/** Logotip: belgi + «100+» yozuvi. */
export function BrandLogo({ size = 40, className }: { size?: 32 | 40; className?: string }) {
  return (
    <div className={cn("flex items-center gap-[10px]", className)}>
      <BrandGlyph size={size} />
      <span
        className={cn(
          // brand-900 ga deyarli teng, qorongʻi rejimda ham oʻqiladi
          "font-semibold tracking-[-0.5px] text-text-primary",
          size === 40 ? "text-[24px] leading-8" : "text-[17px] leading-6",
        )}
      >
        100+
      </span>
    </div>
  );
}
