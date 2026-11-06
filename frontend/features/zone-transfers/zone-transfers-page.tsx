"use client";

import { ArrowRightLeft, CircleCheck, Clock, Plus, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  TRANSFER_VIEW_KEYS,
  TRANSFER_ZK,
  ZK_STATUS_LABELS,
  useZoneTransfers,
  type ZoneTransferStatus,
  type ZoneTransferSummary,
} from "./api";
import { ZoneTransferDrawer } from "./zone-transfer-drawer";

export function ZoneTransferStatusBadge({ status }: { status: ZoneTransferStatus }) {
  const map = {
    PENDING: { tone: "warning", icon: Clock },
    POSTED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {ZK_STATUS_LABELS[status]}
    </Badge>
  );
}

/** ZK — zona koʻchirishlari (bitta ombor ichida). Karantindan sotuvga — tasdiq bilan. */
export function ZoneTransfersPage() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id> — hujjat darhol ochiladi
  const [open, setOpen] = useState<{ id: number | null } | null>(() => {
    const id = Number(params.get("open"));
    return Number.isInteger(id) && id > 0 ? { id } : null;
  });
  const allowed = canAny(me.data, TRANSFER_VIEW_KEYS);
  const canCreate = can(me.data, TRANSFER_ZK);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useZoneTransfers(branchId, (status as ZoneTransferStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const columns: TableColumn<ZoneTransferSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "createdAt", title: "Sana", render: (d) => formatDateTime(new Date(d.createdAt)) },
    { key: "warehouse", title: "Ombor" },
    {
      key: "route",
      title: "Qayerdan → qayerga",
      render: (d) => (
        <span className="flex items-center gap-1">
          {d.from.name}
          <ArrowRightLeft size={14} strokeWidth={1.5} aria-label="dan" className="text-text-secondary" />
          {d.to.name}
        </span>
      ),
    },
    { key: "lines", title: "Qatorlar", align: "right", render: (d) => formatQuantity(d.lines) },
    { key: "qty", title: "Miqdor", align: "right", render: (d) => formatQuantity(d.qty) },
    { key: "createdBy", title: "Kiritdi" },
    { key: "status", title: "Holat", render: (d) => <ZoneTransferStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Zona koʻchirishlari</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setOpen({ id: null })}>
            Koʻchirish
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption="Zona koʻchirishlari"
          columns={columns}
          rows={docs.data?.items ?? []}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => setOpen({ id: d.id })}
          toolbar={
            <div className="w-56">
              <Select
                label="Holat"
                size="sm"
                value={status}
                onChange={(v) => (setStatus(v), setPage(1))}
                placeholder="Barcha holatlar"
                className="[&>span:first-child]:sr-only"
                options={Object.entries(ZK_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={ArrowRightLeft}
                title="Hali zona koʻchirishi yoʻq"
                description="Tovarni bitta ombor ichida bir zonadan boshqasiga oʻtkazing. Karantindan sotuvga — tasdiq bilan."
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setOpen({ id: null })}>
                      Koʻchirish
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
      {open ? <ZoneTransferDrawer id={open.id} onClose={() => setOpen(null)} onCreated={(id) => setOpen({ id })} /> : null}
    </>
  );
}
