"use client";

import { Ellipsis, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

export interface RowMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

/**
 * Jadval qatori menyusi («…»). Menyu `fixed` — jadvalning aylanadigan konteyneri uni kesmaydi.
 * Esc va tashqariga bosish yopadi.
 */
export function RowMenu({
  items,
  label = "Amallar",
  trigger,
}: {
  items: RowMenuItem[];
  label?: string;
  /** Matnli tugma (masalan, sarlavhada «Chop etish»): ikonka va matn; berilmasa — «…». */
  trigger?: { icon: LucideIcon; text: string };
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      setPos(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  return (
    <span ref={ref} className="inline-flex">
      <Button
        variant={trigger ? "secondary" : "icon"}
        size={trigger ? undefined : "sm"}
        icon={trigger ? trigger.icon : Ellipsis}
        aria-label={trigger ? undefined : label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { top: r.bottom + 4, right: window.innerWidth - r.right });
        }}
      >
        {trigger ? trigger.text : null}
      </Button>
      {pos ? (
        <span
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-40 flex w-60 flex-col rounded-card border border-border bg-surface p-1 text-left shadow-overlay"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setPos(null);
                item.onSelect();
              }}
              className="flex h-control-sm items-center gap-2 rounded-control px-2 text-body hover:bg-table-header focus-visible:bg-table-header"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
