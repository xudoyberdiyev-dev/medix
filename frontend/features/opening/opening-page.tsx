"use client";

import { Ban, CircleCheck, FilePen, PackageOpen, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { OPENING_CREATE, OPENING_GOODS, STATUS_LABELS, useOpenings, type OpeningStatus, type OpeningSummary } from "./api";
import { OpeningDrawer } from "./opening-drawer";

export function OpeningStatusBadge({ status }: { status: OpeningStatus }) {
  const t = useTranslations("opening.status");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(status)}
    </Badge>
  );
}

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** Boshlangʻich qoldiq (BQ) hujjatlari — SmartUp dan oʻtishda omborlardagi tovar qoldigʻi. */
export function OpeningPage() {
  const t = useTranslations("opening");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const allowed = canAny(me.data, ["opening.list", "opening.view"]);
  const canCreate = can(me.data, OPENING_CREATE) && can(me.data, OPENING_GOODS);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useOpenings(branchId, (status as OpeningStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const columns: TableColumn<OpeningSummary>[] = [
    { key: "number", title: t("list.number"), mono: true },
    { key: "warehouse", title: t("list.warehouse") },
    { key: "cutoffDate", title: t("list.cutoffDate"), render: (d) => day(d.cutoffDate) },
    {
      key: "lines",
      title: t("list.lines"),
      align: "right",
      render: (d) => (
        <span className="flex items-center justify-end gap-2">
          {d.source === "IMPORT" ? <Badge tone="info">Excel</Badge> : null}
          <span className="tabular-nums">{formatQuantity(d.lines)}</span>
        </span>
      ),
    },
    {
      key: "totalQty",
      title: t("list.qty"),
      align: "right",
      render: (d) => <span className="tabular-nums">{formatQuantity(d.totalQty)}</span>,
    },
    ...((docs.data?.items ?? []).some((d) => d.totalCost != null)
      ? [
          {
            key: "totalCost",
            title: t("list.totalCost"),
            align: "right" as const,
            render: (d: OpeningSummary) => <span className="tabular-nums">{d.totalCost ? formatMoney(d.totalCost) : ""}</span>,
          },
        ]
      : []),
    { key: "createdBy", title: t("list.createdBy") },
    { key: "status", title: t("list.status"), render: (d) => <OpeningStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setEditor({ id: null })}>
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
          onRowClick={(d) => setEditor({ id: d.id })}
          toolbar={
            <div className="w-56">
              <Select
                label={t("list.status")}
                size="sm"
                value={status}
                onChange={(v) => (setStatus(v), setPage(1))}
                placeholder={t("list.allStatuses")}
                className="[&>span:first-child]:sr-only"
                options={(Object.keys(STATUS_LABELS) as OpeningStatus[]).map((value) => ({ value, label: t(`status.${value}`) }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={PackageOpen}
                title={t("list.emptyTitle")}
                description={t("list.emptyDescription")}
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setEditor({ id: null })}>
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
      {editor ? (
        <OpeningDrawer id={editor.id} onClose={() => setEditor(null)} onCreated={(id) => setEditor({ id })} canEdit={canCreate} />
      ) : null}
    </>
  );
}
