"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert, X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Icon } from "./icon";
import { useDialog } from "./use-dialog";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "danger";
  children: ReactNode;
  primaryAction: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean };
  /** Standart: «Ortga» (bekor qilish soʻzi hujjatni bekor qilish bilan adashtirilmasin). */
  secondaryAction?: { label: string; onClick: () => void };
}

const sizes = { sm: "max-w-modal-sm", md: "max-w-modal-md", lg: "max-w-modal-lg" };

/**
 * Oyna (design/system: Modal). Tugmalar oʻngda: «Ortga», keyin asosiy.
 * Xavfli oyna (`tone="danger"`) parda bosilganda yopilmaydi; asosiy tugma `danger`.
 */
export function Modal({ open, onClose, title, size = "md", tone = "default", children, primaryAction, secondaryAction }: ModalProps) {
  const t = useTranslations("ui");
  const ref = useDialog(open, onClose);
  const danger = tone === "danger";

  function onBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget && !danger) onClose();
  }

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClick={onBackdropClick}
      className={cn(
        "m-auto max-h-[calc(100vh-48px)] w-full flex-col rounded-modal bg-surface p-0 text-text-primary shadow-overlay open:flex backdrop:bg-overlay",
        sizes[size],
      )}
    >
      <div className="flex items-start gap-3 pt-5 pr-5 pb-3 pl-6">
        {danger ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
            <Icon icon={TriangleAlert} size="md" />
          </span>
        ) : null}
        <h2 id="modal-title" className="flex-1 pt-[7px] text-subtitle">
          {title}
        </h2>
        <Button variant="icon" icon={X} aria-label={t("close")} title={t("close")} onClick={onClose} />
      </div>
      <div className="overflow-auto px-6 pb-6">{children}</div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
        <Button variant="secondary" autoFocus={danger} onClick={secondaryAction?.onClick ?? onClose}>
          {secondaryAction?.label ?? "Ortga"}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          loading={primaryAction.loading}
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Button>
      </div>
    </dialog>
  );
}

/** Xavfli oyna ichidagi oqibatlar roʻyxati (raqamlar bilan). */
export function Consequences({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 list-disc pl-5">
      {items.map((item, i) => (
        <li key={i} className="mt-1">
          {item}
        </li>
      ))}
    </ul>
  );
}
