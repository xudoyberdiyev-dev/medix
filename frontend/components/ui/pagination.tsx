"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { formatQuantity } from "@/lib/format";
import { Button } from "./button";

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

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [25, 50, 100] }: PaginationProps) {
  const sizeId = useId();
  const t = useTranslations("ui.pagination");
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center gap-4 text-table text-text-secondary">
      <span className="tabular">{rangeLabel(page, pageSize, total)}</span>
      <span className="flex items-center gap-2">
        <label htmlFor={sizeId}>{t("perPage")}</label>
        <select
          id={sizeId}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          className="h-control-sm rounded-control border border-border bg-surface px-2 text-text-primary hover:border-text-disabled"
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </span>
      {pageCount > 1 ? (
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="icon"
            size="sm"
            icon={ChevronLeft}
            aria-label={t("prev")}
            title={t("prev")}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          />
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
                  "tabular h-control-sm min-w-8 rounded-control px-2",
                  item === page ? "bg-primary-soft font-medium text-primary-button" : "text-text-primary hover:bg-background",
                )}
              >
                {item}
              </button>
            ),
          )}
          <Button
            variant="icon"
            size="sm"
            icon={ChevronRight}
            aria-label={t("next")}
            title={t("next")}
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          />
        </span>
      ) : null}
    </nav>
  );
}
