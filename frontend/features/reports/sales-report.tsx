"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChartColumn, Download } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker, usePeriodState } from "@/features/home/period-picker";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useClientTable } from "@/lib/client-table";
import { useBranchStore } from "@/lib/stores/branch";

type SalesRow = components["schemas"]["SalesRow"];
const NO_ROWS: SalesRow[] = [];
export type GroupBy = components["schemas"]["SalesReportView"]["groupBy"];

export const GROUP_LABELS: Record<GroupBy, string> = { CUSTOMER: "Mijoz", OPERATOR: "Operator", BRANCH: "Filial", DAY: "Kun" };

/** .xlsx eksport havolasi — jadvaldagi filtrlar bilan. */
export function salesExportHref(f: { branchId: number | null; from: string; to: string; groupBy: GroupBy }): string {
  const p = new URLSearchParams();
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  p.set("groupBy", f.groupBy);
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
  const me = useMe();
  const router = useRouter();
  const allowed = can(me.data, "reports.all") || can(me.data, "reports.view") || can(me.data, "reports.own");
  const canOpenOrders = can(me.data, "orders.view");
  const fullScope = can(me.data, "reports.all") || can(me.data, "reports.view");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState();
  const { from, to } = period.range;
  const groups = (Object.keys(GROUP_LABELS) as GroupBy[]).filter((g) => fullScope || g === "CUSTOMER" || g === "DAY");
  const params = useSearchParams();
  // Ruxsatlar yuklangach URL'dagi guruh qoʻllanadi; foydalanuvchi tanlasa — oʻsha.
  const [picked, setGroupBy] = useState<GroupBy | null>(null);
  const groupBy = picked ?? initialGroupBy(params.get("groupBy"), groups);
  const report = useQuery({
    queryKey: ["reports", "sales", branchId, from, to, groupBy],
    queryFn: () =>
      unwrap(
        api.GET("/api/reports/sales", {
          params: { query: { branchId: branchId ?? undefined, from: from ?? undefined, to: to ?? undefined, groupBy } },
        }),
      ),
    enabled: allowed && !!from && !!to,
  });

  const table = useClientTable(report.data?.rows ?? NO_ROWS);

  if (me.data && !allowed) return <ForbiddenState description="Savdo hisoboti sizning rolingiz uchun yopiq." />;
  const r = report.data;
  const columns: TableColumn<SalesRow>[] = [
    { key: "name", sortable: true, title: GROUP_LABELS[groupBy] },
    {
      key: "orders",
      sortable: true,
      title: "Buyurtmalar",
      align: "right",
      render: (x) => <span className="font-mono tabular-nums">{x.orders}</span>,
    },
    { key: "sales", sortable: true, title: "Sotuv", align: "right", render: (x) => money(x.sales) },
    { key: "returns", sortable: true, title: "Qaytarish", align: "right", render: (x) => money(x.returns) },
    { key: "net", sortable: true, title: "Sof savdo (QQS bilan)", align: "right", render: (x) => money(x.net) },
  ];
  if (r?.costVisible) {
    columns.push(
      { key: "cost", title: "Tannarx", align: "right", render: (x) => money(x.cost) },
      { key: "profit", title: "Yalpi foyda (QQSsiz)", align: "right", render: (x) => money(x.profit) },
    );
  }
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: "Jami",
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
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> Hisobotlar
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">Savdo hisoboti</h1>
        <PeriodPicker state={period} />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          aria-label="Guruhlash"
          items={groups.map((g) => ({ key: g, label: GROUP_LABELS[g] }))}
          value={groupBy}
          onChange={(k) => setGroupBy(k as GroupBy)}
        />
        <div className="flex items-center gap-4 text-caption text-text-secondary">
          {r ? (
            <span>
              {r.from === r.to ? formatIsoDate(r.from) : `${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}
              {r.mineOnly ? " · faqat siz kiritgan buyurtmalar" : r.branchId == null ? " · barcha filiallar" : ""}
            </span>
          ) : null}
          {from && to ? (
            <a
              href={salesExportHref({ branchId, from, to, groupBy })}
              download
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Download size={16} strokeWidth={1.5} aria-hidden /> Excelʼga yuklab olish
            </a>
          ) : null}
        </div>
      </div>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption="Savdo hisoboti"
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
          emptyState={
            <EmptyState icon={ChartColumn} title="Davrda savdo yoʻq" description="Boshqa davrni tanlang yoki filialni oʻzgartiring." />
          }
        />
      )}
      {r?.truncated ? <p className="mt-2 text-caption text-warning">Faqat birinchi 5000 qator koʻrsatildi — davrni qisqartiring.</p> : null}
      <p className="mt-2 text-caption text-text-secondary">
        Sof savdo = sotuv − qaytarish; yetkazilmagan (bekor qilingan) sotuvlar kirmaydi.
      </p>
    </>
  );
}
