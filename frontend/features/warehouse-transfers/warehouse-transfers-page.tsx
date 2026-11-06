"use client";

import { ArrowRight, CircleCheck, FilePen, Plus, Truck, TriangleAlert, Warehouse, XCircle } from "lucide-react";
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
  OK_STATUS_LABELS,
  OK_VIEW_KEYS,
  TRANSFER_OK,
  useWarehouseTransfers,
  type WarehouseTransferStatus,
  type WarehouseTransferSummary,
} from "./api";
import { WarehouseTransferDrawer } from "./warehouse-transfer-drawer";

export function WarehouseTransferStatusBadge({ status }: { status: WarehouseTransferStatus }) {
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    IN_TRANSIT: { tone: "info", icon: Truck },
    RECEIVED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {OK_STATUS_LABELS[status]}
    </Badge>
  );
}

/** OK — ombor koʻchirishlari (bitta filial ichida): Qoralama → Yoʻlda → Qabul qilindi. */
export function WarehouseTransfersPage() {
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
  const allowed = canAny(me.data, OK_VIEW_KEYS);
  const canCreate = can(me.data, TRANSFER_OK);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useWarehouseTransfers(branchId, (status as WarehouseTransferStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const columns: TableColumn<WarehouseTransferSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "createdAt", title: "Sana", render: (d) => formatDateTime(new Date(d.createdAt)) },
    {
      key: "route",
      title: "Qayerdan → qayerga",
      wrap: true,
      render: (d) => (
        <span className="flex items-center gap-1">
          {d.fromWarehouse.name} · {d.fromZone.name}
          <ArrowRight size={14} strokeWidth={1.5} aria-label="dan" className="text-text-secondary" />
          {d.toWarehouse.name}
        </span>
      ),
    },
    { key: "lines", title: "Qatorlar", align: "right", render: (d) => formatQuantity(d.lines) },
    { key: "qty", title: "Miqdor", align: "right", render: (d) => formatQuantity(d.qty) },
    {
      key: "shortageQty",
      title: "Kamomad",
      align: "right",
      render: (d) =>
        d.shortageQty > 0 ? (
          <Badge tone="danger" icon={TriangleAlert}>
            {formatQuantity(d.shortageQty)}
          </Badge>
        ) : (
          "—"
        ),
    },
    { key: "createdBy", title: "Kiritdi" },
    { key: "status", title: "Holat", render: (d) => <WarehouseTransferStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Ombor koʻchirishlari</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setOpen({ id: null })}>
            Koʻchirish tuzish
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption="Ombor koʻchirishlari"
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
                options={Object.entries(OK_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={Warehouse}
                title="Hali ombor koʻchirishi yoʻq"
                description="Tovarni filial ichida bir ombordan boshqasiga joʻnating: qoralama → joʻnatish → qabul."
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setOpen({ id: null })}>
                      Koʻchirish tuzish
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
      {open ? <WarehouseTransferDrawer id={open.id} onClose={() => setOpen(null)} onCreated={(id) => setOpen({ id })} /> : null}
    </>
  );
}
