"use client";

import { CircleCheck, ClipboardCheck, FilePen, ListChecks, Plus, ScanSearch, ShieldAlert, XCircle } from "lucide-react";
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
  IN_CREATE,
  IN_STATUS_LABELS,
  IN_VIEW_KEYS,
  useInventoryCounts,
  type InventoryCountStatus,
  type InventoryCountSummary,
} from "./api";
import { InventoryCountDrawer } from "./inventory-count-drawer";

export function InventoryCountStatusBadge({ status }: { status: InventoryCountStatus }) {
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    COUNTING: { tone: "info", icon: ScanSearch },
    CHECK: { tone: "warning", icon: ClipboardCheck },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {IN_STATUS_LABELS[status]}
    </Badge>
  );
}

/** IN — inventarizatsiya: qoralama → sanoq (zonalar qulflanadi) → tekshirish → tasdiq. Kamomad 5 000 000 dan katta — Direktor. */
export function InventoryCountsPage() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<{ id: number | null } | null>(() => {
    const id = Number(params.get("open"));
    return Number.isInteger(id) && id > 0 ? { id } : null;
  });
  const allowed = canAny(me.data, IN_VIEW_KEYS);
  const canCreate = can(me.data, IN_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useInventoryCounts(branchId, (status as InventoryCountStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const showCost = (docs.data?.items ?? []).some((d) => d.shortageCost != null);
  const columns: TableColumn<InventoryCountSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "createdAt", title: "Sana", render: (d) => formatDateTime(new Date(d.createdAt)) },
    { key: "warehouse", title: "Ombor · qamrov", render: (d) => `${d.warehouse} · ${d.zone ? d.zone.name : "butun ombor"}` },
    {
      key: "counted",
      title: "Sanaldi",
      align: "right",
      render: (d) => (d.lines > 0 ? `${formatQuantity(d.counted)} / ${formatQuantity(d.lines)}` : "—"),
    },
    {
      key: "shortageQty",
      title: "Kamomad",
      align: "right",
      render: (d) => (d.shortageQty ? `${formatQuantity(d.shortageQty)} dona` : "—"),
    },
    {
      key: "surplusQty",
      title: "Ortiqcha",
      align: "right",
      render: (d) => (d.surplusQty ? `${formatQuantity(d.surplusQty)} dona` : "—"),
    },
    ...(showCost
      ? [
          {
            key: "shortageCost",
            title: "Kamomad tannarxi",
            align: "right" as const,
            render: (d: InventoryCountSummary) => (d.shortageCost != null && d.shortageQty ? formatMoney(d.shortageCost) : "—"),
          },
        ]
      : []),
    { key: "createdBy", title: "Kiritdi" },
    {
      key: "status",
      title: "Holat",
      render: (d) => (
        <span className="flex items-center gap-2">
          <InventoryCountStatusBadge status={d.status} />
          {d.needsDirector && d.status === "CHECK" ? (
            <Badge tone="danger" icon={ShieldAlert}>
              Direktor
            </Badge>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Inventarizatsiya</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setOpen({ id: null })}>
            Inventarizatsiya boshlash
          </Button>
        ) : null}
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption="Inventarizatsiya hujjatlari"
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
                options={Object.entries(IN_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
          }
          emptyState={
            status !== null ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={ListChecks}
                title="Hali inventarizatsiya yoʻq"
                description="Ombor yoki zonadagi tovarni sanab, hisobdagi qoldiq bilan solishtiring."
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setOpen({ id: null })}>
                      Inventarizatsiya boshlash
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
      {open ? <InventoryCountDrawer id={open.id} onClose={() => setOpen(null)} onCreated={(id) => setOpen({ id })} /> : null}
    </>
  );
}
