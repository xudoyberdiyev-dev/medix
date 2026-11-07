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
        className="flex h-control-md w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 text-text-disabled hover:border-text-disabled"
      >
        <Search size={16} strokeWidth={1.5} aria-hidden />
        <span>{t("search")}</span>
        <kbd className="ml-auto rounded-sm border border-border px-1.5 text-caption text-text-secondary">Ctrl K</kbd>
      </button>
      <CommandPalette open={open} onClose={hide} />
    </>
  );
}
