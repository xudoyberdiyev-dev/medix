"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScanBarcode } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { PageSize } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker } from "@/features/home/period-picker";
import { day } from "@/features/orders/orders-page";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime } from "@/lib/format";
import { reportHref } from "@/lib/saved-reports";
import { useBranchStore } from "@/lib/stores/branch";
import { ReportActions, ReportCrumbs, useReportPeriod } from "./saved-reports";

type ReportCode = components["schemas"]["ReportCode"];
type Owner = ReportCode["owner"];
type MarkStatus = ReportCode["status"];
export const MARKING_REPORT_PERMS = ["marking.view", "zcodes.view", "invoices.view"];
const STATUSES: MarkStatus[] = ["ACTIVE", "SOLD", "RETURNED", "RELEASED", "REMOVED"];

export type MarkingReportFilter = {
  branchId: number | null;
  from: string;
  to: string;
  owner: Owner | null;
  status: MarkStatus | null;
  q: string;
};

/** API soʻrov parametrlari (roʻyxat va .xlsx uchun bir xil). */
export function markingReportQuery(f: MarkingReportFilter) {
  return {
    branchId: f.branchId ?? undefined,
    from: f.from,
    to: f.to,
    owner: f.owner ?? undefined,
    status: f.status ?? undefined,
    q: f.q.trim() || undefined,
  };
}

export function markingReportExportHref(f: MarkingReportFilter): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(markingReportQuery(f))) if (v !== undefined) p.set(k, String(v));
  return `/api/reports/marking-codes/export?${p.toString()}`;
}

/** O10g «Markirovka kodlari» hisoboti: davr, egasi (mijoz / zaxira), holat, qidiruv (mijoz, mahsulot, GTIN, seriya, buyurtma); Excel. */
export function MarkingCodesReportPage() {
  const t = useTranslations("reports.markingCodes");
  const to = useTranslations("orders");
  const tr = useTranslations("reports");
  const me = useMe();
  const allowed = canAny(me.data, MARKING_REPORT_PERMS);
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = useReportPeriod();
  const [owner, setOwner] = useState<Owner | null>(null);
  const [status, setStatus] = useState<MarkStatus | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize>(50);
  const { from, to: until } = period.range;
  const f: MarkingReportFilter | null = from && until ? { branchId, from, to: until, owner, status, q } : null;
  const report = useQuery({
    queryKey: ["reports", "marking-codes", f, page, size],
    queryFn: () =>
      unwrap(api.GET("/api/reports/marking-codes", { params: { query: { ...markingReportQuery(f!), page: page - 1, size } } })),
    enabled: allowed && f !== null,
    placeholderData: keepPreviousData,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const title = t("title");
  const r = report.data;
  const filtered = q.trim() !== "" || owner !== null || status !== null;
  const reset = (fn: () => void) => (fn(), setPage(1));

  const columns: TableColumn<ReportCode>[] = [
    {
      key: "product",
      title: t("col.product"),
      render: (z) => (
        <div className="flex flex-col">
          <span className="font-medium">{z.productName}</span>
          <span className="font-mono text-caption text-text-secondary">
            {z.gtin} · {z.serial} · {z.kind === "BOX" ? "Q" : "D"}
          </span>
        </div>
      ),
    },
    {
      key: "batch",
      title: t("col.batch"),
      render: (z) => (
        <div className="flex flex-col">
          <span className="font-mono">{z.batch ?? "—"}</span>
          {z.expiryDate ? <span className="text-caption text-text-secondary">{day(z.expiryDate)}</span> : null}
        </div>
      ),
    },
    {
      key: "order",
      title: t("col.order"),
      render: (z) => (
        <div className="flex flex-col">
          <span className="font-mono">{z.orderNumber}</span>
          <span className="text-caption text-text-secondary">{z.customer}</span>
        </div>
      ),
    },
    ...(me.data?.allBranches ? [{ key: "branch", title: t("col.branch"), render: (z: ReportCode) => z.branch }] : []),
    { key: "owner", title: t("col.owner"), render: (z) => t(`owner.${z.owner}`) },
    {
      key: "status",
      title: t("col.status"),
      render: (z) => (
        <div className="flex flex-col items-start gap-0.5">
          <Badge tone={z.status === "SOLD" ? "success" : z.status === "ACTIVE" ? "info" : "neutral"}>
            {to(`marking.codeStatus.${z.status}`)}
          </Badge>
          {z.reserveStatus ? <span className="text-caption text-text-secondary">{t(`reserve.${z.reserveStatus}`)}</span> : null}
        </div>
      ),
    },
    { key: "scannedAt", title: t("col.scannedAt"), render: (z) => formatDateTime(new Date(z.scannedAt)) },
  ];

  return (
    <>
      <ReportCrumbs title={title} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{title}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker state={period} />
          <ReportActions
            href={reportHref("/reports/marking-codes", period.preset)}
            defaultName={title}
            exportHref={f ? markingReportExportHref(f) : null}
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4 text-caption text-text-secondary">
        {r ? (
          <span data-testid="marking-codes-summary">
            {t("summary", { customer: r.customerOwned, reserve: r.reserveOwned, sold: r.sold })}
          </span>
        ) : (
          <span />
        )}
        {r ? (
          <span>
            {r.from === r.to ? formatIsoDate(r.from) : `${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}
            {branchId == null ? ` · ${tr("allBranches")}` : ""}
          </span>
        ) : null}
      </div>
      {report.error ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={title}
          density="compact"
          columns={columns}
          rows={r?.items ?? []}
          rowKey={(z) => String(z.id)}
          loading={report.isLoading}
          toolbar={
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-80">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={q}
                  onChange={(v) => reset(() => setQ(v))}
                  placeholder={t("searchPlaceholder")}
                  className="[&>label]:sr-only"
                />
              </div>
              <div className="w-48">
                <Select
                  label={t("col.owner")}
                  size="sm"
                  value={owner}
                  onChange={(v) => reset(() => setOwner((v as Owner) || null))}
                  placeholder={t("all")}
                  options={(["CUSTOMER", "RESERVE"] as const).map((o) => ({ value: o, label: t(`owner.${o}`) }))}
                />
              </div>
              <div className="w-48">
                <Select
                  label={t("col.status")}
                  size="sm"
                  value={status}
                  onChange={(v) => reset(() => setStatus((v as MarkStatus) || null))}
                  placeholder={t("allActive")}
                  options={STATUSES.map((s) => ({ value: s, label: to(`marking.codeStatus.${s}`) }))}
                />
              </div>
            </div>
          }
          pagination={
            r
              ? {
                  page,
                  pageSize: size,
                  total: r.total,
                  onPageChange: setPage,
                  onPageSizeChange: (s) => (setSize(s), setPage(1)),
                }
              : undefined
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => reset(() => (setQ(""), setOwner(null), setStatus(null)))} />
            ) : (
              <EmptyState icon={ScanBarcode} title={t("empty")} description={tr("emptyHint")} />
            )
          }
        />
      )}
      <p className="mt-2 text-caption text-text-secondary">{t("note")}</p>
    </>
  );
}
