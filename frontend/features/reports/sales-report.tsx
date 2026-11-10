"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { useDictionary } from "@/features/dictionaries/api";
import { PeriodPicker } from "@/features/home/period-picker";
import { reportHref } from "@/lib/saved-reports";
import { ReportActions, ReportCrumbs, useReportPeriod } from "./saved-reports";
import { averageDoc, previousRange, returnShare } from "./sales-kpis";
import { Delta } from "@/features/home/branch-home";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useClientTable } from "@/lib/client-table";
import { useBranchStore } from "@/lib/stores/branch";

type SalesRow = components["schemas"]["SalesRow"];
const NO_ROWS: SalesRow[] = [];
export type GroupBy = components["schemas"]["SalesReportView"]["groupBy"];

export type PaymentType = NonNullable<components["schemas"]["SalesReportView"]["paymentType"]>;
export const PAYMENT_TYPES: PaymentType[] = ["CASH", "TRANSFER", "ONLINE"];
export const isPaymentType = (v: string): v is PaymentType => (PAYMENT_TYPES as string[]).includes(v);

export const GROUP_LABELS: Record<GroupBy, string> = {
  CUSTOMER: "Mijoz",
  OPERATOR: "Operator",
  BRANCH: "Filial",
  DAY: "Kun",
  REGION: "Hudud",
  PAYMENT_TYPE: "Toʻlov turi",
};

/** .xlsx eksport havolasi — jadvaldagi filtrlar bilan. */
export function salesExportHref(f: {
  branchId: number | null;
  from: string;
  to: string;
  groupBy: GroupBy;
  paymentType?: PaymentType | null;
  regionId?: number | null;
}): string {
  const p = new URLSearchParams();
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  p.set("groupBy", f.groupBy);
  if (f.paymentType) p.set("paymentType", f.paymentType);
  if (f.regionId != null) p.set("regionId", String(f.regionId));
  return `/api/reports/sales/export?${p.toString()}`;
}

const money = (v: string | undefined) => <span className="font-mono tabular-nums">{v == null ? "—" : formatMoney(v)}</span>;

/**
 * Qatordan hujjatlarga (SPEC 8): shu davrda sotilgan/qaytarilgan buyurtmalar — mijoz, operator yoki kun boʻyicha.
 * «Faqat oʻz savdom» (reports.own) boʻlsa — «Mening buyurtmalarim» bilan. Filial qatori va «Jami» — null.
 */
export function salesRowHref(
  groupBy: GroupBy,
  row: { key: string; name: string },
  period: { from: string | null; to: string | null } = { from: null, to: null },
  mineOnly = false,
): string | null {
  const q = new URLSearchParams();
  if (groupBy === "CUSTOMER" || groupBy === "OPERATOR") {
    if (!/^[1-9][0-9]*$/.test(row.key)) return null;
    const [id, name] = groupBy === "CUSTOMER" ? ["customerId", "customer"] : ["operatorId", "operator"];
    q.set(id, row.key);
    q.set(name, row.name);
    if (period.from) q.set("soldFrom", period.from);
    if (period.to) q.set("soldTo", period.to);
  } else if (groupBy === "DAY") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.key)) return null;
    q.set("soldFrom", row.key);
    q.set("soldTo", row.key);
  } else {
    return null;
  }
  if (mineOnly) q.set("mine", "1");
  return `/orders?${q.toString()}`;
}

/** Savdo hisoboti (SPEC 8): filtr (davr, guruh), jami qatori, .xlsx eksport; tannarx/yalpi foyda faqat ruxsat bilan (API oʻzi yubormaydi). */
/** Katalogdagi «Operatorlar savdosi» kabi kirishlar: ?groupBy=OPERATOR — ruxsat etilgan guruh boʻlsa, oʻsha bilan ochiladi. */
export function initialGroupBy(raw: string | null, allowed: GroupBy[]): GroupBy {
  return allowed.find((g) => g === raw) ?? "CUSTOMER";
}

