"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { opsFilterHref } from "@/features/cash/api";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker } from "@/features/home/period-picker";
import { reportHref } from "@/lib/saved-reports";
import { SaveReportButton, useReportPeriod } from "./saved-reports";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useClientTable } from "@/lib/client-table";
import { useBranchStore } from "@/lib/stores/branch";

type Row = components["schemas"]["ExpenseRow"];
export type ExpenseGroupBy = components["schemas"]["ExpenseReportView"]["groupBy"];
export type ExpenseDirection = components["schemas"]["ExpenseReportView"]["direction"];
const NO_ROWS: Row[] = [];
export const EXPENSE_GROUPS: ExpenseGroupBy[] = ["ITEM", "BRANCH", "MONTH", "DAY"];

/** .xlsx eksport havolasi — jadvaldagi filtrlar bilan. */
export function expenseExportHref(f: {
  branchId: number | null;
  from: string;
  to: string;
  direction: ExpenseDirection;
  groupBy: ExpenseGroupBy;
}): string {
  const p = new URLSearchParams();
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  p.set("direction", f.direction);
  p.set("groupBy", f.groupBy);
  return `/api/reports/expenses/export?${p.toString()}`;
}

/** URL: ?direction=IN — boshqa kirimlar; aks holda xarajatlar. */
export function initialDirection(raw: string | null): ExpenseDirection {
  return raw === "IN" ? "IN" : "OUT";
}

const money = (v: string) => <span className="font-mono tabular-nums">{formatMoney(v)}</span>;

/** Xarajatlar hisoboti (SPEC 8): oʻtkazilgan KO/BO modda / filial / oy / kun boʻyicha; Naqd / Bank / Terminal, jami, .xlsx. */
export function ExpenseReportPage() {
  const t = useTranslations("reports");
  const me = useMe();
  const allowed = can(me.data, "reports.all") || can(me.data, "reports.view");
  const router = useRouter();
  const canOpenOps = can(me.data, "cash.view") || can(me.data, "bank.view");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = useReportPeriod();
  const { from, to } = period.range;
  const params = useSearchParams();
  const [direction, setDirection] = useState<ExpenseDirection>(() => initialDirection(params.get("direction")));
  const [groupBy, setGroupBy] = useState<ExpenseGroupBy>("ITEM");
  const groups = EXPENSE_GROUPS.filter((g) => g !== "BRANCH" || me.data?.allBranches);
  const report = useQuery({
    queryKey: ["reports", "expenses", branchId, from, to, direction, groupBy],
    queryFn: () =>
      unwrap(
        api.GET("/api/reports/expenses", {
          params: { query: { branchId: branchId ?? undefined, from: from ?? undefined, to: to ?? undefined, direction, groupBy } },
        }),
      ),
    enabled: allowed && !!from && !!to,
  });
  const table = useClientTable(report.data?.rows ?? NO_ROWS);

  if (me.data && !allowed) return <ForbiddenState description={t("expenses.forbidden")} />;
  const r = report.data;
  const columns: TableColumn<Row>[] = [
    { key: "name", sortable: true, title: t(`expenses.group.${groupBy}`) },
    {
      key: "ops",
      sortable: true,
      title: t("expenses.ops"),
      align: "right",
      render: (x) => <span className="font-mono tabular-nums">{x.ops}</span>,
    },
    { key: "cash", sortable: true, title: t("expenses.cash"), align: "right", render: (x) => money(x.cash) },
    { key: "transfer", sortable: true, title: t("expenses.transfer"), align: "right", render: (x) => money(x.transfer) },
    { key: "online", sortable: true, title: t("expenses.online"), align: "right", render: (x) => money(x.online) },
    { key: "total", sortable: true, title: t("total"), align: "right", render: (x) => money(x.total) },
  ];
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: t("total"),
        ops: <span className="font-mono tabular-nums">{r.total.ops}</span>,
        cash: money(r.total.cash),
        transfer: money(r.total.transfer),
        online: money(r.total.online),
        total: money(r.total.total),
      }
    : undefined;
  const title = t(`expenses.title.${direction}`);

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-caption text-text-secondary hover:underline">
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> {t("back")}
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{title}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker state={period} />
          <SaveReportButton href={reportHref("/reports/expenses", period.preset, { direction })} defaultName={title} />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            aria-label={t("expenses.direction")}
            items={(["OUT", "IN"] as const).map((d) => ({ key: d, label: t(`expenses.title.${d}`) }))}
            value={direction}
            onChange={(k) => setDirection(k as ExpenseDirection)}
          />
          <Tabs
            aria-label={t("sales.groupBy")}
            items={groups.map((g) => ({ key: g, label: t(`expenses.group.${g}`) }))}
            value={groupBy}
            onChange={(k) => setGroupBy(k as ExpenseGroupBy)}
          />
        </div>
        <div className="flex items-center gap-4 text-caption text-text-secondary">
          {r ? (
            <span>
              {r.from === r.to ? formatIsoDate(r.from) : `${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}
              {r.branchId == null ? ` · ${t("allBranches")}` : ""}
            </span>
          ) : null}
          {from && to ? (
            <a
              href={expenseExportHref({ branchId, from, to, direction, groupBy })}
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
          caption={title}
          density="compact"
          columns={columns}
          rows={table.rows}
          sort={table.sort}
          onSortChange={table.onSortChange}
          pagination={table.pagination}
          rowKey={(x) => x.key}
          loading={report.isLoading}
          onRowClick={
            canOpenOps && r && groupBy === "ITEM"
              ? (x) => router.push(opsFilterHref({ expenseItemId: Number(x.key), item: x.name, from: r.from, to: r.to }))
              : undefined
          }
          totals={r && r.rows.length > 0 ? totals : undefined}
          emptyState={<EmptyState icon={Wallet} title={t(`expenses.empty.${direction}`)} description={t("emptyHint")} />}
        />
      )}
      <p className="mt-2 text-caption text-text-secondary">{t("expenses.note")}</p>
    </>
  );
}
