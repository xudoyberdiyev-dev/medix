"use client";

import { useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
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
import { formatMargin } from "./product-sales-report";

type Row = components["schemas"]["ReturnsRow"];
export type ReturnsGroupBy = components["schemas"]["ReturnsView"]["groupBy"];
const NO_ROWS: Row[] = [];
export const RETURNS_GROUPS: ReturnsGroupBy[] = ["REASON", "CUSTOMER", "PRODUCT", "DAY"];

/** .xlsx eksport havolasi — jadvaldagi filtrlar bilan. */
export function returnsExportHref(f: {
  branchId: number | null;
  from: string;
  to: string;
  groupBy: ReturnsGroupBy;
  customerId?: number | null;
  productId?: number | null;
}): string {
  const p = new URLSearchParams();
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  p.set("groupBy", f.groupBy);
  if (f.customerId != null) p.set("customerId", String(f.customerId));
  if (f.productId != null) p.set("productId", String(f.productId));
  return `/api/reports/returns/export?${p.toString()}`;
}

export function initialReturnsGroupBy(raw: string | null): ReturnsGroupBy {
  return RETURNS_GROUPS.find((g) => g === raw) ?? "REASON";
}

/** Mijoz qatori → uning mahsulotlari; mahsulot qatori → qaytarish sabablari. Sabab va kun qatorlari bosilmaydi. */
export function drillReturns(groupBy: ReturnsGroupBy, row: Pick<Row, "key" | "name">) {
  const id = Number(row.key);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (groupBy === "CUSTOMER") return { kind: "customer" as const, id, name: row.name, next: "PRODUCT" as const };
  if (groupBy === "PRODUCT") return { kind: "product" as const, id, name: row.name, next: "REASON" as const };
  return null;
}

const money = (v: string | undefined) => <span className="font-mono tabular-nums">{v == null ? "—" : formatMoney(v)}</span>;
const qty = (v: number) => <span className="font-mono tabular-nums">{formatQuantity(v)}</span>;

/**
 * Qaytarishlar hisoboti (QM, SPEC 8): davr, guruh (sabab / mijoz / mahsulot / kun), mijoz va mahsulot filtri (?customerId=, ?productId=
 * yoki qatorni bosib), hujjatlar soni, dona, summa, qaytarish ulushi (mijoz / mahsulot kesimida va jami), .xlsx.
 */
export function ReturnsReportPage() {
  const t = useTranslations("reports");
  const me = useMe();
  const allowed = can(me.data, "reports.all") || can(me.data, "reports.view") || can(me.data, "reports.own");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = useReportPeriod();
  const { from, to } = period.range;
  const params = useSearchParams();
  const [groupBy, setGroupBy] = useState<ReturnsGroupBy>(() => initialReturnsGroupBy(params.get("groupBy")));
  const [customer, setCustomer] = useState(() => idParam(params, "customerId", "customer", t("returns.group.CUSTOMER")));
  const [product, setProduct] = useState(() => idParam(params, "productId", "product", t("returns.group.PRODUCT")));
  const report = useQuery({
    queryKey: ["reports", "returns", branchId, from, to, groupBy, customer?.id ?? null, product?.id ?? null],
    queryFn: () =>
      unwrap(
        api.GET("/api/reports/returns", {
          params: {
            query: {
              branchId: branchId ?? undefined,
              from: from ?? undefined,
              to: to ?? undefined,
              groupBy,
              customerId: customer?.id,
              productId: product?.id,
            },
          },
        }),
      ),
    enabled: allowed && !!from && !!to,
  });
  const table = useClientTable(report.data?.rows ?? NO_ROWS);

  if (me.data && !allowed) return <ForbiddenState description={t("returns.forbidden")} />;
  const r = report.data;
  const withRate = groupBy === "CUSTOMER" || groupBy === "PRODUCT";
  const columns: TableColumn<Row>[] = [
    {
      key: "name",
      sortable: true,
      title: t(`returns.group.${groupBy}`),
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
    { key: "documents", sortable: true, title: t("returns.documents"), align: "right", render: (x) => qty(x.documents) },
    { key: "qty", sortable: true, title: t("products.qtyReturned"), align: "right", render: (x) => qty(x.qty) },
    { key: "amount", sortable: true, title: t("returns.amount"), align: "right", render: (x) => money(x.amount) },
  ];
  if (withRate) {
    columns.push(
      { key: "sales", title: t("sales.sales"), align: "right", render: (x) => money(x.sales) },
      {
        key: "rate",
        title: t("returns.rate"),
        align: "right",
        render: (x) => <span className="font-mono tabular-nums">{formatMargin(x.rate)}</span>,
      },
    );
  }
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: t("total"),
        documents: qty(r.total.documents),
        qty: qty(r.total.qty),
        amount: money(r.total.amount),
        ...(withRate
          ? {
              sales: money(r.total.sales),
              rate: <span className="font-mono tabular-nums">{formatMargin(r.total.rate)}</span>,
            }
          : {}),
      }
    : undefined;

  return (
    <>
      <ReportCrumbs title={t("returns.title")} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{t("returns.title")}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker state={period} />
          <ReportActions
            href={reportHref("/reports/returns", period.preset, { groupBy })}
            defaultName={t("returns.title")}
            exportHref={
              from && to
                ? returnsExportHref({
                    branchId,
                    from,
                    to,
                    groupBy,
                    customerId: customer?.id ?? null,
                    productId: product?.id ?? null,
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
            items={RETURNS_GROUPS.map((g) => ({ key: g, label: t(`returns.group.${g}`) }))}
            value={groupBy}
            onChange={(k) => setGroupBy(k as ReturnsGroupBy)}
          />
          {customer ? (
            <FilterChip
              label={t("products.customerChip", { name: customer.name })}
              what={t("returns.group.CUSTOMER")}
              onClear={() => setCustomer(null)}
            />
          ) : null}
          {product ? (
            <FilterChip
              label={t("returns.productChip", { name: product.name })}
              what={t("returns.group.PRODUCT")}
              onClear={() => setProduct(null)}
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
          {r?.total.rate != null ? <span>{t("returns.totalRate", { rate: formatMargin(r.total.rate) })}</span> : null}
        </div>
      </div>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={t("returns.title")}
          density="compact"
          columns={columns}
          rows={table.rows}
          sort={table.sort}
          onSortChange={table.onSortChange}
          pagination={table.pagination}
          rowKey={(x) => x.key || "—"}
          loading={report.isLoading}
          totals={r && r.rows.length > 0 ? totals : undefined}
          onRowClick={
            withRate
              ? (x) => {
                  const d = drillReturns(groupBy, x);
                  if (!d) return;
                  if (d.kind === "customer") setCustomer({ id: d.id, name: d.name });
                  else setProduct({ id: d.id, name: d.name });
                  setGroupBy(d.next);
                }
              : undefined
          }
          emptyState={<EmptyState icon={Undo2} title={t("returns.emptyTitle")} description={t("emptyHint")} />}
        />
      )}
      {r?.truncated ? <p className="mt-2 text-caption text-warning">{t("sales.truncated")}</p> : null}
      <p className="mt-2 text-caption text-text-secondary">{t("returns.note")}</p>
    </>
  );
}
