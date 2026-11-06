"use client";

import { CircleCheck, Clock, FileMinus, Plus, ShieldAlert, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
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
  HC_REASON_LABELS,
  HC_STATUS_LABELS,
  HC_VIEW_KEYS,
  useWriteOffs,
  type WriteOffReason,
  type WriteOffStatus,
  type WriteOffSummary,
} from "./api";
import { WriteOffDrawer } from "./write-off-drawer";

export function WriteOffStatusBadge({ status }: { status: WriteOffStatus }) {
  const map = {
    PENDING: { tone: "warning", icon: Clock },
    POSTED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {HC_STATUS_LABELS[status]}
    </Badge>
  );
}

/** HC — hisobdan chiqarish: muddati oʻtgan, shikastlangan, kamomad. Tasdiq bilan; 5 000 000 dan katta — Direktor. */
export function WriteOffsPage() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [reason, setReason] = useState<string | null>(params.get("reason"));
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id> — hujjat darhol ochiladi
  const [open, setOpen] = useState<{ id: number | null } | null>(() => {
    const id = Number(params.get("open"));
    return Number.isInteger(id) && id > 0 ? { id } : null;
  });
  const allowed = canAny(me.data, HC_VIEW_KEYS);
  const canCreate = can(me.data, HC_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useWriteOffs(branchId, (status as WriteOffStatus | null) ?? null, (reason as WriteOffReason | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const showCost = (docs.data?.items ?? []).some((d) => d.totalCost != null);
  const columns: TableColumn<WriteOffSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "createdAt", title: "Sana", render: (d) => formatDateTime(new Date(d.createdAt)) },
    { key: "warehouse", title: "Ombor · zona", render: (d) => `${d.warehouse} · ${d.zone.name}` },
    { key: "reason", title: "Sabab", render: (d) => HC_REASON_LABELS[d.reason] },
    { key: "qty", title: "Miqdor", align: "right", render: (d) => formatQuantity(d.qty) },
    ...(showCost
      ? [
          {
            key: "totalCost",
            title: "Tannarx summasi",
            align: "right" as const,
            render: (d: WriteOffSummary) => (d.totalCost != null ? formatMoney(d.totalCost) : "—"),
          },
        ]
      : []),
    { key: "createdBy", title: "Kiritdi" },
    {
      key: "status",
      title: "Holat",
      render: (d) => (
        <span className="flex items-center gap-2">
          <WriteOffStatusBadge status={d.status} />
          {d.needsDirector && d.status === "PENDING" ? (
            <Badge tone="danger" icon={ShieldAlert}>
              Direktor
            </Badge>
          ) : null}
        </span>
      ),
    },
  ];
  const filtered = status !== null || reason !== null;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Hisobdan chiqarish</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setOpen({ id: null })}>
            Hisobdan chiqarish
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption="Hisobdan chiqarish hujjatlari"
          columns={columns}
          rows={docs.data?.items ?? []}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => setOpen({ id: d.id })}
          toolbar={
            <div className="flex gap-3">
              <div className="w-56">
                <Select
                  label="Holat"
                  size="sm"
                  value={status}
                  onChange={(v) => (setStatus(v), setPage(1))}
                  placeholder="Barcha holatlar"
                  className="[&>span:first-child]:sr-only"
                  options={Object.entries(HC_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div className="w-56">
                <Select
                  label="Sabab"
                  size="sm"
                  value={reason}
                  onChange={(v) => (setReason(v), setPage(1))}
                  placeholder="Barcha sabablar"
                  className="[&>span:first-child]:sr-only"
                  options={Object.entries(HC_REASON_LABELS).map(([value, label]) => ({ value, label }))}
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
                title="Hali hisobdan chiqarish yoʻq"
                description="Muddati oʻtgan, shikastlangan yoki kam chiqqan tovarni dalolatnoma bilan hisobdan chiqaring."
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setOpen({ id: null })}>
                      Hisobdan chiqarish
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
      {open ? <WriteOffDrawer id={open.id} onClose={() => setOpen(null)} onCreated={(id) => setOpen({ id })} /> : null}
    </>
  );
}
