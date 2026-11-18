"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Icon, type LucideIcon } from "./icon";

export interface TabItem {
  key: string;
  label: string;
  /** U2: telefonda (sm dan kichik) koʻrsatiladigan qisqa matn; toʻliq matn — kirish nomi (aria-label). */
  short?: string;
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

/**
 * Chiziqli tablar — bitta yozuvning boʻlimlari orasida (sahifa navigatsiyasi uchun emas).
 * U2: sigʻmasa gorizontal aylanadi, chetlarida soya (fade) koʻrinadi, faol tab avtomatik koʻrinish maydoniga suriladi.
 */
export function Tabs({ items, value, onChange, ...aria }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = items.filter((t) => !t.disabled);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [measure, items.length]);

  useEffect(() => {
    const el = listRef.current;
    const tab = el?.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(value)}"]`);
    if (!el || !tab) return;
    const start = tab.offsetLeft - el.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < el.scrollLeft) el.scrollLeft = Math.max(0, start - 24);
    else if (end > el.scrollLeft + el.clientWidth) el.scrollLeft = end - el.clientWidth + 24;
    measure();
  }, [value, measure]);

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
    <div className="relative">
      <div
        ref={listRef}
        role="tablist"
        aria-label={aria["aria-label"]}
        onKeyDown={onKeyDown}
        onScroll={measure}
        style={fadeMask(edges.left, edges.right)}
        className="relative flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
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
              aria-label={t.short ? t.label : undefined}
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
              {t.short ? (
                <>
                  <span className="sm:hidden">{t.short}</span>
                  <span className="max-sm:hidden">{t.label}</span>
                </>
              ) : (
                t.label
              )}
              {t.count !== undefined ? (
                <span
                  className={cn(
                    "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption font-medium",
                    selected ? "bg-primary-soft text-link" : "bg-background text-text-secondary",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
              {t.alert ? (
                <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-caption font-medium text-on-solid">
                  {t.alert}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Chetdagi soya: fon rangidan qatʼi nazar — mask bilan (sigʻmagan tomonda 24 px yoʻqoladi). */
function fadeMask(left: boolean, right: boolean): CSSProperties | undefined {
  if (!left && !right) return undefined;
  const mask = `linear-gradient(to right, ${left ? "transparent 0, black 24px" : "black 0"}, ${right ? "black calc(100% - 24px), transparent 100%" : "black 100%"})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
