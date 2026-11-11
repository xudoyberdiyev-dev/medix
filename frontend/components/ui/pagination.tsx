"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { formatQuantity } from "@/lib/format";

export type PageSize = 20 | 25 | 50 | 100;

export interface PaginationProps {
  /** 1 dan boshlanadi. */
  page: number;
  pageSize: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  pageSizeOptions?: PageSize[];
}

/** Sahifa raqamlari: 7 dan ortiq boʻlsa oʻrtasi «…» bilan qisqaradi. */
export function pageItems(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "gap", pageCount];
  if (page >= pageCount - 3) return [1, "gap", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, "gap", page - 1, page, page + 1, "gap", pageCount];
}

/** «1–50 / 1.240» */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return "0 / 0";
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `${formatQuantity(from)}–${formatQuantity(to)} / ${formatQuantity(total)}`;
}

/**
 * Sahifalash (prototip Pagination): chapda «1–25 / 240», oʻngda «Qatorlar: 25» tanlagichi, oldingi/keyingi va sahifa raqamlari
 * (bitta sahifa boʻlsa ham koʻrinadi).
 */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [25, 50, 100] }: PaginationProps) {
  const sizeId = useId();
  const t = useTranslations("ui.pagination");
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const arrow =
    "flex size-[30px] items-center justify-center rounded-control border border-border bg-surface hover:bg-background disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-surface";
  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center justify-between gap-3 text-table text-text-secondary">
      <span className="tabular">{rangeLabel(page, pageSize, total)}</span>
      <div className="flex flex-wrap items-center gap-4">
        <span className="relative flex h-[30px] items-center gap-1 rounded-control border border-border bg-surface pr-6 pl-2 hover:bg-background">
          <label htmlFor={sizeId}>{t("perPage")}</label>
          <select
            id={sizeId}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            className="tabular cursor-pointer appearance-none bg-transparent font-medium text-text-primary outline-none"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute right-2" />
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className={arrow}
            aria-label={t("prev")}
            title={t("prev")}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          </button>
          {pageItems(page, pageCount).map((item, i) =>
            item === "gap" ? (
              <span key={`gap-${i}`} className="px-1" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={cn(
                  "tabular h-[30px] min-w-[30px] rounded-control px-1.5 transition-colors duration-150 ease-out",
                  item === page ? "bg-primary-soft font-semibold text-primary-button" : "text-text-primary hover:bg-background",
                )}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={arrow}
            aria-label={t("next")}
            title={t("next")}
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </span>
      </div>
    </nav>
  );
}
