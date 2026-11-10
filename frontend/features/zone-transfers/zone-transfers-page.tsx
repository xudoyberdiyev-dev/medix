"use client";

import { ArrowRightLeft, CircleCheck, Clock, Plus, XCircle } from "lucide-react";
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
import { formatDateTime, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { TRANSFER_VIEW_KEYS, TRANSFER_ZK, ZK_STATUSES, useZoneTransfers, type ZoneTransferStatus, type ZoneTransferSummary } from "./api";
import { HubTabs } from "@/components/shell/hub-tabs";

export function ZoneTransferStatusBadge({ status }: { status: ZoneTransferStatus }) {
  const t = useTranslations("zoneTransfers");
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

/** ZK — zona koʻchirishlari (bitta ombor ichida). Karantindan sotuvga — tasdiq bilan. */
export function ZoneTransfersPage() {
  const t = useTranslations("zoneTransfers");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [page, setPage] = useState(1);
  const router = useRouter();
  // «Koʻchirish» → «Yangi»: ?new=1 — yangi hujjat sahifasi; bildirishnomadan ?open=<id> — hujjat sahifasiga yoʻnaltiriladi
  const isNew = params.get("new") === "1";
  const openId = Number(params.get("open"));
  useEffect(() => {
    if (isNew) router.replace("/zone-transfers/new");
    else if (Number.isInteger(openId) && openId > 0) router.replace(`/zone-transfers/${openId}`);
  }, [isNew, openId, router]);
  const allowed = canAny(me.data, TRANSFER_VIEW_KEYS);
  const canCreate = can(me.data, TRANSFER_ZK);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useZoneTransfers(branchId, (status as ZoneTransferStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const columns: TableColumn<ZoneTransferSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    { key: "createdAt", title: t("col.date"), render: (d) => formatDateTime(new Date(d.createdAt)) },
    { key: "warehouse", title: t("col.warehouse") },
    {
      key: "route",
      title: t("col.route"),
      render: (d) => (
        <span className="flex items-center gap-1">
          {d.from.name}
          <ArrowRightLeft size={14} strokeWidth={1.5} aria-label={t("routeArrow")} className="text-text-secondary" />
          {d.to.name}
        </span>
      ),
    },
    { key: "lines", title: t("col.lines"), align: "right", render: (d) => formatQuantity(d.lines) },
    { key: "qty", title: t("col.qty"), align: "right", render: (d) => formatQuantity(d.qty) },
    { key: "createdBy", title: t("col.createdBy") },
    { key: "status", title: t("col.status"), render: (d) => <ZoneTransferStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <HubTabs hub="transfers" />
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => router.push("/zone-transfers/new")}>
            {t("create")}
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={docs.data?.items ?? []}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => router.push(`/zone-transfers/${d.id}`)}
          toolbar={
            <div className="w-56">
              <Select
                label={t("filter.status")}
                size="sm"
                value={status}
                onChange={(v) => (setStatus(v), setPage(1))}
                placeholder={t("filter.allStatuses")}
                className="[&>span:first-child]:sr-only"
                options={ZK_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={ArrowRightLeft}
                title={t("empty.title")}
                description={t("empty.description")}
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => router.push("/zone-transfers/new")}>
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
