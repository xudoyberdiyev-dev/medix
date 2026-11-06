"use client";

import { CircleCheck, Clock, Plus, Undo2, XCircle } from "lucide-react";
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
  QY_CREATE,
  QY_REASON_LABELS,
  QY_STATUS_LABELS,
  QY_VIEW_KEYS,
  useSupplierReturns,
  type SupplierReturnStatus,
  type SupplierReturnSummary,
} from "./api";
import { SupplierReturnDrawer, type ReturnPreset } from "./supplier-return-drawer";

export function SupplierReturnStatusBadge({ status }: { status: SupplierReturnStatus }) {
  const map = {
    PENDING: { tone: "warning", icon: Clock },
    POSTED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {QY_STATUS_LABELS[status]}
    </Badge>
  );
}

/** QY — yetkazib beruvchiga qaytarish: oʻtkazilgan kirim partiyalari; tasdiq bilan, YB qarzi kirim narxida kamayadi. */
export function SupplierReturnsPage() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id> — hujjat darhol ochiladi
  // Kirim hujjatidan oʻtish: ?receipt=<id>&supplier=<id>&supplierName=…&receiptNo=… — yangi qaytarish shu kirim bilan ochiladi
  const [open, setOpen] = useState<{ id: number | null; preset?: ReturnPreset } | null>(() => {
    const id = Number(params.get("open"));
    if (Number.isInteger(id) && id > 0) return { id };
    const receiptId = Number(params.get("receipt"));
    const supplierId = Number(params.get("supplier"));
    if (Number.isInteger(receiptId) && receiptId > 0 && Number.isInteger(supplierId) && supplierId > 0)
      return {
        id: null,
        preset: {
          receiptId,
          receiptNo: params.get("receiptNo") ?? "",
          supplierId,
          supplierName: params.get("supplierName") ?? "",
        },
      };
    return null;
  });
  const allowed = canAny(me.data, QY_VIEW_KEYS);
  const canCreate = can(me.data, QY_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useSupplierReturns(branchId, (status as SupplierReturnStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const showAmount = (docs.data?.items ?? []).some((d) => d.totalAmount != null);
  const columns: TableColumn<SupplierReturnSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "createdAt", title: "Sana", render: (d) => formatDateTime(new Date(d.createdAt)) },
    { key: "supplier", title: "Yetkazib beruvchi", wrap: true },
    { key: "receiptNumber", title: "Kirim", mono: true },
    { key: "warehouse", title: "Ombor · zona", render: (d) => `${d.warehouse} · ${d.zone.name}` },
    { key: "reason", title: "Sabab", render: (d) => QY_REASON_LABELS[d.reason] },
    { key: "qty", title: "Miqdor", align: "right", render: (d) => formatQuantity(d.qty) },
    ...(showAmount
      ? [
          {
            key: "totalAmount",
            title: "Summa",
            align: "right" as const,
            render: (d: SupplierReturnSummary) => (d.totalAmount != null ? formatMoney(d.totalAmount) : "—"),
          },
        ]
      : []),
    { key: "createdBy", title: "Kiritdi" },
    { key: "status", title: "Holat", render: (d) => <SupplierReturnStatusBadge status={d.status} /> },
  ];
  const filtered = status !== null;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">YB ga qaytarish</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setOpen({ id: null })}>
            Qaytarish
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption="YB ga qaytarish hujjatlari"
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
                options={Object.entries(QY_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={Undo2}
                title="Hali YB ga qaytarish yoʻq"
                description="Sifatsiz, shikastlangan yoki ortiqcha tovarni kirim boʻyicha yetkazib beruvchiga qaytaring — qarz avtomatik kamayadi."
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setOpen({ id: null })}>
                      Qaytarish
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
      {open ? (
        <SupplierReturnDrawer id={open.id} preset={open.preset} onClose={() => setOpen(null)} onCreated={(id) => setOpen({ id })} />
      ) : null}
    </>
  );
}
