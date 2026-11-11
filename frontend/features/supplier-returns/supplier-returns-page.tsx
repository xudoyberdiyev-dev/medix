"use client";

import { CircleCheck, Clock, Plus, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { api, unwrap } from "@/lib/api/client";
import { matchesQuery, useStatusCounts } from "@/lib/use-status-counts";
import { useBranchStore } from "@/lib/stores/branch";
import { QY_CREATE, QY_STATUSES, QY_VIEW_KEYS, useSupplierReturns, type SupplierReturnStatus, type SupplierReturnSummary } from "./api";
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
  const [q, setQ] = useState("");
  // Bildirishnomadan oʻtish: ?open=<id> — hujjat darhol ochiladi
  // Kirim hujjatidan oʻtish: ?receipt=<id>&supplier=<id>&supplierName=…&receiptNo=… — yangi qaytarish shu kirim bilan ochiladi
  const router = useRouter();
  const openId = Number(params.get("open"));
  useEffect(() => {
    if (Number.isInteger(openId) && openId > 0) router.replace(`/supplier-returns/${openId}`);
  }, [openId, router]);
  // Kirimdan: ?receipt=… — yangi hujjat sahifasiga shu parametrlar bilan
  const fromReceipt = params.get("receipt") !== null && params.get("supplier") !== null;
  useEffect(() => {
    if (fromReceipt) router.replace(`/supplier-returns/new?${params.toString()}`);
  }, [fromReceipt, params, router]);
  const allowed = canAny(me.data, QY_VIEW_KEYS);
  const canCreate = can(me.data, QY_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useSupplierReturns(branchId, (status as SupplierReturnStatus | null) ?? null, page);

  const counts = useStatusCounts(
    ["supplier-returns", branchId],
    QY_STATUSES,
    (st) =>
      unwrap(
        api.GET("/api/supplier-returns", { params: { query: { branchId: branchId ?? undefined, status: st ?? undefined, size: 1 } } }),
      ).then((r) => r.total),
    allowed,
  );

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const showAmount = (docs.data?.items ?? []).some((d) => d.totalAmount != null);
  const columns: TableColumn<SupplierReturnSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    { key: "createdAt", title: t("col.date"), render: (d) => formatDate(new Date(d.createdAt)) },
    { key: "supplier", title: t("col.supplier"), wrap: true, render: (d) => <span className="font-medium">{d.supplier}</span> },
    { key: "receiptNumber", title: t("col.base"), mono: true },
    { key: "lines", title: t("col.lines"), align: "right", render: (d) => formatQuantity(d.lines) },
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
    { key: "status", title: t("col.status"), render: (d) => <SupplierReturnStatusBadge status={d.status} /> },
    { key: "createdBy", title: t("col.createdBy") },
  ];
  const filtered = status !== null || q.trim() !== "";
  const rows = (docs.data?.items ?? []).filter((d) => matchesQuery(q, [d.number, d.supplier, d.receiptNumber]));

  return (
    <>
      <HubTabs hub="returns" />
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("listTitle")}
          {counts.all != null ? <span className="tabular text-body text-text-secondary">{formatQuantity(counts.all)}</span> : null}
        </h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => router.push("/supplier-returns/new")}>
            {t("create")}
          </Button>
        ) : null}
      </div>
      <div className="mb-3">
        <Tabs
          aria-label={t("filter.status")}
          value={status ?? "all"}
          onChange={(k) => (setStatus(k === "all" ? null : k), setPage(1))}
          items={[
            { key: "all", label: t("filter.all"), count: counts.all },
            ...QY_STATUSES.map((k) => ({ key: k, label: t(`tab.${k}`), count: counts.of(k) })),
          ]}
        />
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption={t("caption")}
          columns={columns}
          rows={rows}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => router.push(`/supplier-returns/${d.id}`)}
          toolbar={
            <div className="w-72">
              <TextField
                label={t("search")}
                variant="search"
                size="sm"
                className="[&>label]:sr-only"
                value={q}
                onChange={setQ}
                placeholder={t("search")}
              />
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
                    <Button variant="secondary" icon={Plus} onClick={() => router.push("/supplier-returns/new")}>
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
    </>
  );
}
