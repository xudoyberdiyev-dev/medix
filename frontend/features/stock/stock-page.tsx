"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Boxes, CalendarClock, CircleAlert, Clock, Download, Lock, ShoppingCart } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/card";
import { SavedViews } from "@/components/ui/saved-views";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useWarehouses } from "@/features/organization/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import {
  STOCK_SORT_COLUMNS,
  parseStockFilters,
  serializeStockFilters,
  stockSortColumn,
  type StockFilters,
  type StockSort,
} from "./url-state";

type StockRow = components["schemas"]["StockRow"];

/** Yaroqlilik holati: oʻtgan / 90 kun ichida / yaroqli (SPEC 9: holat = ikonka + soʻz + rang). */
export function expiryState(daysLeft: number): "expired" | "expiring" | "valid" {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 90) return "expiring";
  return "valid";
}

function ExpiryBadge({ row }: { row: StockRow }) {
  const t = useTranslations("stock");
  const s = expiryState(row.daysLeft);
  const date = formatDate(new Date(`${row.expiryDate}T00:00:00+05:00`));
  if (s === "expired")
    return (
      <Badge tone="danger" icon={CircleAlert}>
        {t("expired", { date })}
      </Badge>
    );
  if (s === "expiring")
    return (
      <Badge tone="warning" icon={Clock}>
        {t("expiring", { date, days: row.daysLeft })}
      </Badge>
    );
  return <span className="tabular-nums">{date}</span>;
}

/** Eksport havolasi — jadvaldagi filtrlar bilan (server ham filial doirasi va tannarx ruxsatini tekshiradi). */
export function stockExportHref(f: {
  q: string;
  warehouseId: string | null;
  sellableOnly: boolean;
  expiringWithinDays?: number;
  sort?: StockSort | null;
  desc?: boolean;
}): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.warehouseId) p.set("warehouseId", f.warehouseId);
  if (f.sellableOnly) p.set("sellableOnly", "true");
  if (f.expiringWithinDays !== undefined) p.set("expiringWithinDays", String(f.expiringWithinDays));
  if (f.sort) p.set("sort", f.sort);
  if (f.desc) p.set("desc", "true");
  const qs = p.toString();
  return `/api/stock/export${qs ? `?${qs}` : ""}`;
}

