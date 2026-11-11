"use client";

import { Boxes } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ColumnPref } from "@/components/ui/columns-menu";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { BATCH_SORT_COLUMNS, OVERVIEW_PAGE_SIZES, type OverviewFilters, type StockFlag } from "./overview-state";
import { ExpiryCell, Flags, day } from "./stock-cells";

type BatchRow = components["schemas"]["BatchStockRow"];
type BatchPage = components["schemas"]["BatchStockPage"];

/** Prototip `Stock` → BCOLS tartibida («Ustunlar» menyusi shu kalitlar bilan). Tannarx ustunlari ruxsatsizga koʻrinmaydi. */
export const BATCH_COLUMN_KEYS = [
  "code",
  "name",
  "maker",
  "branch",
  "wh",
  "zone",
  "batch",
  "mfg",
  "exp",
  "qty",
  "res",
  "avail",
  "cost",
  "costSum",
  "saleSum",
  "doc",
  "docDate",
  "supplier",
  "flags",
] as const;
export type BatchColumnKey = (typeof BATCH_COLUMN_KEYS)[number];
export const BATCH_COST_KEYS: readonly BatchColumnKey[] = ["cost", "costSum"];

const WIDTH: Record<BatchColumnKey, number> = {
  code: 104,
  name: 240,
  maker: 150,
  branch: 80,
  wh: 170,
  zone: 160,
  batch: 130,
  mfg: 130,
  exp: 190,
  qty: 90,
  res: 80,
  avail: 90,
  cost: 110,
  costSum: 150,
  saleSum: 160,
  doc: 160,
  docDate: 116,
  supplier: 200,
  flags: 110,
};
const RIGHT: readonly BatchColumnKey[] = ["qty", "res", "avail", "cost", "costSum", "saleSum"];

export function batchColumnLabels(t: (k: string) => string): Record<BatchColumnKey, string> {
  const key: Record<BatchColumnKey, string> = {
    code: "code",
    name: "name",
    maker: "maker",
    branch: "branch",
    wh: "wh",
    zone: "zone",
    batch: "batch",
    mfg: "mfg",
    exp: "exp",
    qty: "qty",
    res: "reserved",
    avail: "available",
    cost: "cost",
    costSum: "costSum",
    saleSum: "saleSum",
    doc: "doc",
    docDate: "docDate",
    supplier: "supplier",
    flags: "flags",
  };
  return Object.fromEntries(BATCH_COLUMN_KEYS.map((k) => [k, t(`ov.c.${key[k]}`)])) as Record<BatchColumnKey, string>;
}

const dash = <span className="text-text-secondary">—</span>;

/**
 * Qoldiqlar → «Partiya boʻyicha» (prototip `Stock`, BCOLS): zona × partiya qatorlari — filtrlar mahsulot koʻrinishi bilan
 * umumiy, ustunlar «Ustunlar» menyusidan, jami qatori (soni, band, mavjud, tannarx, sotuv summasi), qator → partiya paneli.
 */
