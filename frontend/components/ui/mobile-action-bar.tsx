"use client";

import type { ReactNode } from "react";
import { useMediaQuery } from "@/lib/use-media-query";

/** Telefon (< 640 px) — `true`. */
export function usePhone(): boolean {
  return useMediaQuery("(max-width: 639px)");
}

/**
 * U12: telefon panellarida pastda qotirilgan asosiy amal paneli (56 px + xavfsiz hudud). Tagidagi kontent yopilmasligi uchun
 * oʻz balandligida boʻsh joy qoldiradi. Faqat telefonda chaqiring (`usePhone()`).
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden className="h-20" />
      <div className="fixed inset-x-0 bottom-0 z-20 flex min-h-14 items-center gap-2 border-t border-border bg-surface px-4 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-overlay [&>button]:h-11 [&>button]:flex-1">
        {children}
      </div>
    </>
  );
}
