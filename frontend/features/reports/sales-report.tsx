"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartColumn, ChevronDown, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ColumnsMenu, useColumnPrefs } from "@/components/ui/columns-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { useDictionary } from "@/features/dictionaries/api";
import { PeriodPicker } from "@/features/home/period-picker";
import { reportHref } from "@/lib/saved-reports";
import { ReportActions, ReportCrumbs, useReportPeriod } from "./saved-reports";
import { averageDoc, dayBars, previousRange, returnShare } from "./sales-kpis";
import { SalesDayChart } from "./sales-chart";
import { Delta } from "@/features/home/branch-home";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useClientTable } from "@/lib/client-table";
import { useBranchStore } from "@/lib/stores/branch";
import { cn } from "@/lib/cn";

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
  WEEK: "Hafta",
  MONTH: "Oy",
};

/** .xlsx eksport havolasi — jadvaldagi filtrlar bilan. */
export function salesExportHref(f: {
  branchId: number | null;
  from: string;
  to: string;
  groupBy: GroupBy;
  groupBy2?: GroupBy | null;
  paymentType?: PaymentType | null;
  regionId?: number | null;
}): string {
  const p = new URLSearchParams();
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  p.set("groupBy", f.groupBy);
  if (f.groupBy2) p.set("groupBy2", f.groupBy2);
  if (f.paymentType) p.set("paymentType", f.paymentType);
  if (f.regionId != null) p.set("regionId", String(f.regionId));
  return `/api/reports/sales/export?${p.toString()}`;
}

const money = (v: string | undefined) => <span className="font-mono tabular-nums">{v == null ? "—" : formatMoney(v)}</span>;

const pad = (n: number) => String(n).padStart(2, "0");