export function StockBatches({
  f,
  data,
  loading,
  error,
  onRetry,
  cols,
  apply,
  onOpen,
  onClearFilters,
  filtered,
}: {
  f: OverviewFilters;
  data: BatchPage | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  cols: ColumnPref[];
  apply: (patch: Partial<OverviewFilters>) => void;
  onOpen: (batchId: number, zoneId: number) => void;
  onClearFilters: () => void;
  filtered: boolean;
}) {
  const t = useTranslations("stock");
  if (error) return <ErrorState onRetry={onRetry} />;
  const showCost = data ? data.costSum != null : false;
  const labels = batchColumnLabels((k) => t(k as Parameters<typeof t>[0]));
  const cell = (r: BatchRow, k: BatchColumnKey) => {
    switch (k) {
      case "code":
        return r.productCode;
      case "name":
        return (
          <span className="block max-w-[240px] truncate font-medium" title={r.productName}>
            {r.productName}
          </span>
        );
      case "maker":
        return r.manufacturer ?? dash;
      case "branch":
        return <span className="font-mono text-mono text-text-secondary">{r.branchCode}</span>;
      case "wh":
        return r.warehouse;
      case "zone":
        return (
          <span title={r.sellable ? t("sellable") : t("notSellable")}>
            <Badge tone={r.zoneType === "QUARANTINE" ? "warning" : r.zoneType === "COLD" ? "info" : "neutral"}>{r.zone}</Badge>
          </span>
        );
      case "batch":
        return <span className="font-mono text-mono">{r.batchNumber}</span>;
      case "mfg":
        return r.producedOn ? day(r.producedOn) : dash;
      case "exp":
        return <ExpiryCell date={r.expiryDate} days={r.daysLeft} />;
      case "qty":
        return <span className="font-medium">{formatQuantity(r.qty)}</span>;
      case "res":
        return <span className={cn(!r.reserved && "text-text-secondary")}>{formatQuantity(r.reserved)}</span>;
      case "avail":
        return <span className={cn("font-medium", !r.available && "text-text-secondary")}>{formatQuantity(r.available)}</span>;
      case "cost":
        return <span className="text-text-secondary">{r.cost ? formatMoney(r.cost) : ""}</span>;
      case "costSum":
        return r.costSum ? formatMoney(r.costSum) : "";
      case "saleSum":
        return Number(r.saleSum) ? formatMoney(r.saleSum) : <span className="text-text-secondary">{formatMoney(r.saleSum)}</span>;
      case "doc":
        return r.receiptId ? (
          <Link href={`/receipts/${r.receiptId}`} className="font-mono text-mono text-primary hover:underline">
            {r.receiptNumber}
          </Link>
        ) : (
          <span className="text-text-secondary">{t("ov.opening")}</span>
        );
      case "docDate":
        return r.receiptDate ? day(r.receiptDate) : dash;
      case "supplier":
        return r.supplier ?? dash;
      case "flags":
        return (
          <Flags
            flags={[r.marked && "MARKED", r.controlled && "CONTROLLED", r.prescription && "PRESCRIPTION", r.bonus && "BONUS"].filter(
              (x): x is StockFlag => Boolean(x),
            )}
          />
        );
    }
  };
  const sortable = Object.keys(BATCH_SORT_COLUMNS);
  const columns: TableColumn<BatchRow>[] = cols
    .filter((c) => c.visible && (showCost || !BATCH_COST_KEYS.includes(c.key as BatchColumnKey)))
    .map((c) => {
      const k = c.key as BatchColumnKey;
      return {
        key: k,
        title: labels[k],
        width: WIDTH[k],
        align: RIGHT.includes(k) ? ("right" as const) : ("left" as const),
        mono: k === "code",
        sortable: sortable.includes(k),
        render: (r: BatchRow) => cell(r, k),
      };
    });
  const sortKey = Object.entries(BATCH_SORT_COLUMNS).find(([, v]) => v === (f.bsort ?? "EXPIRY"))?.[0] ?? "exp";
  const firstKey = columns[0]?.key;
  return (
    <Table
      caption={t("titleStock")}
      columns={columns}
      rows={data?.items ?? []}
      rowKey={(r) => `${r.zoneId}:${r.batchId}`}
      loading={loading}
      sort={{ key: sortKey, dir: f.desc ? "desc" : "asc" }}
      onSortChange={(x) => apply({ bsort: BATCH_SORT_COLUMNS[x.key] ?? null, desc: x.dir === "desc" })}
      onRowClick={(r) => onOpen(r.batchId, r.zoneId)}
      totals={
        data && data.total > 0
          ? {
              ...(firstKey ? { [firstKey]: t("ov.total") } : {}),
              qty: <b className="font-semibold">{formatQuantity(data.totalQty)}</b>,
              res: formatQuantity(data.reservedQty),
              avail: <b className="font-semibold">{formatQuantity(data.availableQty)}</b>,
              ...(data.costSum ? { costSum: formatMoney(data.costSum) } : {}),
              saleSum: formatMoney(data.saleSum),
            }
          : undefined
      }
      emptyState={
        filtered ? (
          <NoResultsState onClearFilters={onClearFilters} />
        ) : (
          <EmptyState icon={Boxes} title={t("emptyStock")} description={t("emptyStockHint")} />
        )
      }
      pagination={
        data && data.total > 0
          ? {
              page: f.page,
              pageSize: f.size,
              pageSizeOptions: [...OVERVIEW_PAGE_SIZES],
              total: data.total,
              onPageChange: (n) => apply({ page: n }),
              onPageSizeChange: (n) => apply({ size: n === 50 || n === 100 ? n : 25 }),
            }
          : undefined
      }
    />
  );
}
