"use client";

import { CircleCheck, Clock, Plus, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { QY_CREATE, QY_STATUSES, QY_VIEW_KEYS, useSupplierReturns, type SupplierReturnStatus, type SupplierReturnSummary } from "./api";
import { SupplierReturnDrawer, type ReturnPreset } from "./supplier-return-drawer";
import { HubTabs } from "@/components/shell/hub-tabs";

export function SupplierReturnStatusBadge({ status }: { status: SupplierReturnStatus }) {
  const t = useTranslations("supplierReturns");
  const map = {
    PENDING: { tone: "warning", icon: Clock },
    POSTED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** QY — yetkazib beruvchiga qaytarish: oʻtkazilgan kirim partiyalari; tasdiq bilan, YB qarzi kirim narxida kamayadi. */
export function SupplierReturnsPage() {
  const t = useTranslations("supplierReturns");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id> — hujjat darhol ochiladi
  // Kirim hujjatidan oʻtish: ?receipt=<id>&supplier=<id>&supplierName=…&receiptNo=… — yangi qaytarish shu kirim bilan ochiladi
  const router = useRouter();
  const openId = Number(params.get("open"));
  useEffect(() => {
    if (Number.isInteger(openId) && openId > 0) router.replace(`/supplier-returns/${openId}`);
  }, [openId, router]);
  const [open, setOpen] = useState<{ id: number | null; preset?: ReturnPreset } | null>(() => {
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

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const showAmount = (docs.data?.items ?? []).some((d) => d.totalAmount != null);
  const columns: TableColumn<SupplierReturnSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    { key: "createdAt", title: t("col.date"), render: (d) => formatDateTime(new Date(d.createdAt)) },
    { key: "supplier", title: t("col.supplier"), wrap: true },
    { key: "receiptNumber", title: t("col.receipt"), mono: true },
    { key: "warehouse", title: t("col.warehouseZone"), render: (d) => `${d.warehouse} · ${d.zone.name}` },
    { key: "reason", title: t("col.reason"), render: (d) => t(`reason.${d.reason}`) },
    { key: "qty", title: t("col.qty"), align: "right", render: (d) => formatQuantity(d.qty) },
    ...(showAmount
      ? [
          {
            key: "totalAmount",
            title: t("col.amount"),
            align: "right" as const,
            render: (d: SupplierReturnSummary) => (d.totalAmount != null ? formatMoney(d.totalAmount) : "—"),
          },
        ]
      : []),
    { key: "createdBy", title: t("col.createdBy") },
    { key: "status", title: t("col.status"), render: (d) => <SupplierReturnStatusBadge status={d.status} /> },
  ];
  const filtered = status !== null;

  return (
    <>
      <HubTabs hub="returns" />
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
          caption={t("caption")}
          columns={columns}
          rows={docs.data?.items ?? []}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => router.push(`/supplier-returns/${d.id}`)}
          toolbar={
            <div className="w-56">
              <Select
                label={t("filter.status")}
                size="sm"
                value={status}
                onChange={(v) => (setStatus(v), setPage(1))}
                placeholder={t("filter.allStatuses")}
                className="[&>span:first-child]:sr-only"
                options={QY_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
              />
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={Undo2}
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
      {open ? (
        <SupplierReturnDrawer
          id={open.id}
          preset={open.preset}
          onClose={() => setOpen(null)}
          onCreated={(id) => (setOpen(null), router.push(`/supplier-returns/${id}`))}
        />
      ) : null}
    </>
  );
}
