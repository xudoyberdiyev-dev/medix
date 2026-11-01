"use client";

import { Ban, CircleCheck, FilePen, PackageCheck, PackagePlus, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { RECEIPT_CREATE, STATUS_LABELS, useReceipts, type ReceiptStatus, type ReceiptSummary } from "./api";
import { ReceiptDrawer } from "./receipt-drawer";

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    ACCEPTED: { tone: "warning", icon: PackageCheck },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** Kirim (SPEC 5.1): Qoralama → Qabul qilindi → Oʻtkazildi. */
export function ReceiptsPage() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const allowed = can(me.data, "receipt.view");
  const canCreate = can(me.data, RECEIPT_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useReceipts(branchId, (status as ReceiptStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const showAmount = (docs.data?.items ?? []).some((d) => d.amount != null);
  const columns: TableColumn<ReceiptSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "receiptDate", title: "Sana", render: (d) => day(d.receiptDate) },
    { key: "supplier", title: "Yetkazib beruvchi" },
    { key: "invoiceNumber", title: "Yuk xati", mono: true, render: (d) => d.invoiceNumber ?? "—" },
    { key: "warehouse", title: "Ombor" },
    { key: "totalQty", title: "Miqdor", align: "right", render: (d) => <span className="tabular-nums">{formatQuantity(d.totalQty)}</span> },
    ...(showAmount
      ? [
          {
            key: "amount",
            title: "Summa",
            align: "right" as const,
            render: (d: ReceiptSummary) => <span className="tabular-nums">{d.amount ? formatMoney(d.amount) : ""}</span>,
          },
        ]
      : []),
    {
      key: "dueDate",
      title: "Toʻlov kuni",
      render: (d) => (d.prepaid ? <Badge tone="info">100% oldindan</Badge> : d.dueDate ? day(d.dueDate) : "—"),
    },
    { key: "status", title: "Holat", render: (d) => <ReceiptStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Kirim</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setEditor({ id: null })}>
            Kirim qoʻshish
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption="Kirimlar"
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
                icon={PackagePlus}
                title="Hali kirim yoʻq"
                description="Yetkazib beruvchidan kelgan tovar shu yerda rasmiylashtiriladi: qoralama → qabul → oʻtkazish."
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
      {editor ? <ReceiptDrawer id={editor.id} onClose={() => setEditor(null)} onCreated={(id) => setEditor({ id })} /> : null}
    </>
  );
}
