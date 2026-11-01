"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { cloneElement } from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  content: string;
  placement?: "top" | "right" | "bottom" | "left";
  /** Nishon element (tugma, ikonka). `aria-describedby` unga qoʻshiladi. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

const SHOW_DELAY_MS = 400;

const placements = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

/** Qisqa izoh: hover yoki fokusda ~400ms dan keyin chiqadi, Esc yopadi. Ichida tugma/havola boʻlmaydi. */
export function Tooltip({ content, placement = "top", children }: TooltipProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function show() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  }
  function hide() {
    clearTimeout(timer.current);
    setVisible(false);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
    >
      {cloneElement(children, { "aria-describedby": id })}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-40 w-max max-w-tooltip rounded-control bg-text-primary px-2 py-1 text-caption text-white",
          placements[placement],
          visible ? "visible" : "invisible",
        )}
      >
        {content}
      </span>
    </span>
  );
}
