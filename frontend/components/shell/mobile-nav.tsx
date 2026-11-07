"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type MouseEvent } from "react";
import { useDialog } from "@/components/ui/use-dialog";
import { SidebarContent } from "./sidebar";

/** Telefonda (<768 px) asosiy menyu: yuqori paneldagi tugma — chapdan ochiladigan sidebar (Esc, fon bosilsa yopiladi). */
export function MobileNav() {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={t("openMenu")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="-ml-2 flex size-control-lg shrink-0 items-center justify-center rounded-control hover:bg-background md:hidden print:hidden"
      >
        <Menu size={20} strokeWidth={1.5} aria-hidden />
      </button>
      {open ? <MobileNavSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MobileNavSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations("shell");
  const ref = useDialog(true, onClose);

  function onBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-label={t("mainMenu")}
      onClick={onBackdropClick}
      className="my-0 mr-auto ml-0 h-full max-h-none w-sidebar max-w-[85vw] flex-col bg-brand-900 p-0 text-sidebar-text shadow-overlay open:flex backdrop:bg-overlay md:hidden"
    >
      <button
        type="button"
        aria-label={t("closeMenu")}
        onClick={onClose}
        className="absolute top-2 right-2 flex size-control-lg items-center justify-center rounded-control hover:bg-sidebar-item-active-bg hover:text-white"
      >
        <X size={20} strokeWidth={1.5} aria-hidden />
      </button>
      <SidebarContent variant="sheet" onNavigate={onClose} />
    </dialog>
  );
}
