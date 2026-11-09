"use client";

import { ArrowRight, CircleCheck, FilePen, Plus, Truck, TriangleAlert, Warehouse, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
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
  OK_STATUSES,
  OK_VIEW_KEYS,
  TRANSFER_OK,
  useWarehouseTransfers,
  type WarehouseTransferStatus,
  type WarehouseTransferSummary,
} from "./api";
import { WarehouseTransferDrawer } from "./warehouse-transfer-drawer";
import { HubTabs } from "@/components/shell/hub-tabs";

export function WarehouseTransferStatusBadge({ status }: { status: WarehouseTransferStatus }) {
  const t = useTranslations("warehouseTransfers");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    IN_TRANSIT: { tone: "info", icon: Truck },
    RECEIVED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** OK — ombor koʻchirishlari (bitta filial ichida): Qoralama → Yoʻlda → Qabul qilindi. */
export function WarehouseTransfersPage() {
  const t = useTranslations("warehouseTransfers");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id> — hujjat darhol ochiladi; «Koʻchirish» → «Yangi»: ?new=1 — yangi qoralama
  const [open, setOpen] = useState<{ id: number | null } | null>(() => {
    if (params.get("new") === "1") return { id: null };
    const id = Number(params.get("open"));
    return Number.isInteger(id) && id > 0 ? { id } : null;
  });
  const allowed = canAny(me.data, OK_VIEW_KEYS);
  const canCreate = can(me.data, TRANSFER_OK);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useWarehouseTransfers(branchId, (status as WarehouseTransferStatus | null) ?? null, page);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const columns: TableColumn<WarehouseTransferSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    { key: "createdAt", title: t("col.date"), render: (d) => formatDateTime(new Date(d.createdAt)) },
    {
      key: "route",
      title: t("col.route"),
      wrap: true,
      render: (d) => (
        <span className="flex items-center gap-1">
          {d.fromWarehouse.name} · {d.fromZone.name}
          <ArrowRight size={14} strokeWidth={1.5} aria-label={t("routeArrow")} className="text-text-secondary" />
          {d.toWarehouse.name}
        </span>
      ),
    },
    { key: "lines", title: t("col.lines"), align: "right", render: (d) => formatQuantity(d.lines) },
    { key: "qty", title: t("col.qty"), align: "right", render: (d) => formatQuantity(d.qty) },
    {
      key: "shortageQty",
      title: t("col.shortage"),
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
    { key: "createdBy", title: t("col.createdBy") },
    { key: "status", title: t("col.status"), render: (d) => <WarehouseTransferStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <HubTabs hub="transfers" />
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setOpen({ id: null })}>
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
          onRowClick={(d) => setOpen({ id: d.id })}
          toolbar={
            <div className="w-56">
              <Select
                label={t("filter.status")}
                size="sm"
                value={status}
                onChange={(v) => (setStatus(v), setPage(1))}
                placeholder={t("filter.allStatuses")}
                className="[&>span:first-child]:sr-only"
                options={OK_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={Warehouse}
                title={t("empty.title")}
                description={t("empty.description")}
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => setOpen({ id: null })}>
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
      {open ? <WarehouseTransferDrawer id={open.id} onClose={() => setOpen(null)} onCreated={(id) => setOpen({ id })} /> : null}
    </>
  );
}
