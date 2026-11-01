"use client";

import { Ban, CircleCheck, FilePen, PackageOpen, Plus } from "lucide-react";
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
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** Boshlangʻich qoldiq (BQ) hujjatlari — SmartUp dan oʻtishda omborlardagi tovar qoldigʻi. */
export function OpeningPage() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const allowed = canAny(me.data, ["opening.list", "opening.view"]);
  const canCreate = can(me.data, OPENING_CREATE) && can(me.data, OPENING_GOODS);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useOpenings(branchId, (status as OpeningStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const columns: TableColumn<OpeningSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "warehouse", title: "Ombor" },
    { key: "cutoffDate", title: "Qoldiq sanasi", render: (d) => day(d.cutoffDate) },
    {
      key: "lines",
      title: "Qatorlar",
      align: "right",
      render: (d) => (
        <span className="flex items-center justify-end gap-2">
          {d.source === "IMPORT" ? <Badge tone="info">Excel</Badge> : null}
          <span className="tabular-nums">{formatQuantity(d.lines)}</span>
        </span>
      ),
    },
    { key: "totalQty", title: "Miqdor", align: "right", render: (d) => <span className="tabular-nums">{formatQuantity(d.totalQty)}</span> },
    ...((docs.data?.items ?? []).some((d) => d.totalCost != null)
      ? [
          {
            key: "totalCost",
            title: "Tannarx boʻyicha summa",
            align: "right" as const,
            render: (d: OpeningSummary) => <span className="tabular-nums">{d.totalCost ? formatMoney(d.totalCost) : ""}</span>,
          },
        ]
      : []),
    { key: "createdBy", title: "Kiritdi" },
    { key: "status", title: "Holat", render: (d) => <OpeningStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Boshlangʻich qoldiq</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setEditor({ id: null })}>
            Qoldiq kiritish
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption="Boshlangʻich qoldiq hujjatlari"
          columns={columns}
          rows={docs.data?.items ?? []}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => setEditor({ id: d.id })}
          toolbar={
            <div className="w-56">
              <Select
                label="Holat"
                size="sm"
                value={status}
                onChange={(v) => (setStatus(v), setPage(1))}
                placeholder="Barcha holatlar"
                className="[&>span:first-child]:sr-only"
                options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={PackageOpen}
                title="Hali boshlangʻich qoldiq kiritilmagan"
                description="Oldingi tizimdagi qoldiqni omborlar boʻyicha kiriting yoki Excelʼdan yuklang. Oʻtkazilgan hujjat qoldiqqa kiradi."
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setEditor({ id: null })}>
                      Qoldiq kiritish
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
