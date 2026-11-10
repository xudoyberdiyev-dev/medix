"use client";

import { CircleCheck, Clock, FileMinus, Plus, ShieldAlert, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  HC_CREATE,
  HC_REASONS,
  HC_STATUSES,
  HC_VIEW_KEYS,
  useWriteOffs,
  type WriteOffReason,
  type WriteOffStatus,
  type WriteOffSummary,
} from "./api";
import { HubTabs } from "@/components/shell/hub-tabs";

export function WriteOffStatusBadge({ status }: { status: WriteOffStatus }) {
  const t = useTranslations("writeOffs");
  const map = {
    PENDING: { tone: "warning", icon: Clock },
    POSTED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** HC — hisobdan chiqarish: muddati oʻtgan, shikastlangan, kamomad. Tasdiq bilan; 5 000 000 dan katta — Direktor. */
export function WriteOffsPage() {
  const t = useTranslations("writeOffs");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [reason, setReason] = useState<string | null>(params.get("reason"));
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id> — hujjat sahifasiga yoʻnaltiriladi (prototip StockDocs — toʻliq sahifa)
  const router = useRouter();
  const openId = Number(params.get("open"));
  useEffect(() => {
    if (Number.isInteger(openId) && openId > 0) router.replace(`/write-offs/${openId}`);
  }, [openId, router]);
  const allowed = canAny(me.data, HC_VIEW_KEYS);
  const canCreate = can(me.data, HC_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useWriteOffs(branchId, (status as WriteOffStatus | null) ?? null, (reason as WriteOffReason | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const showCost = (docs.data?.items ?? []).some((d) => d.totalCost != null);
  const columns: TableColumn<WriteOffSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    { key: "createdAt", title: t("col.date"), render: (d) => formatDateTime(new Date(d.createdAt)) },
    { key: "warehouse", title: t("col.warehouseZone"), render: (d) => `${d.warehouse} · ${d.zone.name}` },
    { key: "reason", title: t("col.reason"), render: (d) => t(`reason.${d.reason}`) },
    { key: "qty", title: t("col.qty"), align: "right", render: (d) => formatQuantity(d.qty) },
    ...(showCost
      ? [
          {
            key: "totalCost",
            title: t("col.totalCost"),
            align: "right" as const,
            render: (d: WriteOffSummary) => (d.totalCost != null ? formatMoney(d.totalCost) : "—"),
          },
        ]
      : []),
    { key: "createdBy", title: t("col.createdBy") },
    {
      key: "status",
      title: t("col.status"),
      render: (d) => (
        <span className="flex items-center gap-2">
          <WriteOffStatusBadge status={d.status} />
          {d.needsDirector && d.status === "PENDING" ? (
            <Badge tone="danger" icon={ShieldAlert}>
              {t("director")}
            </Badge>
          ) : null}
        </span>
      ),
    },
  ];
  const filtered = status !== null || reason !== null;

  return (
    <>
      <HubTabs hub="returns" />
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => router.push("/write-offs/new")}>
            {t("create")}
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption={t("caption")}
          columns={columns}
          rows={docs.data?.items ?? []}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => router.push(`/write-offs/${d.id}`)}
          toolbar={
            <div className="flex gap-3">
              <div className="w-56">
                <Select
                  label={t("filter.status")}
                  size="sm"
                  value={status}
                  onChange={(v) => (setStatus(v), setPage(1))}
                  placeholder={t("filter.allStatuses")}
                  className="[&>span:first-child]:sr-only"
                  options={HC_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
                />
              </div>
              <div className="w-56">
                <Select
                  label={t("filter.reason")}
                  size="sm"
                  value={reason}
                  onChange={(v) => (setReason(v), setPage(1))}
                  placeholder={t("filter.allReasons")}
                  className="[&>span:first-child]:sr-only"
                  options={HC_REASONS.map((value) => ({ value, label: t(`reason.${value}`) }))}
                />
              </div>
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setStatus(null), setReason(null))} />
            ) : (
              <EmptyState
                icon={FileMinus}
                title={t("empty.title")}
                description={t("empty.description")}
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => router.push("/write-offs/new")}>
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
