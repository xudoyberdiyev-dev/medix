"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, PackageCheck, ScanBarcode } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker } from "@/features/home/period-picker";
import { reportHref } from "@/lib/saved-reports";
import { ReportActions, useReportPeriod } from "./saved-reports";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { rowField, useClientTable } from "@/lib/client-table";
import { useBranchStore } from "@/lib/stores/branch";

type WorkerRow = components["schemas"]["WorkerRow"];
const NO_ROWS: WorkerRow[] = [];
export type WorkerKind = components["schemas"]["WorkerReportView"]["kind"];

const KIND = {
  PICKERS: {
    path: "/api/reports/pickers",
    perm: "reports.pickers",
    icon: PackageCheck,
  },
  MARKERS: {
    path: "/api/reports/markers",
    perm: "reports.markers",
    icon: ScanBarcode,
  },
} as const;

/** .xlsx eksport havolasi — sahifadagi filtrlar bilan. */
export function workerExportHref(kind: WorkerKind, f: { branchId: number | null; from: string; to: string }): string {
  const p = new URLSearchParams();
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  return `${KIND[kind].path}/export?${p.toString()}`;
}

/** Daqiqani oʻqiladigan koʻrinishda: 45 daq, 2 soat 05 daq. `labels` — tarjima (standart: uz-Latn). */
export function formatMinutes(
  m: number,
  labels: { minutes: (m: number) => string; hoursMinutes: (h: number, m: string) => string } = {
    minutes: (x) => `${x} daq`,
    hoursMinutes: (h, x) => `${h} soat ${x} daq`,
  },
): string {
  if (m < 60) return labels.minutes(m);
  return labels.hoursMinutes(Math.floor(m / 60), String(m % 60).padStart(2, "0"));
}

const num = (v: number | undefined | null) => <span className="font-mono tabular-nums">{v ?? "—"}</span>;

/** Yigʻuvchilar / Markirovkachilar natijasi: xodim boʻyicha buyurtmalar, vaqt (berilgan / haqiqiy), vaqtida / kechikkan, .xlsx. */
export function WorkerReportPage({ kind }: { kind: WorkerKind }) {
  const t = useTranslations("reports");
  const k = KIND[kind];
  const title = t(`worker.${kind}.title`);
  const labels = {
    minutes: (m: number) => t("minutes", { m }),
    hoursMinutes: (h: number, m: string) => t("hoursMinutes", { h, m }),
  };
  const fmt = (m: number) => formatMinutes(m, labels);
  const me = useMe();
  const allowed = can(me.data, k.perm);
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = useReportPeriod();
  const { from, to } = period.range;
  const report = useQuery({
    queryKey: ["reports", kind, branchId, from, to],
    queryFn: () =>
      unwrap(api.GET(k.path, { params: { query: { branchId: branchId ?? undefined, from: from ?? undefined, to: to ?? undefined } } })),
    enabled: allowed && !!from && !!to,
  });

  const table = useClientTable(report.data?.rows ?? NO_ROWS, {
    value: (x, key) => (key === "extra" ? (kind === "PICKERS" ? x.fefoDeviations : x.removedCodes) : rowField(x, key)),
  });

  if (me.data && !allowed) return <ForbiddenState description={t("worker.forbidden", { title })} />;
  const r = report.data;
  const extra = (x: WorkerRow) => (kind === "PICKERS" ? x.fefoDeviations : x.removedCodes);
  const columns: TableColumn<WorkerRow>[] = [
    { key: "name", sortable: true, title: t(`worker.${kind}.person`) },
    { key: "orders", sortable: true, title: t("orders"), align: "right", render: (x) => num(x.orders) },
    { key: "lines", sortable: true, title: t("worker.lines"), align: "right", render: (x) => num(x.lines) },
    { key: "units", sortable: true, title: t(`worker.${kind}.units`), align: "right", render: (x) => num(x.units) },
    { key: "givenMinutes", sortable: true, title: t("worker.givenMinutes"), align: "right", render: (x) => fmt(x.givenMinutes) },
    { key: "actualMinutes", sortable: true, title: t("worker.actualMinutes"), align: "right", render: (x) => fmt(x.actualMinutes) },
    { key: "avgMinutes", sortable: true, title: t("worker.avgMinutes"), align: "right", render: (x) => fmt(x.avgMinutes) },
    { key: "onTime", sortable: true, title: t("worker.onTime"), align: "right", render: (x) => num(x.onTime) },
    {
      key: "late",
      sortable: true,
      title: t("worker.late"),
      align: "right",
      render: (x) => <span className={`font-mono tabular-nums ${x.late > 0 ? "text-warning" : ""}`}>{x.late}</span>,
    },
    { key: "extra", sortable: true, title: t(`worker.${kind}.extra`), align: "right", render: (x) => num(extra(x)) },
  ];
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: t("total"),
        orders: num(r.total.orders),
        lines: num(r.total.lines),
        units: num(r.total.units),
        givenMinutes: fmt(r.total.givenMinutes),
        actualMinutes: fmt(r.total.actualMinutes),
        avgMinutes: fmt(r.total.avgMinutes),
        onTime: num(r.total.onTime),
        late: num(r.total.late),
        extra: num(extra(r.total)),
      }
    : undefined;

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-caption text-text-secondary hover:underline">
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> {t("back")}
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{title}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker state={period} />
          <ReportActions
            href={reportHref(kind === "PICKERS" ? "/reports/pickers" : "/reports/markers", period.preset)}
            defaultName={title}
            exportHref={from && to ? workerExportHref(kind, { branchId, from, to }) : null}
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-4 text-caption text-text-secondary">
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
          emptyState={<EmptyState icon={k.icon} title={t(`worker.${kind}.empty`)} description={t("emptyHint")} />}
        />
      )}
      <p className="mt-2 text-caption text-text-secondary">{t("worker.note")}</p>
    </>
  );
}
