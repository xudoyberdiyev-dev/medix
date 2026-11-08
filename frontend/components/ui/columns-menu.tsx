"use client";

import { Check, Columns3, GripVertical, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface ColumnPref {
  key: string;
  visible: boolean;
}

/**
 * Brauzer xotirasidagi ustunlar tartibi va koʻrinishi. Yangi ustunlar oxiriga qoʻshiladi, eskirganlari tashlanadi.
 * Xotira yopiq boʻlsa — standart tartib.
 */
export function mergeColumnPrefs(saved: unknown, keys: readonly string[]): ColumnPref[] {
  const known = Array.isArray(saved)
    ? saved.filter(
        (c): c is ColumnPref =>
          typeof c === "object" && c !== null && keys.includes((c as ColumnPref).key) && typeof (c as ColumnPref).visible === "boolean",
      )
    : [];
  const out = known.filter((c, i) => known.findIndex((x) => x.key === c.key) === i);
  for (const k of keys) if (!out.some((c) => c.key === k)) out.push({ key: k, visible: true });
  return out;
}

/** Ustunni `from` oʻrnidan `to` oʻrniga koʻchirish. */
export function moveColumn(cols: ColumnPref[], from: number, to: number): ColumnPref[] {
  if (from === to || from < 0 || to < 0 || from >= cols.length || to >= cols.length) return cols;
  const next = [...cols];
  const [c] = next.splice(from, 1);
  next.splice(to, 0, c);
  return next;
}

export function useColumnPrefs(storageKey: string, keys: readonly string[]) {
  const [cols, setCols] = useState<ColumnPref[]>(() => keys.map((key) => ({ key, visible: true })));
  const keysRef = useRef(keys);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCols(mergeColumnPrefs(JSON.parse(raw), keysRef.current));
    } catch {
      /* xotira yopiq — standart ustunlar */
    }
  }, [storageKey]);
  const update = (next: ColumnPref[]) => {
    setCols(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* saqlanmasa ham ishlaydi */
    }
  };
  const reset = () => {
    setCols(keysRef.current.map((key) => ({ key, visible: true })));
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* — */
    }
  };
  return { cols, update, reset };
}

/** Prototip `FilterBar` → «Ustunlar»: koʻrinish (belgi) va tartib (sudrab), «Standartga qaytarish». Kamida bitta ustun qoladi. */
export function ColumnsMenu({
  label,
  hint,
  resetLabel,
  columns,
  labels,
  onChange,
  onReset,
}: {
  label: string;
  hint: string;
  resetLabel: string;
  columns: ColumnPref[];
  labels: Record<string, string>;
  onChange: (cols: ColumnPref[]) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const visible = columns.filter((c) => c.visible).length;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-control-md items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-[13px] font-medium hover:bg-table-header"
      >
        <Columns3 size={16} strokeWidth={1.5} className="text-text-secondary" aria-hidden />
        {label}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-10 right-0 z-50 max-h-[460px] w-[250px] overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-overlay">
            <div className="px-2.5 pt-2 pb-1.5 text-caption text-text-disabled">{hint}</div>
            {columns.map((c, i) => (
              <div
                key={c.key}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(i);
                }}
                onDrop={() => {
                  if (drag !== null) onChange(moveColumn(columns, drag, i));
                  setDrag(null);
                  setOver(null);
                }}
                onDragEnd={() => (setDrag(null), setOver(null))}
                className={cn(
                  "flex h-[34px] items-center gap-2 rounded-[6px] border-t-2 pr-1.5 pl-1",
                  over === i && drag !== null && drag !== i ? "border-primary" : "border-transparent",
                  drag === i ? "bg-table-header" : "",
                )}
              >
                <span className="flex cursor-grab text-text-disabled" aria-hidden>
                  <GripVertical size={16} strokeWidth={1.5} />
                </span>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={c.visible}
                  onClick={() => onChange(columns.map((x, j) => (j === i ? { ...x, visible: !x.visible || visible === 1 } : x)))}
                  className="flex h-[30px] flex-1 items-center gap-2 text-left text-[13px]"
                >
                  <span
                    className={cn(
                      "flex size-4 flex-none items-center justify-center rounded-[4px] border text-white",
                      c.visible ? "border-primary-button bg-primary-button" : "border-text-disabled bg-surface",
                    )}
                  >
                    {c.visible ? <Check size={12} strokeWidth={2} aria-hidden /> : null}
                  </span>
                  {labels[c.key] ?? c.key}
                </button>
              </div>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                onClick={onReset}
                className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13px] font-medium text-primary-button hover:bg-table-header"
              >
                <RotateCcw size={16} strokeWidth={1.5} aria-hidden />
                {resetLabel}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
