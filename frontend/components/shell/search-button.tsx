"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useCallback, useState } from "react";
import { CommandPalette, useCommandPaletteHotkey } from "./command-palette";

/** TopBar qidiruv maydoni: bosilganda yoki Ctrl+K — universal qidiruv oynasi. */
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
        className="flex size-control-md items-center justify-center gap-2 rounded-control text-text-secondary hover:bg-background md:w-56 md:justify-start md:border md:border-border md:bg-surface md:px-3 md:text-text-disabled md:hover:border-text-disabled md:hover:bg-surface lg:w-72"
      >
        <Search size={16} strokeWidth={1.5} aria-hidden />
        <span className="max-md:sr-only">{t("search")}</span>
        <kbd className="ml-auto rounded-sm border border-border px-1.5 text-caption text-text-secondary max-md:hidden">Ctrl K</kbd>
      </button>
      <CommandPalette open={open} onClose={hide} />
    </>
  );
}
