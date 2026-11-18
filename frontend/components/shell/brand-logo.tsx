import { cn } from "@/lib/cn";

/**
 * «100+» belgisi (O22, egasi tasdiqlagan yakuniy dizayn): brand-900 kvadrat (radius 8) ichida sidebar-active rangli «+» xoch.
 * Sidebar va kirish sahifalarida bir xil komponent; `onDark` — toʻq (sidebar) fon ustida, kvadrat yorugʻroq foni bilan ajraladi.
 */
export function BrandSquare({ size = 40, onDark = false }: { size?: 32 | 40; onDark?: boolean }) {
  const icon = size === 40 ? 22 : 18;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-card",
        size === 40 ? "size-[40px]" : "size-8",
        onDark ? "bg-sidebar-item-active-bg" : "bg-brand-900",
      )}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" className="text-sidebar-active">
        <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" />
      </svg>
    </span>
  );
}
