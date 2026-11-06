"use client";

import { ArrowRight, Building2, Plus, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { OK_STATUS_LABELS } from "@/features/warehouse-transfers/api";
import { WarehouseTransferStatusBadge } from "@/features/warehouse-transfers/warehouse-transfers-page";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { FS_VIEW_KEYS, TRANSFER_FS, useBranchSales, type BranchSaleStatus, type BranchSaleSummary } from "./api";
import { BranchSaleDrawer } from "./branch-sale-drawer";

/** FS — filiallararo savdo: Qoralama → Yoʻlda (HF, xaridor filial qarzi) → Qabul qilindi. */
export function BranchSalesPage() {
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
  const allowed = canAny(me.data, FS_VIEW_KEYS);
  const canCreate = can(me.data, TRANSFER_FS);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useBranchSales(branchId, (status as BranchSaleStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const showMoney = (docs.data?.items ?? []).some((d) => d.total !== null && d.total !== undefined);
  const columns: TableColumn<BranchSaleSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "createdAt", title: "Sana", render: (d) => formatDateTime(new Date(d.createdAt)) },
    {
      key: "route",
      title: "Sotuvchi → xaridor",
      wrap: true,
      render: (d) => (
        <span className="flex items-center gap-1">
          {d.seller.name}
          <ArrowRight size={14} strokeWidth={1.5} aria-label="dan" className="text-text-secondary" />
          {d.buyer.name} · {d.toWarehouse.name}
        </span>
      ),
    },
    { key: "invoiceNumber", title: "HF", mono: true, render: (d) => d.invoiceNumber ?? "—" },
    { key: "qty", title: "Miqdor", align: "right", render: (d) => formatQuantity(d.qty) },
    ...(showMoney
      ? [
          {
            key: "total",
            title: "Summa",
            align: "right" as const,
            render: (d: BranchSaleSummary) => (d.total ? formatMoney(d.total) : "—"),
          },
        ]
      : []),
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
    { key: "status", title: "Holat", render: (d) => <WarehouseTransferStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Filiallararo savdo</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setOpen({ id: null })}>
            Savdo tuzish
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption="Filiallararo savdo"
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
                icon={Building2}
                title="Hali filiallararo savdo yoʻq"
                description="Tovarni boshqa filialga tannarxda soting: qoralama → joʻnatish (HF) → xaridor qabul qiladi."
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setOpen({ id: null })}>
                      Savdo tuzish
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
      {open ? <BranchSaleDrawer id={open.id} onClose={() => setOpen(null)} onCreated={(id) => setOpen({ id })} /> : null}
    </>
  );
}
