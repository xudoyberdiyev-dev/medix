"use client";

import { CircleCheck, Clock, Plus, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { HubTabs } from "@/components/shell/hub-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { QM_CREATE, QM_STATUSES, QM_VIEW_KEYS, useCustomerReturns, type CustomerReturnStatus, type CustomerReturnSummary } from "./api";
import { CustomerReturnDrawer } from "./customer-return-drawer";

export function CustomerReturnStatusBadge({ status }: { status: CustomerReturnStatus }) {
  const t = useTranslations("customerReturns");
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

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/**
 * QM — mijozdan qaytarish (prototip StockDocs `qm`): yetkazilgan sotuv asosida; Operator yaratadi, Ombor mudiri qabul qiladi —
 * tovar Karantinga, mijoz qarzi sotuv narxida kamayadi.
 */
export function CustomerReturnsPage() {
  const t = useTranslations("customerReturns");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id>; yangi hujjat: ?new=1
  const [open, setOpen] = useState<{ id: number | null } | null>(() => {
    const id = Number(params.get("open"));
    if (Number.isInteger(id) && id > 0) return { id };
    return params.get("new") === "1" ? { id: null } : null;
  });
  const allowed = canAny(me.data, QM_VIEW_KEYS);
  const canCreate = can(me.data, QM_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useCustomerReturns(branchId, (status as CustomerReturnStatus | null) ?? null, q.trim(), page);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const columns: TableColumn<CustomerReturnSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    { key: "returnDate", title: t("col.date"), render: (d) => day(d.returnDate) },
    {
      key: "customer",
      title: t("col.customer"),
      wrap: true,
      render: (d) => (
        <span className="flex flex-col">
          <span className="font-medium">{d.customer}</span>
          {d.region ? <span className="text-caption text-text-secondary">{d.region}</span> : null}
        </span>
      ),
    },
    { key: "saleNumber", title: t("col.base"), mono: true },
    { key: "warehouse", title: t("col.warehouse") },
    { key: "lines", title: t("col.lines"), align: "right", render: (d) => formatQuantity(d.lines) },
    { key: "total", title: t("col.sum"), align: "right", render: (d) => formatMoney(d.total) },
    { key: "status", title: t("col.status"), render: (d) => <CustomerReturnStatusBadge status={d.status} /> },
    { key: "createdBy", title: t("col.createdBy") },
  ];
  const filtered = status !== null || q.trim() !== "";

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
          onRowClick={(d) => setOpen({ id: d.id })}
          toolbar={
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-72">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  className="[&>label]:sr-only"
                  value={q}
                  onChange={(v) => (setQ(v), setPage(1))}
                  placeholder={t("search")}
                />
              </div>
              <div className="w-56">
                <Select
                  label={t("filter.status")}
                  size="sm"
                  value={status}
                  onChange={(v) => (setStatus(v), setPage(1))}
                  placeholder={t("filter.allStatuses")}
                  className="[&>span:first-child]:sr-only"
                  options={QM_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
                />
              </div>
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setStatus(null), setQ(""))} />
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
      {open ? <CustomerReturnDrawer id={open.id} onClose={() => setOpen(null)} onCreated={(id) => setOpen({ id })} /> : null}
    </>
  );
}
