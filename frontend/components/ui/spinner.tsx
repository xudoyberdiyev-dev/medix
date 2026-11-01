import { cn } from "@/lib/cn";

/** Aylanuvchi belgi — faqat tugma ichida (butun ekranni yopadigan spinner yoʻq). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}