/** Kun / hafta (kalit — dushanba) / oy (YYYY-MM) qatorining sana oraligʻi; notoʻgʻri kalit — null. UTC'da hisoblanadi (faqat sana). */
export function groupRange(by: "DAY" | "WEEK" | "MONTH", key: string): { from: string; to: string } | null {
  if (by === "MONTH") {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return null;
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    return { from: `${key}-01`, to: `${key}-${pad(last)}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  if (by === "DAY") return { from: key, to: key };
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return { from: key, to: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` };
}

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
  } else if (groupBy === "DAY" || groupBy === "WEEK" || groupBy === "MONTH") {
    const range = groupRange(groupBy, row.key);
    if (!range) return null;
    q.set("soldFrom", range.from);
    q.set("soldTo", range.to);
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

const COLUMN_KEYS = ["name", "orders", "sales", "discount", "returns", "net", "vat", "total", "cost", "profit"] as const;

/** Jadval qatori: Guruh 1 (level 0) yoki uning ichidagi Guruh 2 (level 1, prototip Reports). */
type DisplayRow = SalesRow & { level: 0 | 1; parent: string | null };
export type VatMode = "net" | "gross";

/** URL'dagi Guruh 2: ruxsat etilgan va Guruh 1 dan farqli boʻlsa. */
export function initialGroup2(raw: string | null, groups: GroupBy[], g1: GroupBy): GroupBy | null {
  return raw && raw !== g1 && (groups as string[]).includes(raw) ? (raw as GroupBy) : null;
}

/** Guruh 1 ochilganda ichki qatorlar shu tartibda qoʻshiladi (saralash — faqat Guruh 1 boʻyicha). */
export function flattenGroups(rows: SalesRow[], expanded: readonly string[], withChildren: boolean): DisplayRow[] {
  return rows.flatMap((p): DisplayRow[] => {
    const head: DisplayRow = { ...p, level: 0, parent: null };
    if (!withChildren || !expanded.includes(p.key)) return [head];
    return [head, ...(p.children ?? []).map((c): DisplayRow => ({ ...c, level: 1, parent: p.key }))];
  });
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
  const [picked2, setGroupBy2] = useState<GroupBy | null | undefined>(undefined);
  const groupBy2 = picked2 === undefined ? initialGroup2(params.get("groupBy2"), groups, groupBy) : picked2 === groupBy ? null : picked2;
  const [vatMode, setVatMode] = useState<VatMode>(params.get("vat") === "gross" ? "gross" : "net");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const fetchSales = (range: { from: string; to: string }, by: GroupBy = groupBy, by2: GroupBy | null = null) =>
    unwrap(
      api.GET("/api/reports/sales", {
        params: {
          query: {
            branchId: branchId ?? undefined,
            from: range.from,
            to: range.to,
            groupBy: by,
            groupBy2: by2 ?? undefined,
            paymentType: paymentType ?? undefined,
            regionId: regionId ?? undefined,
          },
        },
      }),
    );
  const report = useQuery({
    queryKey: ["reports", "sales", branchId, from, to, groupBy, groupBy2, paymentType, regionId],
    queryFn: () => fetchSales({ from: from ?? "", to: to ?? "" }, groupBy, groupBy2),
    enabled: allowed && !!from && !!to,
  });
  // KPI taqqoslashi (prototip): oldingi teng davr, xuddi shu filtrlar bilan
  const prevRange = from && to ? previousRange(from, to) : null;
  const prev = useQuery({
    queryKey: ["reports", "sales", branchId, prevRange?.from, prevRange?.to, groupBy, paymentType, regionId],
    queryFn: () => fetchSales(prevRange ?? { from: "", to: "" }),
    enabled: allowed && !!prevRange,
  });

  // «Sof savdo — davr boʻyicha» grafigi: kunlar kesimi (joriy guruh «Kun» boʻlsa — shu soʻrov)
  const daily = useQuery({
    queryKey: ["reports", "sales", branchId, from, to, "DAY", paymentType, regionId],
    queryFn: () => fetchSales({ from: from ?? "", to: to ?? "" }, "DAY"),
    enabled: allowed && !!from && !!to && groupBy !== "DAY",
  });
  const dayRows = groupBy === "DAY" ? report.data : daily.data;
  const bars = dayRows && from && to ? dayBars(from, to, dayRows.rows) : [];

  const table = useClientTable(report.data?.rows ?? NO_ROWS);
  const display = flattenGroups(table.rows, expanded, groupBy2 != null);
  const gross = vatMode === "gross";
  const { cols, update: setCols, reset: resetCols } = useColumnPrefs("medix-report-sales-cols", COLUMN_KEYS);

  if (me.data && !allowed) return <ForbiddenState description={t("sales.forbidden")} />;
  const r = report.data;
  const columns: TableColumn<DisplayRow>[] = [
    {
      key: "name",
      sortable: true,
      title: groupBy2 ? `${t(`sales.group.${groupBy}`)} / ${t(`sales.group.${groupBy2}`)}` : t(`sales.group.${groupBy}`),
      render: (x) => {
        const by = x.level === 1 && groupBy2 ? groupBy2 : groupBy;
        const label =
          by === "PAYMENT_TYPE" && isPaymentType(x.key) ? (
            t(`sales.payment.${x.key}`)
          ) : x.name === "" ? (
            <span className="text-text-secondary">{t("sales.unspecified")}</span>
          ) : (
            x.name
          );
        if (!groupBy2) return label;
        if (x.level === 1) return <span className="block pl-6">{label}</span>;
        const Icon = expanded.includes(x.key) ? ChevronDown : ChevronRight;
        return (
          <span className="flex items-center gap-1.5 font-medium">
            <Icon aria-hidden className="size-4 shrink-0 text-text-secondary" strokeWidth={1.5} />
            {label}
          </span>
        );
      },
    },
    {
      key: "orders",
      sortable: true,
      title: t("orders"),
      align: "right",
      render: (x) => <span className="font-mono tabular-nums">{x.orders}</span>,
    },
    { key: "sales", sortable: true, title: t("sales.sales"), align: "right", render: (x) => money(x.salesExVat) },
    { key: "discount", sortable: true, title: t("sales.discount"), align: "right", render: (x) => money(x.discount) },
    { key: "returns", sortable: true, title: t("sales.returns"), align: "right", render: (x) => money(x.returnsExVat) },
    { key: "net", sortable: true, title: t("sales.netExVat"), align: "right", render: (x) => money(x.netExVat) },
    { key: "vat", title: t("sales.vat"), align: "right", render: (x) => money(x.vat) },
  ];
  // «QQS bilan» rejimi (prototip Reports): qoʻshimcha «Jami (QQS bilan)» ustuni
  if (gross) columns.push({ key: "total", title: t("sales.totalVat"), align: "right", render: (x) => money(x.net) });
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
        sales: money(r.total.salesExVat),
        discount: money(r.total.discount),
        returns: money(r.total.returnsExVat),
        net: money(r.total.netExVat),
        vat: money(r.total.vat),
        ...(gross ? { total: money(r.total.net) } : {}),
        ...(r.costVisible ? { cost: money(r.total.cost), profit: money(r.total.profit) } : {}),
      }
    : undefined;

  const byKey = new Map(columns.map((c) => [c.key, c]));
  const menuCols = cols.filter((c) => byKey.has(c.key));
  const shownCols = menuCols.filter((c) => c.visible).flatMap((c) => byKey.get(c.key) ?? []);
  const colLabels = Object.fromEntries(columns.map((c) => [c.key, String(c.title)]));

  return (
    <>
      <ReportCrumbs title={t("sales.title")} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{t("sales.title")}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker state={period} />
          <ReportActions
            href={reportHref("/reports/sales", period.preset, { groupBy, groupBy2, vat: gross ? "gross" : null })}
            defaultName={t("sales.title")}
            exportHref={from && to ? salesExportHref({ branchId, from, to, groupBy, groupBy2, paymentType, regionId }) : null}
          />
        </div>
      </div>
      {r ? (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label={t("sales.kpi.net")} value={formatMoney(gross ? r.total.net : r.total.netExVat)} unit={t("sales.kpi.soum")}>
            <Delta cur={gross ? r.total.net : r.total.netExVat} prev={gross ? prev.data?.total.net : prev.data?.total.netExVat} />
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
      {bars.some((b) => b.orders > 0) ? <SalesDayChart bars={bars} /> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select
              label={t("sales.group1")}
              size="sm"
              required
              value={groupBy}
              onChange={(v) => {
                if (!v) return;
                setGroupBy(v as GroupBy);
                if (v === groupBy2) setGroupBy2(null);
                setExpanded([]);
              }}
              className="[&>span:first-child]:sr-only"
              options={groups.map((g) => ({ value: g, label: `${t("sales.group1")}: ${t(`sales.group.${g}`)}` }))}
            />
          </div>
          <div className="w-52">
            <Select
              label={t("sales.group2")}
              size="sm"
              value={groupBy2}
              onChange={(v) => {
                setGroupBy2((v as GroupBy | null) ?? null);
                setExpanded([]);
              }}
              placeholder={`${t("sales.group2")}: ${t("sales.none")}`}
              className="[&>span:first-child]:sr-only"
              options={groups
                .filter((g) => g !== groupBy)
                .map((g) => ({ value: g, label: `${t("sales.group2")}: ${t(`sales.group.${g}`)}` }))}
            />
          </div>
          <VatSegment
            label={t("sales.vatMode")}
            value={vatMode}
            onChange={setVatMode}
            items={[
              { key: "net", label: t("sales.vatNet") },
              { key: "gross", label: t("sales.vatGross") },
            ]}
          />
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
              {` · ${gross ? t("sales.vatGross") : t("sales.vatNet")}`}
            </span>
          ) : null}
          <ColumnsMenu
            label={t("columns")}
            hint={t("colsHint")}
            resetLabel={t("colsReset")}
            columns={menuCols}
            labels={colLabels}
            onChange={(next) => setCols([...next, ...cols.filter((c) => !byKey.has(c.key))])}
            onReset={resetCols}
          />
        </div>
      </div>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={t("sales.title")}
          density="compact"
          columns={shownCols.length ? shownCols : columns}
          rows={display}
          sort={table.sort}
          onSortChange={table.onSortChange}
          pagination={table.pagination}
          rowKey={(x) => (x.level === 1 ? `${x.parent ?? ""}|${x.key}` : x.key)}
          loading={report.isLoading}
          onRowClick={
            groupBy2
              ? (x) => {
                  if (x.level === 0) {
                    setExpanded((e) => (e.includes(x.key) ? e.filter((k) => k !== x.key) : [...e, x.key]));
                    return;
                  }
                  const href = canOpenOrders ? salesRowHref(groupBy2, x, { from, to }, r?.mineOnly ?? false) : null;
                  if (href) router.push(href);
                }
              : canOpenOrders && groupBy !== "BRANCH"
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

/** QQS rejimi segmenti (prototip Reports: kulrang fon, tanlangani oq). */
function VatSegment(props: { label: string; items: { key: VatMode; label: string }[]; value: VatMode; onChange: (v: VatMode) => void }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex rounded-control border border-border bg-background p-0.5">
      {props.items.map((x) => (
        <button
          key={x.key}
          type="button"
          role="radio"
          aria-checked={x.key === props.value}
          onClick={() => props.onChange(x.key)}
          className={cn(
            "rounded-[6px] px-3 py-1 text-[12.5px] font-medium",
            x.key === props.value ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary",
          )}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}
