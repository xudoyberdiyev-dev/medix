"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useCallback, useState } from "react";
import { CommandPalette, useCommandPaletteHotkey } from "./command-palette";

/** TopBar qidiruv maydoni (prototip: «Mahsulot, mijoz yoki hujjat raqami…», Ctrl K): bosilganda yoki Ctrl+K — universal qidiruv oynasi. */
export function SearchButton() {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  useCommandPaletteHotkey(show);
  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-keyshortcuts="Control+K"
        className="flex size-control-md items-center justify-center gap-2 rounded-control text-text-secondary hover:bg-background md:w-64 md:justify-start md:border md:border-border md:bg-background md:px-3 md:text-text-disabled md:hover:border-text-disabled lg:w-[360px]"
      >
        <Search size={16} strokeWidth={1.5} aria-hidden />
        <span className="sr-only">{t("search")}</span>
        <span aria-hidden className="truncate text-table max-md:hidden">
          {t("searchPlaceholder")}
        </span>
        <span aria-hidden className="ml-auto flex gap-1 max-md:hidden">
          <kbd className="rounded-sm border border-border bg-surface px-1.5 text-caption text-text-secondary">Ctrl</kbd>
          <kbd className="rounded-sm border border-border bg-surface px-1.5 text-caption text-text-secondary">K</kbd>
        </span>
      </button>
      <CommandPalette open={open} onClose={hide} />
    </>
  );
}
