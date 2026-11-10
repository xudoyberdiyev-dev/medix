"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker } from "@/features/home/period-picker";
import { reportHref } from "@/lib/saved-reports";
import { ReportActions, ReportCrumbs, useReportPeriod } from "./saved-reports";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useClientTable } from "@/lib/client-table";
import { useBranchStore } from "@/lib/stores/branch";
import { idParam } from "@/lib/url-filters";

type Row = components["schemas"]["ProductSalesRow"];
export type ProductGroupBy = components["schemas"]["ProductSalesView"]["groupBy"];
const NO_ROWS: Row[] = [];
export const PRODUCT_GROUPS: ProductGroupBy[] = ["PRODUCT", "CATEGORY", "MANUFACTURER"];

/** .xlsx eksport havolasi — jadvaldagi filtrlar bilan. */
export function productSalesExportHref(f: {
  branchId: number | null;
  from: string;
  to: string;
  groupBy: ProductGroupBy;
  customerId?: number | null;
  categoryId?: number | null;
  manufacturerId?: number | null;
}): string {
  const p = new URLSearchParams();
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  p.set("groupBy", f.groupBy);
  if (f.customerId != null) p.set("customerId", String(f.customerId));
  if (f.categoryId != null) p.set("categoryId", String(f.categoryId));
  if (f.manufacturerId != null) p.set("manufacturerId", String(f.manufacturerId));
  return `/api/reports/product-sales/export?${p.toString()}`;
}

/** Rentabellik: API "40.3" → "40,3 %"; yoʻq boʻlsa (sof savdo 0) — tire. */
export function formatMargin(v: string | undefined | null): string {
  return v == null ? "—" : `${v.replace(".", ",")} %`;
}

export function initialProductGroupBy(raw: string | null): ProductGroupBy {
  return PRODUCT_GROUPS.find((g) => g === raw) ?? "PRODUCT";
}

const money = (v: string | undefined) => <span className="font-mono tabular-nums">{v == null ? "—" : formatMoney(v)}</span>;
const qty = (v: number) => <span className="font-mono tabular-nums">{formatQuantity(v)}</span>;

/** Kategoriya / ishlab chiqaruvchi qatori bosilsa — shu filtr bilan mahsulotlar kesimiga oʻtiladi; «Koʻrsatilmagan» qatori bosilmaydi. */
export function drillFilter(groupBy: ProductGroupBy, row: Pick<Row, "key" | "name">) {
  const id = Number(row.key);
  if (groupBy === "PRODUCT" || row.key === "" || !Number.isInteger(id) || id <= 0) return null;
  return { kind: groupBy === "CATEGORY" ? ("category" as const) : ("manufacturer" as const), id, name: row.name };
}

/**
 * Mahsulotlar savdosi va yalpi foyda (SPEC 8): davr, guruh (mahsulot / kategoriya / ishlab chiqaruvchi), mijoz filtri (?customerId=),
 * kategoriya va ishlab chiqaruvchi filtri (?categoryId=, ?manufacturerId= yoki guruh qatorini bosib),
 * jami qatori, .xlsx; tannarx, yalpi foyda va rentabellik faqat prices.cost bilan (API oʻzi yubormaydi).
 */
