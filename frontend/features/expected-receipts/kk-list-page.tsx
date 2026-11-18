"use client";

import { AlertTriangle, CircleCheck, CircleDashed, FileEdit, Plus, Truck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { matchesQuery, useStatusCounts } from "@/lib/use-status-counts";
import { KK_CREATE, KK_STATUSES, KK_VIEW_KEYS, useExpectedReceipts, type KkStatus, type KkSummary } from "./api";

export const kkDay = (iso: string | null | undefined) => (iso ? formatDate(new Date(`${iso}T00:00:00+05:00`)) : "—");

export function KkStatusBadge({ status }: { status: KkStatus }) {
  const t = useTranslations("expectedReceipts");
  const map = {
    DRAFT: { tone: "neutral", icon: FileEdit },
    IN_TRANSIT: { tone: "info", icon: Truck },
    PARTIAL: { tone: "warning", icon: CircleDashed },
    RECEIVED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

export function KkLateBadge() {
  const t = useTranslations("expectedReceipts");
  return (
    <Badge tone="danger" icon={AlertTriangle}>
      {t("late")}
    </Badge>
  );
}

/** KK — kutilayotgan kirimlar (yuk xati): yoʻldagi tovar, qarz yuk xati olingan kundan (O15). */
export function ExpectedReceiptsPage() {
  const t = useTranslations("expectedReceipts");
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [late, setLate] = useState(params.get("late") === "true");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const allowed = canAny(me.data, KK_VIEW_KEYS);
  const canCreate = can(me.data, KK_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useExpectedReceipts({ branchId, status: (status as KkStatus | null) ?? null, open: false, late, page }, allowed);
  const counts = useStatusCounts(
    ["expected-receipts", branchId],
    KK_STATUSES,
    (st) =>
      unwrap(
        api.GET("/api/expected-receipts", { params: { query: { branchId: branchId ?? undefined, status: st ?? undefined, size: 1 } } }),
      ).then((r) => r.total),
    allowed,
  );

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const showAmount = (docs.data?.items ?? []).some((d) => d.totalAmount != null);
  const columns: TableColumn<KkSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    {
      key: "waybill",
      title: t("col.waybill"),
      render: (d) => (
        <span className="flex flex-col">
          <span className="font-mono">{d.waybillNumber}</span>
          <span className="text-caption text-text-secondary">{kkDay(d.waybillDate)}</span>
        </span>
      ),
    },
    { key: "supplier", title: t("col.supplier"), wrap: true, render: (d) => <span className="font-medium">{d.supplier}</span> },
    { key: "warehouse", title: t("col.warehouse") },
    {
      key: "expectedDate",
      title: t("col.expected"),
      render: (d) => (
        <span className="flex items-center gap-2">
          {kkDay(d.expectedDate)}
          {d.late ? <KkLateBadge /> : null}
        </span>
      ),
    },
    {
      key: "qty",
      title: t("col.qty"),
      align: "right",
      render: (d) => (
        <span className="tabular-nums">
          {formatQuantity(d.receivedQty)} / {formatQuantity(d.qty)}
        </span>
      ),
    },
    ...(showAmount
      ? [
          {
            key: "totalAmount",
            title: t("col.amount"),
            align: "right" as const,
            render: (d: KkSummary) => (d.totalAmount != null ? formatMoney(d.totalAmount) : "—"),
          },
        ]
      : []),
    { key: "payment", title: t("col.payment"), render: (d) => t(`payment.${d.paymentKind}`) },
    { key: "status", title: t("col.status"), render: (d) => <KkStatusBadge status={d.status} /> },
  ];
  const filtered = status !== null || late || q.trim() !== "";
  const rows = (docs.data?.items ?? []).filter((d) => matchesQuery(q, [d.number, d.supplier, d.waybillNumber, d.invoiceNumber ?? ""]));

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("listTitle")}
          {counts.all != null ? <span className="tabular text-body text-text-secondary">{formatQuantity(counts.all)}</span> : null}
        </h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => router.push("/expected-receipts/new")}>
            {t("create")}
          </Button>
        ) : null}
      </div>
      <div className="mb-3">
        <Tabs
          aria-label={t("filter.status")}
          value={status ?? "all"}
          onChange={(k) => (setStatus(k === "all" ? null : k), setPage(1))}
          items={[
            { key: "all", label: t("filter.all"), count: counts.all },
            ...KK_STATUSES.map((k) => ({ key: k, label: t(`status.${k}`), count: counts.of(k) })),
          ]}
        />
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption={t("caption")}
          columns={columns}
          rows={rows}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => router.push(`/expected-receipts/${d.id}`)}
          toolbar={
            <div className="flex items-center gap-4">
              <div className="w-72">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  className="[&>label]:sr-only"
                  value={q}
                  onChange={setQ}
                  placeholder={t("search")}
                />
              </div>
              <Checkbox label={t("filter.late")} checked={late} onChange={(v) => (setLate(v), setPage(1))} />
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setStatus(null), setLate(false), setQ(""))} />
            ) : (
              <EmptyState
                icon={Truck}
                title={t("empty.title")}
                description={t("empty.description")}
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => router.push("/expected-receipts/new")}>
                      {t("create")}
                    </Button>
                  ) : undefined
                }
              />
            )
          }
          pagination={
            docs.data && docs.data.total > 50
              ? {
                  page,
                  pageSize: 50,
                  total: docs.data.total,
                  onPageChange: setPage,
                  onPageSizeChange: () => undefined,
                  pageSizeOptions: [50],
                }
              : undefined
          }
        />
      )}
    </>
  );
}
