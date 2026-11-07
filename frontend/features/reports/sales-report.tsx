"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChartColumn, Download } from "lucide-react";
import Link from "next/link";
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
import { PeriodPicker, usePeriodState } from "@/features/home/period-picker";
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
  const period = usePeriodState();
  const { from, to } = period.range;
  const groups = (Object.keys(GROUP_LABELS) as GroupBy[]).filter((g) => fullScope || (g !== "OPERATOR" && g !== "BRANCH"));
  const regions = useDictionary("REGION");
  const params = useSearchParams();
  // Ruxsatlar yuklangach URL'dagi guruh qoʻllanadi; foydalanuvchi tanlasa — oʻsha.
  const [picked, setGroupBy] = useState<GroupBy | null>(null);
  const groupBy = picked ?? initialGroupBy(params.get("groupBy"), groups);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const report = useQuery({
    queryKey: ["reports", "sales", branchId, from, to, groupBy, paymentType, regionId],
    queryFn: () =>
      unwrap(
        api.GET("/api/reports/sales", {
          params: {
            query: {
              branchId: branchId ?? undefined,
              from: from ?? undefined,
              to: to ?? undefined,
              groupBy,
              paymentType: paymentType ?? undefined,
              regionId: regionId ?? undefined,
            },
          },
        }),
      ),
    enabled: allowed && !!from && !!to,
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
        returns: money(r.total.returns),
        net: money(r.total.net),
        ...(r.costVisible ? { cost: money(r.total.cost), profit: money(r.total.profit) } : {}),
      }
    : undefined;

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-caption text-text-secondary hover:underline">
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> {t("back")}
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{t("sales.title")}</h1>
        <PeriodPicker state={period} />
      </div>
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
          {from && to ? (
            <a
              href={salesExportHref({ branchId, from, to, groupBy, paymentType, regionId })}
              download
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Download size={16} strokeWidth={1.5} aria-hidden /> {t("export")}
            </a>
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
