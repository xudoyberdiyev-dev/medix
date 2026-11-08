"use client";

import { useTranslations } from "next-intl";
import { CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "./button";
import { Icon, type LucideIcon } from "./icon";

export type ToastTone = "success" | "danger" | "warning" | "info";

export interface ToastOptions {
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** ms. Standart 5000; xatolar oʻzi yoʻqolmaydi. */
  duration?: number;
}

export interface ToastItem extends ToastOptions {
  id: number;
}

const MAX_TOASTS = 3;
export const DEFAULT_TOAST_DURATION = 5000;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Bildirishnoma koʻrsatadi. Bir vaqtda koʻpi bilan 3 ta, yangisi tepada. */
export function toast(options: ToastOptions): number {
  const id = nextId++;
  items = [{ ...options, id }, ...items].slice(0, MAX_TOASTS);
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toastStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => items,
  getServerSnapshot: (): ToastItem[] => [],
  /** Faqat testlar uchun. */
  reset() {
    items = [];
    emit();
  },
};

const icons: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: "text-success" },
  danger: { icon: CircleX, className: "text-danger" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  info: { icon: Info, className: "text-info" },
};

function ToastCard({ item }: { item: ToastItem }) {
  const tr = useTranslations("ui");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoDismiss = item.tone !== "danger";
  const duration = item.duration ?? DEFAULT_TOAST_DURATION;

  function start() {
    if (autoDismiss) timer.current = setTimeout(() => dismissToast(item.id), duration);
  }
  function stop() {
    clearTimeout(timer.current);
  }

  useEffect(() => {
    if (autoDismiss) timer.current = setTimeout(() => dismissToast(item.id), duration);
    return () => clearTimeout(timer.current);
  }, [autoDismiss, duration, item.id]);

  const t = icons[item.tone];
  return (
    <div
      role={item.tone === "danger" ? "alert" : "status"}
      onMouseEnter={stop}
      onMouseLeave={start}
      className="pointer-events-auto flex items-start gap-3 rounded-card border border-border bg-surface py-3 pr-3 pl-4 shadow-overlay"
    >
      <Icon icon={t.icon} size="md" className={t.className} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.title}</p>
        {item.description ? <p className="mt-0.5 text-table text-text-secondary">{item.description}</p> : null}
        {item.action ? (
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                item.action?.onClick();
                dismissToast(item.id);
              }}
            >
              {item.action.label}
            </Button>
          </div>
        ) : null}
      </div>
      <Button
        variant="icon"
        size="sm"
        icon={X}
        aria-label={tr("close")}
        title={tr("close")}
        className="-mt-1.5 -mr-1"
        onClick={() => dismissToast(item.id)}
      />
    </div>
  );
}

/** Ilova ildizida bir marta qoʻyiladi: oʻng yuqori burchak, yuqori panel ostida. */
export function Toaster() {
  const list = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, toastStore.getServerSnapshot);
  return (
    <div className="pointer-events-none fixed top-[calc(var(--spacing-topbar)+16px)] right-4 z-50 flex w-toast max-w-[calc(100vw-32px)] flex-col gap-2">
      {list.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