export function SalesReportPage() {
  const t = useTranslations("reports");
  const me = useMe();
  const router = useRouter();
  const allowed = can(me.data, "reports.all") || can(me.data, "reports.view") || can(me.data, "reports.own");
  const canOpenOrders = can(me.data, "orders.view");
  const fullScope = can(me.data, "reports.all") || can(me.data, "reports.view");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = useReportPeriod();
  const { from, to } = period.range;
  const groups = (Object.keys(GROUP_LABELS) as GroupBy[]).filter((g) => fullScope || (g !== "OPERATOR" && g !== "BRANCH"));
  const regions = useDictionary("REGION");
  const params = useSearchParams();
  // Ruxsatlar yuklangach URL'dagi guruh qoʻllanadi; foydalanuvchi tanlasa — oʻsha.
  const [picked, setGroupBy] = useState<GroupBy | null>(null);
  const groupBy = picked ?? initialGroupBy(params.get("groupBy"), groups);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const fetchSales = (range: { from: string; to: string }) =>
    unwrap(
      api.GET("/api/reports/sales", {
        params: {
          query: {
            branchId: branchId ?? undefined,
            from: range.from,
            to: range.to,
            groupBy,
            paymentType: paymentType ?? undefined,
            regionId: regionId ?? undefined,
          },
        },
      }),
    );
  const report = useQuery({
    queryKey: ["reports", "sales", branchId, from, to, groupBy, paymentType, regionId],
    queryFn: () => fetchSales({ from: from ?? "", to: to ?? "" }),
    enabled: allowed && !!from && !!to,
  });
  // KPI taqqoslashi (prototip): oldingi teng davr, xuddi shu filtrlar bilan
  const prevRange = from && to ? previousRange(from, to) : null;
  const prev = useQuery({
    queryKey: ["reports", "sales", branchId, prevRange?.from, prevRange?.to, groupBy, paymentType, regionId],
    queryFn: () => fetchSales(prevRange ?? { from: "", to: "" }),
    enabled: allowed && !!prevRange,
  });

  const table = useClientTable(report.data?.rows ?? NO_ROWS);

  if (me.data && !allowed) return <ForbiddenState description={t("sales.forbidden")} />;
  const r = report.data;
  const columns: TableColumn<SalesRow>[] = [
    {
      key: "name",
      sortable: true,
      title: t(`sales.group.${groupBy}`),
      render: (x) =>
        groupBy === "PAYMENT_TYPE" && isPaymentType(x.key) ? (
          t(`sales.payment.${x.key}`)
        ) : x.name === "" ? (
          <span className="text-text-secondary">{t("sales.unspecified")}</span>
        ) : (
          x.name
        ),
    },
    {
      key: "orders",
      sortable: true,
      title: t("orders"),
      align: "right",
      render: (x) => <span className="font-mono tabular-nums">{x.orders}</span>,
    },
    { key: "sales", sortable: true, title: t("sales.sales"), align: "right", render: (x) => money(x.sales) },
    { key: "discount", sortable: true, title: t("sales.discount"), align: "right", render: (x) => money(x.discount) },
    { key: "returns", sortable: true, title: t("sales.returns"), align: "right", render: (x) => money(x.returns) },
    { key: "net", sortable: true, title: t("sales.net"), align: "right", render: (x) => money(x.net) },
  ];
  if (r?.costVisible) {
    columns.push(
      { key: "cost", title: t("sales.cost"), align: "right", render: (x) => money(x.cost) },
      { key: "profit", title: t("sales.profit"), align: "right", render: (x) => money(x.profit) },
    );
  }
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: t("total"),
        orders: <span className="font-mono tabular-nums">{r.total.orders}</span>,
        sales: money(r.total.sales),
        discount: money(r.total.discount),
        returns: money(r.total.returns),
        net: money(r.total.net),
        ...(r.costVisible ? { cost: money(r.total.cost), profit: money(r.total.profit) } : {}),
      }
    : undefined;

  return (
    <>
      <ReportCrumbs title={t("sales.title")} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{t("sales.title")}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker state={period} />
          <ReportActions
            href={reportHref("/reports/sales", period.preset, { groupBy })}
            defaultName={t("sales.title")}
            exportHref={from && to ? salesExportHref({ branchId, from, to, groupBy, paymentType, regionId }) : null}
          />
        </div>
      </div>
      {r ? (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label={t("sales.kpi.net")} value={formatMoney(r.total.net)} unit={t("sales.kpi.soum")}>
            <Delta cur={r.total.net} prev={prev.data?.total.net} />
          </KpiTile>
          <KpiTile label={t("sales.kpi.docs")} value={String(r.total.orders)}>
            <Delta cur={`${r.total.orders}.00`} prev={prev.data ? `${prev.data.total.orders}.00` : null} />
          </KpiTile>
          <KpiTile
            label={t("sales.kpi.avg")}
            value={(() => {
              const avg = averageDoc(r.total.net, r.total.orders);
              return avg ? formatMoney(avg) : "—";
            })()}
            unit={t("sales.kpi.soum")}
          />
          <KpiTile label={t("sales.kpi.retShare")} value={returnShare(r.total.returns, r.total.sales)} />
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          aria-label={t("sales.groupBy")}
          items={groups.map((g) => ({ key: g, label: t(`sales.group.${g}`) }))}
          value={groupBy}
          onChange={(k) => setGroupBy(k as GroupBy)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <Select
              label={t("sales.paymentType")}
              size="sm"
              value={paymentType}
              onChange={(v) => setPaymentType((v as PaymentType | null) ?? null)}
              placeholder={t("sales.allPayments")}
              className="[&>span:first-child]:sr-only"
              options={PAYMENT_TYPES.map((p) => ({ value: p, label: t(`sales.payment.${p}`) }))}
            />
          </div>
          <div className="w-52">
            <Select
              label={t("sales.region")}
              size="sm"
              searchable
              value={regionId ? String(regionId) : null}
              onChange={(v) => setRegionId(v ? Number(v) : null)}
              placeholder={t("sales.allRegions")}
              className="[&>span:first-child]:sr-only"
              options={(regions.data ?? []).map((x) => ({ value: String(x.id), label: x.name }))}
            />
          </div>
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
          caption={t("sales.title")}
          density="compact"
          columns={columns}
          rows={table.rows}
          sort={table.sort}
          onSortChange={table.onSortChange}
          pagination={table.pagination}
          rowKey={(x) => x.key}
          loading={report.isLoading}
          onRowClick={
            canOpenOrders && groupBy !== "BRANCH"
              ? (x) => {
                  const href = salesRowHref(groupBy, x, { from, to }, r?.mineOnly ?? false);
                  if (href) router.push(href);
                }
              : undefined
          }
          totals={r && r.rows.length > 0 ? totals : undefined}
          emptyState={<EmptyState icon={ChartColumn} title={t("sales.emptyTitle")} description={t("emptyHint")} />}
        />
      )}
      {r?.truncated ? <p className="mt-2 text-caption text-warning">{t("sales.truncated")}</p> : null}
      <p className="mt-2 text-caption text-text-secondary">{t("sales.note")}</p>
    </>
  );
}

function KpiTile({ label, value, unit, children }: { label: string; value: string; unit?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-4">
      <span className="text-body text-text-secondary">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-section-title whitespace-nowrap tabular-nums">{value}</span>
        {unit ? <span className="text-caption text-text-secondary">{unit}</span> : null}
      </span>
      {children}
    </div>
  );
}
