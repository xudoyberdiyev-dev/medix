"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Fragment, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Pagination, type PaginationProps } from "./pagination";
import { Checkbox } from "./selection-controls";
import { Skeleton } from "./system-states";

export interface TableColumn<T> {
  key: string;
  title: string;
  align?: "left" | "right";
  width?: number;
  sortable?: boolean;
  /** Hujjat raqami, partiya, STIR, shtrix-kod — JetBrains Mono. */
  mono?: boolean;
  /** Uzun nom (mijoz, korxona) — satrga oʻraladi, jadval tor ustunda gorizontal aylanmaydi. */
  wrap?: boolean;
  /** Gorizontal aylantirishda chapda qoladi (faqat boshidagi ustunlar; `width` majburiy). */
  pinned?: boolean;
  render?: (row: T) => ReactNode;
}

export type SortState = { key: string; dir: "asc" | "desc" };

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Jadvalning ekran oʻquvchi uchun nomi. */
  caption: string;
  density?: "standard" | "compact";
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  /** Kamida bitta qator tanlanganda chiqadigan harakatlar. */
  bulkActions?: ReactNode;
  /** Asboblar paneli (qidiruv, filtr, Excel) — tanlov boʻlmaganda koʻrinadi. */
  toolbar?: ReactNode;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  onRowClick?: (row: T) => void;
  /** Ochilgan (yon panelda) qator — `primary-soft` boʻlib qoladi. */
  activeKey?: string;
  rowActions?: (row: T) => ReactNode;
  totals?: Record<string, ReactNode>;
  loading?: boolean;
  /** Boʻsh, natija yoʻq, xato yoki ruxsat yoʻq holati — `rows` boʻsh boʻlganda koʻrsatiladi. */
  emptyState?: ReactNode;
  pagination?: PaginationProps;
  /** Ochiladigan qatorlar (masalan, mahsulot → partiya × zona): shu qator ostida toʻliq kenglikdagi blok. */
  expandedKeys?: string[];
  renderExpanded?: (row: T) => ReactNode;
}

const SKELETON_ROWS = 8;

