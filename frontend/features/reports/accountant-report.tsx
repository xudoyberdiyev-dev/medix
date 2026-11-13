"use client";

import { useQuery } from "@tanstack/react-query";
import { FileCheck2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker } from "@/features/home/period-picker";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { rowField, useClientTable } from "@/lib/client-table";
import { reportHref } from "@/lib/saved-reports";
import { useBranchStore } from "@/lib/stores/branch";
import { ReportActions, ReportCrumbs, useReportPeriod } from "./saved-reports";
import { formatMinutes } from "./worker-report";

type AccountantRow = components["schemas"]["AccountantRow"];
const NO_ROWS: AccountantRow[] = [];

export function accountantExportHref(f: { branchId: number | null; from: string; to: string }): string {
  const p = new URLSearchParams();
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  return `/api/reports/accountants/export?${p.toString()}`;
}

const num = (v: number) => <span className="font-mono tabular-nums">{v}</span>;

/** O10f «Buxgalter natijasi»: yuborilgan fakturalar, oʻrtacha vaqt, kechikkanlar, hozirgi navbat; .xlsx. */
export function AccountantReportPage() {
  const t = useTranslations("reports");
  const title = t("accountants.title");
  const fmt = (m: number) =>
    formatMinutes(m, {
      minutes: (x) => t("minutes", { m: x }),
      hoursMinutes: (h, x) => t("hoursMinutes", { h, m: x }),
    });
  const me = useMe();
  const allowed = can(me.data, "invoices.view");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = useReportPeriod();
  const { from, to } = period.range;
  const report = useQuery({
    queryKey: ["reports", "accountants", branchId, from, to],
    queryFn: () =>
      unwrap(
        api.GET("/api/reports/accountants", {
          params: { query: { branchId: branchId ?? undefined, from: from ?? undefined, to: to ?? undefined } },
        }),
      ),
    enabled: allowed && !!from && !!to,
  });
  const table = useClientTable(report.data?.rows ?? NO_ROWS, { value: (x, key) => rowField(x, key) });

  if (me.data && !allowed) return <ForbiddenState description={t("accountants.forbidden")} />;
  const r = report.data;
  const columns: TableColumn<AccountantRow>[] = [
    { key: "name", sortable: true, title: t("accountants.person") },
    { key: "sent", sortable: true, title: t("accountants.sent"), align: "right", render: (x) => num(x.sent) },
    { key: "avgMinutes", sortable: true, title: t("accountants.avgMinutes"), align: "right", render: (x) => fmt(x.avgMinutes) },
    {
      key: "late",
      sortable: true,
      title: t("accountants.late"),
      align: "right",
      render: (x) => <span className={`font-mono tabular-nums ${x.late > 0 ? "text-warning" : ""}`}>{x.late}</span>,
    },
  ];
  const totals = r
    ? { name: t("total"), sent: num(r.total.sent), avgMinutes: fmt(r.total.avgMinutes), late: num(r.total.late) }
    : undefined;

  return (
    <>
      <ReportCrumbs title={title} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{title}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker state={period} />
          <ReportActions
            href={reportHref("/reports/accountants", period.preset)}
            defaultName={title}
            exportHref={from && to ? accountantExportHref({ branchId, from, to }) : null}
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4 text-caption text-text-secondary">
        {r ? (
          <span data-testid="accountants-queue">
            {t("accountants.queue", { n: r.queue })}
            {r.queueLate > 0 ? <span className="text-danger"> · {t("accountants.queueLate", { n: r.queueLate })}</span> : null}
          </span>
        ) : (
          <span />
        )}
        {r ? (
          <span>
            {r.from === r.to ? formatIsoDate(r.from) : `${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}
            {r.branchId == null ? ` · ${t("allBranches")}` : ""}
          </span>
        ) : null}
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
          rowKey={(x) => String(x.employeeId)}
          loading={report.isLoading}
          totals={r && r.rows.length > 0 ? totals : undefined}
          emptyState={<EmptyState icon={FileCheck2} title={t("accountants.empty")} description={t("emptyHint")} />}
        />
      )}
      <p className="mt-2 text-caption text-text-secondary">{t("accountants.note")}</p>
    </>
  );
}