/** Qoldiqlar (mode="stock") va Muddat nazorati (mode="expiry") — bitta jadval, turli filtr. */
export function StockPage({ mode }: { mode: "stock" | "expiry" }) {
  const t = useTranslations("stock");
  const me = useMe();
  const warehouses = useWarehouses();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const f = parseStockFilters(new URLSearchParams(params.toString()));
  const { q, warehouseId, sellableOnly, days, sort, desc, page, size } = f;
  const [search, setSearch] = useState(q);
  const apply = (patch: Partial<StockFilters>) => {
    const qs = serializeStockFilters({ ...f, page: 1, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allowed = canAny(me.data, mode === "stock" ? ["stock.view"] : ["expiry.view", "stock.view"]);

  const stock = useQuery({
    queryKey: ["stock", mode, q, warehouseId, sellableOnly, days, sort, desc, page, size],
    queryFn: () =>
      unwrap(
        api.GET("/api/stock", {
          params: {
            query: {
              q: q || undefined,
              warehouseId: warehouseId ? Number(warehouseId) : undefined,
              sellableOnly,
              expiringWithinDays: mode === "expiry" ? Number(days) : undefined,
              sort: sort ?? undefined,
              desc: desc || undefined,
              page: page - 1,
              size,
            },
          },
        }),
      ),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const showCost = (stock.data?.items ?? []).some((r) => r.cost != null);
  const columns: TableColumn<StockRow>[] = [
    { key: "productCode", title: t("code"), mono: true, width: 100, sortable: true },
    {
      key: "productName",
      sortable: true,
      title: t("product"),
      render: (r) => (
        <span className="flex flex-col">
          <span>{r.productName}</span>
          {r.manufacturer ? <span className="text-caption text-text-secondary">{r.manufacturer}</span> : null}
        </span>
      ),
    },
    {
      key: "batchNumber",
      title: t("batch"),
      mono: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          {r.batchNumber}
          {r.bonus ? <Badge tone="info">{t("bonus")}</Badge> : null}
        </span>
      ),
    },
    { key: "expiryDate", title: t("expiry"), sortable: true, render: (r) => <ExpiryBadge row={r} /> },
    { key: "warehouse", title: t("warehouse"), sortable: true },
    {
      key: "zone",
      title: t("zone"),
      render: (r) => (
        <span title={r.sellable ? t("sellable") : t("notSellable")}>
          <Badge tone={r.sellable ? "success" : "neutral"} icon={r.sellable ? ShoppingCart : Lock}>
            {r.zone}
          </Badge>
        </span>
      ),
    },
    {
      key: "qty",
      title: t("qty"),
      align: "right",
      sortable: true,
      render: (r) => <span className="tabular-nums">{formatQuantity(r.qty)}</span>,
    },
    ...(showCost
      ? [{ key: "cost", title: t("cost"), align: "right" as const, render: (r: StockRow) => (r.cost ? formatMoney(r.cost) : "") }]
      : []),
  ];

  const filtered = Boolean(q) || Boolean(warehouseId) || sellableOnly;
  const exportHref = stockExportHref({
    q,
    warehouseId,
    sellableOnly,
    expiringWithinDays: mode === "expiry" ? Number(days) : undefined,
    sort,
    desc,
  });
  return (
    <>
      <h1 className="mb-4 text-page-title">{mode === "stock" ? t("titleStock") : t("titleExpiry")}</h1>
      {stock.data ? (
        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <KpiCard
            label={mode === "stock" ? t("kpiRowsStock") : t("kpiRowsExpiry")}
            icon={mode === "stock" ? Boxes : CalendarClock}
            value={formatQuantity(stock.data.total)}
            unit={t("unitPcs")}
          />
          <KpiCard label={t("totalQty")} value={formatQuantity(stock.data.totalQty)} unit={t("unitItems")} note={t("byFilter")} />
        </div>
      ) : null}
      {stock.error ? (
        <ErrorState onRetry={() => stock.refetch()} />
      ) : (
        <Table
          caption={mode === "stock" ? t("titleStock") : t("titleExpiry")}
          columns={columns}
          rows={stock.data?.items ?? []}
          rowKey={(r) => `${r.zoneId}:${r.batchId}`}
          loading={stock.isPending}
          sort={{ key: stockSortColumn(f, mode), dir: desc ? "desc" : "asc" }}
          onSortChange={(s) => apply({ sort: STOCK_SORT_COLUMNS[s.key] ?? null, desc: s.dir === "desc" })}
          toolbar={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-80">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    clearTimeout(debounce.current);
                    debounce.current = setTimeout(() => apply({ q: v.trim() }), 300);
                  }}
                  placeholder={t("searchPlaceholder")}
                  className="[&>label]:sr-only"
                />
              </div>
              <div className="w-56">
                <Select
                  label={t("warehouse")}
                  size="sm"
                  value={warehouseId}
                  onChange={(v) => apply({ warehouseId: v })}
                  placeholder={t("allWarehouses")}
                  className="[&>span:first-child]:sr-only"
                  options={(warehouses.data ?? []).map((w) => ({ value: String(w.id), label: w.name }))}
                />
              </div>
              {mode === "expiry" ? (
                <div className="w-48">
                  <Select
                    label={t("term")}
                    size="sm"
                    value={days}
                    onChange={(v) => apply({ days: v ?? "90" })}
                    className="[&>span:first-child]:sr-only"
                    options={[
                      { value: "0", label: t("days.0") },
                      { value: "30", label: t("days.30") },
                      { value: "90", label: t("days.90") },
                      { value: "180", label: t("days.180") },
                    ]}
                  />
                </div>
              ) : null}
              <Checkbox label={t("sellableOnly")} checked={sellableOnly} onChange={(v) => apply({ sellableOnly: v })} />
              <div className="ml-auto">
                <SavedViews
                  storageKey={`medix-${mode}-views`}
                  query={params.toString()}
                  hidden={[]}
                  onApply={(v) => {
                    setSearch(parseStockFilters(new URLSearchParams(v.query)).q);
                    router.replace(v.query ? `${pathname}?${v.query}` : pathname, { scroll: false });
                  }}
                />
              </div>
              {stock.data && stock.data.total > 0 ? (
                <a href={exportHref} download className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Download size={16} strokeWidth={1.5} aria-hidden />
                  {t("export")}
                </a>
              ) : null}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setSearch(""), apply({ q: "", warehouseId: null, sellableOnly: false }))} />
            ) : mode === "stock" ? (
              <EmptyState icon={Boxes} title={t("emptyStock")} description={t("emptyStockHint")} />
            ) : (
              <EmptyState icon={CalendarClock} title={t("emptyExpiry")} description={t("emptyExpiryHint")} />
            )
          }
          pagination={
            stock.data && stock.data.total > 0
              ? {
                  page,
                  pageSize: size,
                  total: stock.data.total,
                  onPageChange: (n) => apply({ page: n }),
                  onPageSizeChange: (s) => apply({ size: s }),
                }
              : undefined
          }
        />
      )}
    </>
  );
}
