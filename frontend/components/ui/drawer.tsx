"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Tabs, type TabsProps } from "./tabs";
import { useDialog } from "./use-dialog";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  size?: "sm" | "lg";
  /** Kichik turi, masalan «Partiya». */
  kind?: string;
  title: string;
  /** Raqami (mono). */
  subtitle?: string;
  status?: ReactNode;
  tabs?: TabsProps;
  children: ReactNode;
  /** Pastda doim koʻrinadigan harakatlar (asosiy oʻngda). */
  actions?: ReactNode;
}

/** Yon panel (design/system: Drawer) — jadvaldan chiqmasdan yozuvni koʻrish/tahrirlash, oʻngdan ochiladi. */
export function Drawer({ open, onClose, size = "sm", kind, title, subtitle, status, tabs, children, actions }: DrawerProps) {
  const t = useTranslations("ui");
  const ref = useDialog(open, onClose);

  function onBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="drawer-title"
      onClick={onBackdropClick}
      className={cn(
        "my-0 mr-0 ml-auto h-full max-h-none w-full max-w-full flex-col border-l border-border bg-surface p-0 text-text-primary shadow-overlay open:flex backdrop:bg-overlay",
        size === "sm" ? "sm:w-drawer-sm" : "sm:w-drawer-lg",
      )}
    >
      <div className="flex items-start gap-3 border-b border-border py-4 pr-4 pl-6">
        <div className="min-w-0 flex-1">
          {kind ? <p className="text-caption text-text-secondary">{kind}</p> : null}
          <h2 id="drawer-title" className="text-subtitle">
            {title}
          </h2>
          {subtitle || status ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {subtitle ? <span className="font-mono text-mono text-text-secondary">{subtitle}</span> : null}
              {status}
            </div>
          ) : null}
        </div>
        <Button variant="icon" icon={X} aria-label={t("close")} title={t("close")} onClick={onClose} />
      </div>
      {tabs ? (
        <div className="px-6">
          <Tabs {...tabs} />
        </div>
      ) : null}
      <div className="flex-1 overflow-auto p-6">{children}</div>
      {actions ? <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{actions}</div> : null}
    </dialog>
  );
}
