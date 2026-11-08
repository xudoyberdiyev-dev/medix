"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DocumentHeaderProps {
  /** Ota sahifa (non-krosh), masalan «Buyurtmalar» → `/orders`. */
  parent: { label: string; href: string };
  /** Non-kroshdagi oxirgi boʻgʻin: hujjat raqami (mono) yoki «Yangi buyurtma». */
  crumb: string;
  crumbMono?: boolean;
  title: string;
  /** Sarlavha yonidagi raqam (mono). */
  number?: string;
  status?: ReactNode;
  /** Sarlavha ostidagi qisqa maʼlumot: mijoz · yetkazish · sana. */
  sub?: ReactNode;
  /** Oʻngdagi qism: bosqichlar, avtosaqlash belgisi. */
  meta?: ReactNode;
  /** Oʻngdagi harakatlar (asosiy tugma eng oʻngda). */
  actions?: ReactNode;
  className?: string;
}

/** Hujjat sahifasi sarlavhasi (prototip `DocumentHeader`): non-krosh, sarlavha + raqam + holat, oʻngda harakatlar. */
export function DocumentHeader({ parent, crumb, crumbMono, title, number, status, sub, meta, actions, className }: DocumentHeaderProps) {
  return (
    <header
      className={cn(
        "-mx-6 -mt-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-border bg-surface px-6 py-5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <nav aria-label={parent.label} className="flex items-center gap-1.5 text-caption">
          <Link href={parent.href} className="text-primary hover:underline">
            {parent.label}
          </Link>
          <span className="text-text-disabled" aria-hidden>
            /
          </span>
          <span className={cn("text-text-secondary", crumbMono && "font-mono")} aria-current="page">
            {crumb}
          </span>
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">{title}</h1>
          {number ? <span className="font-mono text-body leading-7 text-text-secondary">{number}</span> : null}
          {status}
        </div>
        {sub ? <div className="flex flex-wrap items-center gap-1.5 text-[13px] leading-[18px] text-text-secondary">{sub}</div> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-4">
        {meta ? <div className="flex flex-col items-end gap-1">{meta}</div> : null}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
