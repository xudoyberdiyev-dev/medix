"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, PackageCheck, ScanBarcode } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker, usePeriodState } from "@/features/home/period-picker";
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
    title: "Yigʻuvchilar natijasi",
    person: "Yigʻuvchi",
    units: "Dona",
    extra: "FEFOʻdan chetlashish",
    icon: PackageCheck,
    empty: "Davrda yakunlangan yigʻish yoʻq",
  },
  MARKERS: {
    path: "/api/reports/markers",
    perm: "reports.markers",
    title: "Markirovkachilar natijasi",
    person: "Markirovkachi",
    units: "Kodlar",
    extra: "Olib tashlangan kodlar",
    icon: ScanBarcode,
    empty: "Davrda yakunlangan markirovka yoʻq",
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

/** Daqiqani oʻqiladigan koʻrinishda: 45 daq, 2 soat 05 daq. */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} daq`;
  return `${Math.floor(m / 60)} soat ${String(m % 60).padStart(2, "0")} daq`;
}

const num = (v: number | undefined | null) => <span className="font-mono tabular-nums">{v ?? "—"}</span>;

/** Yigʻuvchilar / Markirovkachilar natijasi: xodim boʻyicha buyurtmalar, vaqt (berilgan / haqiqiy), vaqtida / kechikkan, .xlsx. */
export function WorkerReportPage({ kind }: { kind: WorkerKind }) {
  const k = KIND[kind];
  const me = useMe();
  const allowed = can(me.data, k.perm);
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState();
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

  if (me.data && !allowed) return <ForbiddenState description={`${k.title} sizning rolingiz uchun yopiq.`} />;
  const r = report.data;
  const extra = (x: WorkerRow) => (kind === "PICKERS" ? x.fefoDeviations : x.removedCodes);
  const columns: TableColumn<WorkerRow>[] = [
    { key: "name", sortable: true, title: k.person },
    { key: "orders", sortable: true, title: "Buyurtmalar", align: "right", render: (x) => num(x.orders) },
    { key: "lines", sortable: true, title: "Qatorlar", align: "right", render: (x) => num(x.lines) },
    { key: "units", sortable: true, title: k.units, align: "right", render: (x) => num(x.units) },
    { key: "givenMinutes", sortable: true, title: "Berilgan vaqt", align: "right", render: (x) => formatMinutes(x.givenMinutes) },
    { key: "actualMinutes", sortable: true, title: "Haqiqiy vaqt", align: "right", render: (x) => formatMinutes(x.actualMinutes) },
    { key: "avgMinutes", sortable: true, title: "Oʻrtacha / buyurtma", align: "right", render: (x) => formatMinutes(x.avgMinutes) },
    { key: "onTime", sortable: true, title: "Vaqtida", align: "right", render: (x) => num(x.onTime) },
    {
      key: "late",
      sortable: true,
      title: "Kechikkan",
      align: "right",
      render: (x) => <span className={`font-mono tabular-nums ${x.late > 0 ? "text-warning" : ""}`}>{x.late}</span>,
    },
    { key: "extra", sortable: true, title: k.extra, align: "right", render: (x) => num(extra(x)) },
  ];
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: "Jami",
        orders: num(r.total.orders),
        lines: num(r.total.lines),
        units: num(r.total.units),
        givenMinutes: formatMinutes(r.total.givenMinutes),
        actualMinutes: formatMinutes(r.total.actualMinutes),
        avgMinutes: formatMinutes(r.total.avgMinutes),
        onTime: num(r.total.onTime),
        late: num(r.total.late),
        extra: num(extra(r.total)),
      }
    : undefined;

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-caption text-text-secondary hover:underline">
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> Hisobotlar
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{k.title}</h1>
        <PeriodPicker state={period} />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-4 text-caption text-text-secondary">
        {r ? (
          <span>
            {r.from === r.to ? formatIsoDate(r.from) : `${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}
            {r.branchId == null ? " · barcha filiallar" : ""}
          </span>
        ) : null}
        {from && to ? (
          <a
            href={workerExportHref(kind, { branchId, from, to })}
            download
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Download size={16} strokeWidth={1.5} aria-hidden /> Excelʼga yuklab olish
          </a>
        ) : null}
      </div>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={k.title}
          density="compact"
          columns={columns}
          rows={table.rows}
          sort={table.sort}
          onSortChange={table.onSortChange}
          pagination={table.pagination}
          rowKey={(x) => String(x.employeeId)}
          loading={report.isLoading}
          totals={r && r.rows.length > 0 ? totals : undefined}
          emptyState={<EmptyState icon={k.icon} title={k.empty} description="Boshqa davrni tanlang yoki filialni oʻzgartiring." />}
        />
      )}
      <p className="mt-2 text-caption text-text-secondary">
        Ish yakunlangan sana boʻyicha. «Vaqtida» va «Kechikkan» — faqat Ombor mudiri vaqt bergan buyurtmalar.
      </p>
    </>
  );
}
