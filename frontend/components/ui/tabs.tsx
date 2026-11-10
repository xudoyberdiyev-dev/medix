"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Icon, type LucideIcon } from "./icon";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  /** Qizil hisoblagich (masalan, kechikkanlar) — 0 boʻlsa koʻrinmaydi. */
  alert?: number;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  "aria-label"?: string;
}

/** Chiziqli tablar — bitta yozuvning boʻlimlari orasida (sahifa navigatsiyasi uchun emas). */
export function Tabs({ items, value, onChange, ...aria }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = items.filter((t) => !t.disabled);

  function focusTab(key: string) {
    onChange(key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const i = enabled.findIndex((t) => t.key === value);
    let next: TabItem | undefined;
    if (e.key === "ArrowRight") next = enabled[(i + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next) {
      e.preventDefault();
      focusTab(next.key);
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
    >
      {items.map((t) => {
        const selected = t.key === value;
        return (
          <button
            key={t.key}
            data-key={t.key}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.key)}
            className={cn(
              "-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 font-medium whitespace-nowrap transition-colors duration-150 ease-out",
              selected
                ? "border-primary text-text-primary"
                : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
              t.disabled && "cursor-not-allowed text-text-disabled hover:border-transparent hover:text-text-disabled",
            )}
          >
            {t.icon ? <Icon icon={t.icon} size="sm" /> : null}
            {t.label}
            {t.count !== undefined ? (
              <span
                className={cn(
                  "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption font-medium",
                  selected ? "bg-primary-soft text-primary-button" : "bg-background text-text-secondary",
                )}
              >
                {t.count}
              </span>
            ) : null}
            {t.alert ? (
              <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-caption font-medium text-white">
                {t.alert}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