function cellValue<T>(row: T, col: TableColumn<T>): ReactNode {
  if (col.render) return col.render(row);
  const v = (row as Record<string, unknown>)[col.key];
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Jadval (design/system: Table) — server tomonida saralash va sahifalash uchun boshqariladigan komponent.
 * Raqamli ustunlar oʻngga (`align: "right"`, tabular), sarlavha yopishib turadi, ↑↓ qatorlar, Enter ochadi, Space tanlaydi.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  density = "standard",
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  bulkActions,
  toolbar,
  sort,
  onSortChange,
  onRowClick,
  activeKey,
  rowActions,
  totals,
  expandedKeys,
  renderExpanded,
  loading = false,
  emptyState,
  pagination,
}: TableProps<T>) {
  const t = useTranslations("ui.table");
  const keys = rows.map(rowKey);
  const selectedOnPage = keys.filter((k) => selectedKeys.includes(k));
  const allSelected = keys.length > 0 && selectedOnPage.length === keys.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;
  const colCount = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  // Yopishqoq ustunlar: chap chegaralar (tanlash ustuni 44px)
  const pinLeft: Record<string, number> = {};
  let lastPinned: string | null = null;
  {
    let left = selectable ? 44 : 0;
    for (const c of columns) {
      if (!c.pinned) break;
      pinLeft[c.key] = left;
      lastPinned = c.key;
      left += c.width ?? 0;
    }
  }
  const anyPinned = lastPinned !== null;
  const pinStyle = (key: string, width?: number): CSSProperties | undefined =>
    key in pinLeft ? { left: pinLeft[key], width, minWidth: width } : width ? { width } : undefined;

  function toggleAll(checked: boolean) {
    if (!onSelectionChange) return;
    const others = selectedKeys.filter((k) => !keys.includes(k));
    onSelectionChange(checked ? [...others, ...keys] : others);
  }

  function toggleRow(key: string) {
    if (!onSelectionChange) return;
    onSelectionChange(selectedKeys.includes(key) ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key]);
  }

  function onSortClick(col: TableColumn<T>) {
    if (!onSortChange) return;
    const dir = sort?.key === col.key && sort.dir === "asc" ? "desc" : "asc";
    onSortChange({ key: col.key, dir });
  }

  function onRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, row: T, key: string) {
    const tr = e.currentTarget;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      (tr.nextElementSibling as HTMLElement | null)?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      (tr.previousElementSibling as HTMLElement | null)?.focus();
    } else if (e.key === "Enter" && onRowClick) {
      e.preventDefault();
      onRowClick(row);
    } else if (e.key === " " && selectable) {
      e.preventDefault();
      toggleRow(key);
    }
  }

  const tdPad = density === "compact" ? "h-row-sm py-px" : "h-row-md py-[3px]";
  const showEmpty = !loading && rows.length === 0;
  const showBulk = selectable && selectedKeys.length > 0;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {showBulk ? (
        <div className="flex h-[57px] items-center gap-2 border-b border-border bg-primary-soft px-4">
          <span className="mr-2 font-semibold">{selectedKeys.length} ta tanlandi</span>
          {bulkActions}
          <button
            type="button"
            onClick={() => onSelectionChange?.([])}
            className="ml-auto rounded-control px-2 text-primary-button hover:bg-surface"
          >
            Tanlovni bekor qilish
          </button>
        </div>
      ) : toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">{toolbar}</div>
      ) : null}

      <div className="relative overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-table" aria-busy={loading || undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selectable ? (
                <th
                  scope="col"
                  className={cn("sticky top-0 z-10 w-11 border-b border-border bg-table-header pr-1 pl-4", anyPinned && "left-0 z-20")}
                >
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    disabled={rows.length === 0}
                    onChange={toggleAll}
                    aria-label={t("selectAll")}
                  />
                </th>
              ) : null}
              {columns.map((col) => {
                const sorted = sort?.key === col.key ? sort.dir : undefined;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    style={pinStyle(col.key, col.width)}
                    className={cn(
                      "sticky top-0 z-10 h-10 border-b border-border bg-table-header px-3 text-caption font-medium whitespace-nowrap text-text-secondary",
                      col.align === "right" ? "text-right" : "text-left",
                      col.key in pinLeft && "z-20",
                      col.key === lastPinned && "border-r",
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onSortClick(col)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm hover:text-text-primary",
                          col.align === "right" && "flex-row-reverse",
                          sorted && "text-text-primary",
                        )}
                      >
                        {col.title}
                        <Icon
                          icon={sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown}
                          width={14}
                          height={14}
                          className={sorted ? "text-primary" : "text-text-disabled"}
                        />
                      </button>
                    ) : (
                      col.title
                    )}
                  </th>
                );
              })}
              {rowActions ? (
                <th scope="col" className="sticky top-0 z-10 w-12 border-b border-border bg-table-header">
                  <span className="sr-only">Harakatlar</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {Array.from({ length: colCount }, (_, j) => (
                      <td key={j} className={cn("border-b border-border px-3", tdPad)}>
                        <Skeleton className={j % 3 === 0 ? "w-3/4" : "w-1/2"} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selectedKeys.includes(key) || key === activeKey;
                  const expanded = renderExpanded && expandedKeys?.includes(key);
                  return (
                    <Fragment key={key}>
                      <tr
                        aria-expanded={renderExpanded ? Boolean(expanded) : undefined}
                        tabIndex={0}
                        aria-selected={selectable ? selectedKeys.includes(key) : undefined}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        onKeyDown={(e) => onRowKeyDown(e, row, key)}
                        className={cn(
                          "group focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                          onRowClick && "cursor-pointer",
                        )}
                      >
                        {selectable ? (
                          <td
                            className={cn(
                              "w-11 border-b border-border pr-1 pl-4",
                              isSelected ? "bg-primary-soft" : "bg-surface group-hover:bg-table-header",
                              anyPinned && "sticky left-0 z-[1]",
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedKeys.includes(key)}
                              onChange={() => toggleRow(key)}
                              aria-label={t("selectRow")}
                              className="min-h-0"
                            />
                          </td>
                        ) : null}
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            style={col.key in pinLeft ? pinStyle(col.key, col.width) : undefined}
                            className={cn(
                              "border-b border-border px-3",
                              col.key in pinLeft && "sticky z-[1]",
                              col.key === lastPinned && "border-r",
                              col.wrap ? "min-w-40 break-words whitespace-normal" : "whitespace-nowrap",
                              tdPad,
                              isSelected ? "bg-primary-soft" : "bg-surface group-hover:bg-table-header",
                              col.align === "right" && "tabular text-right",
                              col.mono && "font-mono text-mono",
                            )}
                          >
                            {cellValue(row, col)}
                          </td>
                        ))}
                        {rowActions ? (
                          <td
                            className={cn(
                              "w-12 border-b border-border px-2 text-right",
                              isSelected ? "bg-primary-soft" : "bg-surface group-hover:bg-table-header",
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {rowActions(row)}
                          </td>
                        ) : null}
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={colCount} className="border-b border-border bg-table-header p-0">
                            {renderExpanded(row)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
            {showEmpty ? (
              <tr>
                <td colSpan={colCount}>{emptyState}</td>
              </tr>
            ) : null}
          </tbody>
          {totals && !loading && rows.length > 0 ? (
            <tfoot>
              <tr>
                {selectable ? <td className="sticky bottom-0 bg-table-header" /> : null}
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn(
                      "sticky bottom-0 h-row-md bg-table-header px-3 font-semibold whitespace-nowrap",
                      col.align === "right" && "tabular text-right",
                    )}
                  >
                    {totals[col.key] ?? (i === 0 ? "Jami" : null)}
                  </td>
                ))}
                {rowActions ? <td className="sticky bottom-0 bg-table-header" /> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {pagination && !showEmpty ? (
        <div className="border-t border-border px-4 py-2">
          <Pagination {...pagination} />
        </div>
      ) : null}
    </div>
  );
}