export function ProductSalesReportPage() {
  const t = useTranslations("reports");
  const me = useMe();
  const allowed = can(me.data, "reports.all") || can(me.data, "reports.view") || can(me.data, "reports.own");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = useReportPeriod();
  const { from, to } = period.range;
  const params = useSearchParams();
  const [groupBy, setGroupBy] = useState<ProductGroupBy>(() => initialProductGroupBy(params.get("groupBy")));
  const [customer, setCustomer] = useState(() => idParam(params, "customerId", "customer", t("products.customer")));
  const [category, setCategory] = useState(() => idParam(params, "categoryId", "category", t("products.group.CATEGORY")));
  const [manufacturer, setManufacturer] = useState(() =>
    idParam(params, "manufacturerId", "manufacturer", t("products.group.MANUFACTURER")),
  );
  const report = useQuery({
    queryKey: [
      "reports",
      "product-sales",
      branchId,
      from,
      to,
      groupBy,
      customer?.id ?? null,
      category?.id ?? null,
      manufacturer?.id ?? null,
    ],
    queryFn: () =>
      unwrap(
        api.GET("/api/reports/product-sales", {
          params: {
            query: {
              branchId: branchId ?? undefined,
              from: from ?? undefined,
              to: to ?? undefined,
              groupBy,
              customerId: customer?.id,
              categoryId: category?.id,
              manufacturerId: manufacturer?.id,
            },
          },
        }),
      ),
    enabled: allowed && !!from && !!to,
  });
  const table = useClientTable(report.data?.rows ?? NO_ROWS);

  if (me.data && !allowed) return <ForbiddenState description={t("products.forbidden")} />;
  const r = report.data;
  const columns: TableColumn<Row>[] = [
    {
      key: "name",
      sortable: true,
      title: t(`products.group.${groupBy}`),
      render: (x) =>
        x.name === "" ? (
          <span className="text-text-secondary">{t("products.unspecified")}</span>
        ) : (
          <span>
            {x.name}
            {x.code ? <span className="ml-2 font-mono text-caption text-text-secondary">{x.code}</span> : null}
          </span>
        ),
    },
    { key: "qtySold", sortable: true, title: t("products.qtySold"), align: "right", render: (x) => qty(x.qtySold) },
    { key: "qtyReturned", sortable: true, title: t("products.qtyReturned"), align: "right", render: (x) => qty(x.qtyReturned) },
    { key: "qtyNet", sortable: true, title: t("products.qtyNet"), align: "right", render: (x) => qty(x.qtyNet) },
    { key: "sales", sortable: true, title: t("sales.sales"), align: "right", render: (x) => money(x.sales) },
    { key: "returns", sortable: true, title: t("sales.returns"), align: "right", render: (x) => money(x.returns) },
    { key: "net", sortable: true, title: t("sales.net"), align: "right", render: (x) => money(x.net) },
  ];
  if (r?.costVisible) {
    columns.push(
      { key: "cost", title: t("sales.cost"), align: "right", render: (x) => money(x.cost) },
      { key: "profit", title: t("sales.profit"), align: "right", render: (x) => money(x.profit) },
      {
        key: "margin",
        title: t("products.margin"),
        align: "right",
        render: (x) => <span className="font-mono tabular-nums">{formatMargin(x.margin)}</span>,
      },
    );
  }
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: t("total"),
        qtySold: qty(r.total.qtySold),
        qtyReturned: qty(r.total.qtyReturned),
        qtyNet: qty(r.total.qtyNet),
        sales: money(r.total.sales),
        returns: money(r.total.returns),
        net: money(r.total.net),
        ...(r.costVisible
          ? {
              cost: money(r.total.cost),
              profit: money(r.total.profit),
              margin: <span className="font-mono tabular-nums">{formatMargin(r.total.margin)}</span>,
            }
          : {}),
      }
    : undefined;

  return (
    <>
      <ReportCrumbs title={t("products.title")} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{t("products.title")}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker state={period} />
          <ReportActions
            href={reportHref("/reports/products", period.preset, { groupBy })}
            defaultName={t("products.title")}
            exportHref={
              from && to
                ? productSalesExportHref({
                    branchId,
                    from,
                    to,
                    groupBy,
                    customerId: customer?.id ?? null,
                    categoryId: category?.id ?? null,
                    manufacturerId: manufacturer?.id ?? null,
                  })
                : null
            }
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            aria-label={t("sales.groupBy")}
            items={PRODUCT_GROUPS.map((g) => ({ key: g, label: t(`products.group.${g}`) }))}
            value={groupBy}
            onChange={(k) => setGroupBy(k as ProductGroupBy)}
          />
          {customer ? (
            <FilterChip
              label={t("products.customerChip", { name: customer.name })}
              what={t("products.customer")}
              onClear={() => setCustomer(null)}
            />
          ) : null}
          {category ? (
            <FilterChip
              label={t("products.categoryChip", { name: category.name })}
              what={t("products.group.CATEGORY")}
              onClear={() => setCategory(null)}
            />
          ) : null}
          {manufacturer ? (
            <FilterChip
              label={t("products.manufacturerChip", { name: manufacturer.name })}
              what={t("products.group.MANUFACTURER")}
              onClear={() => setManufacturer(null)}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-4 text-caption text-text-secondary">
          {r ? (
            <span>
              {r.from === r.to ? formatIsoDate(r.from) : `${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}
              {r.mineOnly ? ` · ${t("sales.mineOnly")}` : r.branchId == null ? ` · ${t("allBranches")}` : ""}
            </span>
          ) : null}
        </div>
      </div>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={t("products.title")}
          density="compact"
          columns={columns}
          rows={table.rows}
          sort={table.sort}
          onSortChange={table.onSortChange}
          pagination={table.pagination}
          rowKey={(x) => x.key || "—"}
          onRowClick={
            groupBy === "PRODUCT"
              ? undefined
              : (x) => {
                  const d = drillFilter(groupBy, x);
                  if (!d) return;
                  if (d.kind === "category") setCategory({ id: d.id, name: d.name });
                  else setManufacturer({ id: d.id, name: d.name });
                  setGroupBy("PRODUCT");
                }
          }
          loading={report.isLoading}
          totals={r && r.rows.length > 0 ? totals : undefined}
          emptyState={<EmptyState icon={ChartColumn} title={t("sales.emptyTitle")} description={t("emptyHint")} />}
        />
      )}
      {r?.truncated ? <p className="mt-2 text-caption text-warning">{t("sales.truncated")}</p> : null}
      {groupBy !== "PRODUCT" ? <p className="mt-2 text-caption text-text-secondary">{t("products.drillHint")}</p> : null}
      <p className="mt-2 text-caption text-text-secondary">{t(r?.costVisible ? "products.noteCost" : "products.note")}</p>
    </>
  );
}
