"use client";

import { ArrowRight, Banknote, Building2, Plus, TriangleAlert } from "lucide-react";
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
import { OK_STATUSES } from "@/features/warehouse-transfers/api";
import { WarehouseTransferStatusBadge } from "@/features/warehouse-transfers/warehouse-transfers-page";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  FS_VIEW_KEYS,
  TRANSFER_FS,
  useBranchBalances,
  useBranchSales,
  type BranchBalance,
  type BranchSaleStatus,
  type BranchSaleSummary,
} from "./api";
import { BranchPayDialog, BranchPaymentsList, canPayFor, useBranchPayments } from "./branch-payments";
import { HubTabs } from "@/components/shell/hub-tabs";

/** FS — filiallararo savdo: Qoralama → Yoʻlda (HF, xaridor filial qarzi) → Qabul qilindi. */
export function BranchSalesPage() {
  const t = useTranslations("branchSales");
  const tw = useTranslations("warehouseTransfers");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id> — hujjat sahifasiga yoʻnaltiriladi; «Koʻchirish» → «Yangi»: ?new=1 — yangi qoralama
  const router = useRouter();
  const isNew = params.get("new") === "1";
  const openId = Number(params.get("open"));
  useEffect(() => {
    if (isNew) router.replace("/branch-sales/new");
    else if (Number.isInteger(openId) && openId > 0) router.replace(`/branch-sales/${openId}`);
  }, [isNew, openId, router]);
  const allowed = canAny(me.data, FS_VIEW_KEYS);
  const canCreate = can(me.data, TRANSFER_FS);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useBranchSales(branchId, (status as BranchSaleStatus | null) ?? null, page);
  const balances = useBranchBalances(allowed && can(me.data, "special.cost"));
  const canSeePayments = allowed && canAny(me.data, ["cash.view", "bank.view"]);
  const payments = useBranchPayments(canSeePayments);
  const [paying, setPaying] = useState<BranchBalance | null>(null);

  if (me.data && !allowed) return <ForbiddenState description={tw("forbidden")} />;

  const showMoney = (docs.data?.items ?? []).some((d) => d.total !== null && d.total !== undefined);
  const columns: TableColumn<BranchSaleSummary>[] = [
    { key: "number", title: tw("col.number"), mono: true },
    { key: "createdAt", title: tw("col.date"), render: (d) => formatDateTime(new Date(d.createdAt)) },
    {
      key: "route",
      title: t("col.route"),
      wrap: true,
      render: (d) => (
        <span className="flex items-center gap-1">
          {d.seller.name}
          <ArrowRight size={14} strokeWidth={1.5} aria-label={tw("routeArrow")} className="text-text-secondary" />
          {d.buyer.name} · {d.toWarehouse.name}
        </span>
      ),
    },
    { key: "invoiceNumber", title: "HF", mono: true, render: (d) => d.invoiceNumber ?? "—" },
    { key: "qty", title: tw("col.qty"), align: "right", render: (d) => formatQuantity(d.qty) },
    ...(showMoney
      ? [
          {
            key: "total",
            title: t("col.total"),
            align: "right" as const,
            render: (d: BranchSaleSummary) => (d.total ? formatMoney(d.total) : "—"),
          },
        ]
      : []),
    {
      key: "shortageQty",
      title: tw("col.shortage"),
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
    { key: "status", title: tw("col.status"), render: (d) => <WarehouseTransferStatusBadge status={d.status} /> },
  ];

  return (
    <>
      <HubTabs hub="transfers" />
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => router.push("/branch-sales/new")}>
            {t("create")}
          </Button>
        ) : null}
      </div>
      {balances.data && (balances.data.length > 0 || (payments.data?.length ?? 0) > 0) ? (
        <section aria-label={t("debt.title")} className="mb-4 rounded-card border border-border bg-surface p-4">
          <h2 className="mb-2 text-section-title">{t("debt.title")}</h2>
          <ul className="flex flex-col gap-1 text-body">
            {balances.data.map((b) => (
              <li key={`${b.debtor.id}-${b.creditor.id}`} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1">
                  {b.debtor.name}
                  <ArrowRight size={14} strokeWidth={1.5} aria-label={t("debt.arrow")} className="text-text-secondary" />
                  {b.creditor.name}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{formatMoney(b.amount)}</span>
                  {canPayFor(me.data, b.debtor.id) && !b.amount.startsWith("-") ? (
                    <Button variant="secondary" size="sm" icon={Banknote} onClick={() => setPaying(b)}>
                      {t("debt.pay")}
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-text-secondary">{t("debt.note")}</p>
          <BranchPaymentsList enabled={canSeePayments} />
        </section>
      ) : null}
      {paying ? <BranchPayDialog balance={paying} onClose={() => setPaying(null)} /> : null}
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={docs.data?.items ?? []}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => router.push(`/branch-sales/${d.id}`)}
          toolbar={
            <div className="w-56">
              <Select
                label={tw("filter.status")}
                size="sm"
                value={status}
                onChange={(v) => (setStatus(v), setPage(1))}
                placeholder={tw("filter.allStatuses")}
                className="[&>span:first-child]:sr-only"
                options={OK_STATUSES.map((value) => ({ value, label: tw(`status.${value}`) }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={Building2}
                title={t("empty.title")}
                description={t("empty.description", { hf: "HF" })}
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => router.push("/branch-sales/new")}>
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
