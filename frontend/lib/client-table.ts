import { useMemo, useState } from "react";
import type { PageSize, PaginationProps } from "@/components/ui/pagination";
import type { SortState } from "@/components/ui/table";

/** Saralanadigan qiymat: pul/son satr koʻrinishida ham keladi ("1250000.00") — oʻnli kasr sifatida aniq solishtiriladi. */
export type SortValue = string | number | null | undefined;

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Oʻnli satrni butun songa (100 dan bir ulushda emas — 6 xona aniqlikda) aylantiradi: float ishlatilmaydi. */
function scaled(v: string): bigint {
  const neg = v.startsWith("-");
  const [int, frac = ""] = (neg ? v.slice(1) : v).split(".");
  const n = BigInt(int + frac.padEnd(6, "0").slice(0, 6));
  return neg ? -n : n;
}

/** Ikki qiymatni solishtirish: boʻsh qiymatlar doim oxirida; sonlar va oʻnli satrlar — son sifatida; matn — oʻzbekcha alifbo. */
export function compareValues(a: SortValue, b: SortValue): number {
  const ea = a === null || a === undefined || a === "";
  const eb = b === null || b === undefined || b === "";
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  if (DECIMAL.test(sa) && DECIMAL.test(sb)) {
    const d = scaled(sa) - scaled(sb);
    return d === 0n ? 0 : d > 0n ? 1 : -1;
  }
  return sa.localeCompare(sb, "uz", { sensitivity: "base", numeric: true });
}

/** Barqaror saralash; boʻsh qiymatlar yoʻnalishdan qatʼi nazar oxirida. */
export function sortRows<T>(rows: readonly T[], sort: SortState | undefined, value: (row: T, key: string) => SortValue): T[] {
  if (!sort) return [...rows];
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row, sort.key) }))
    .sort((x, y) => {
      const ex = x.v === null || x.v === undefined || x.v === "";
      const ey = y.v === null || y.v === undefined || y.v === "";
      if (ex !== ey) return ex ? 1 : -1;
      return sign * compareValues(x.v, y.v) || x.i - y.i;
    })
    .map((x) => x.row);
}

export function rowField<T>(row: T, key: string): SortValue {
  const v = (row as Record<string, unknown>)[key];
  return typeof v === "string" || typeof v === "number" ? v : null;
}

/**
 * Brauzerdagi jadval (hisobotlar, panellar — maʼlumot bir soʻrovda keladi): ustun boʻyicha saralash va sahifalash
 * (T12-audit №17). Qator 25 tadan oshmasa sahifalash koʻrsatilmaydi. Qiymat standart holatda — ustun kaliti nomidagi maydon.
 */
export function useClientTable<T>(
  rows: readonly T[],
  opts: { initialSort?: SortState; value?: (row: T, key: string) => SortValue } = {},
): { rows: T[]; sort: SortState | undefined; onSortChange: (s: SortState) => void; pagination: PaginationProps | undefined } {
  const [sort, setSort] = useState<SortState | undefined>(opts.initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const value = opts.value ?? rowField;
  const sorted = useMemo(() => sortRows(rows, sort, value), [rows, sort, value]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount);
  const paged = sorted.length > 25 ? sorted.slice((current - 1) * pageSize, current * pageSize) : sorted;
  return {
    rows: paged,
    sort,
    onSortChange: (s) => {
      setSort(s);
      setPage(1);
    },
    pagination:
      sorted.length > 25
        ? {
            page: current,
            pageSize,
            total: sorted.length,
            onPageChange: setPage,
            onPageSizeChange: (s) => {
              setPageSize(s);
              setPage(1);
            },
          }
        : undefined,
  };
}
