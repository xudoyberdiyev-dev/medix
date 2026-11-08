"use client";

import { Ban, CircleCheck, FilePen, Plus, Truck, Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  PAYMENT_MT,
  PAYMENT_STATUS,
  PAYMENT_YT,
  SUPPLIER_PAYMENT_STATUS,
  usePayments,
  useSupplierPayments,
  type PaymentStatus,
  type PaymentSummary,
  type SupplierPaymentStatus,
  type SupplierPaymentSummary,
} from "./api";
import { PaymentDrawer } from "./payment-drawer";
import { SupplierPaymentDrawer, SupplierPaymentStatusBadge } from "./supplier-payment-drawer";

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useTranslations("payments");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** Pul → Toʻlovlar (SPEC 5.5): mijozdan (MT) va yetkazib beruvchiga (YT). */
export function PaymentsPage() {
  const t = useTranslations("payments");
  const me = useMe();
  // Bildirishnomadan oʻtish: ?tab=yt
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState(initialTab === "yt" ? "yt" : "mt");
  if (me.data && !can(me.data, "payments.view")) return <ForbiddenState description={t("forbidden")} />;
  return (
    <>
      <h1 className="mb-4 text-page-title">{t("title")}</h1>
      <Tabs
        aria-label={t("tabs.label")}
        value={tab}
        onChange={setTab}
        items={[
          { key: "mt", label: t("tabs.mt") },
          { key: "yt", label: t("tabs.yt") },
        ]}
      />
      <div className="mt-4">{tab === "mt" ? <CustomerPayments /> : <SupplierPaymentsTab />}</div>
    </>
  );
}

/** MT — qoralama → oʻtkazish (eng eski qarzdan, ortigʻi avans) → bekor qilish. */
function CustomerPayments() {
  const t = useTranslations("payments");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "payments.view");
  const canCreate = can(me.data, PAYMENT_MT);
  const scopeBranch = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const workBranch = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const [status, setStatus] = useState<string | null>(null);
  // Buyurtma kartochkasidan oʻtish: ?open=<MT id> — hujjat darhol ochiladi
  const openId = Number(useSearchParams().get("open"));
  const [editor, setEditor] = useState<{ id: number | null } | null>(Number.isInteger(openId) && openId > 0 ? { id: openId } : null);
  const list = usePayments(scopeBranch, (status as PaymentStatus | null) ?? null, allowed);

  const columns: TableColumn<PaymentSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    { key: "paymentDate", title: t("col.date"), render: (p) => formatIsoDate(p.paymentDate) },
    { key: "customer", title: t("col.customer") },
    { key: "account", title: t("col.account") },
    {
      key: "amount",
      title: t("col.amount"),
      align: "right",
      render: (p) => <span className="tabular-nums">{formatMoney(p.amount)}</span>,
    },
    {
      key: "source",
      title: t("col.source"),
      render: (p) =>
        p.source === "DRIVER" ? (
          <Badge tone="info" icon={Truck}>
            {t("source.driver")}
          </Badge>
        ) : (
          t("source.cashier")
        ),
    },
    { key: "status", title: t("col.status"), render: (p) => <PaymentStatusBadge status={p.status} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-4">
        {canCreate ? (
          <Button
            icon={Plus}
            disabled={workBranch == null}
            title={workBranch == null ? t("selectBranchFirst") : undefined}
            onClick={() => setEditor({ id: null })}
          >
            {t("add")}
          </Button>
        ) : null}
      </div>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={t("mtCaption")}
          columns={columns}
          rows={list.data ?? []}
          rowKey={(p) => String(p.id)}
          loading={list.isPending}
          onRowClick={(p) => setEditor({ id: p.id })}
          toolbar={
            <div className="w-56">
              <Select
                label={t("col.status")}
                size="sm"
                value={status}
                onChange={setStatus}
                placeholder={t("allStatuses")}
                className="[&>span:first-child]:sr-only"
                options={(Object.keys(PAYMENT_STATUS) as PaymentStatus[]).map((value) => ({ value, label: t(`status.${value}`) }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState icon={Wallet} title={t("mtEmpty.title")} description={t("mtEmpty.description")} />
            )
          }
        />
      )}
      {editor ? (
        <PaymentDrawer id={editor.id} branchId={workBranch} onClose={() => setEditor(null)} onCreated={(id) => setEditor({ id })} />
      ) : null}
    </>
  );
}

/** YT — qoralama → tasdiqlashda → oʻtkazilgan (tasdiqsiz — Direktor). */
function SupplierPaymentsTab() {
  const t = useTranslations("payments");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const canCreate = can(me.data, PAYMENT_YT);
  const scopeBranch = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const workBranch = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const list = useSupplierPayments(scopeBranch, (status as SupplierPaymentStatus | null) ?? null, true);
  const columns: TableColumn<SupplierPaymentSummary>[] = [
    { key: "number", title: t("col.number"), mono: true },
    { key: "paymentDate", title: t("col.date"), render: (p) => formatIsoDate(p.paymentDate) },
    { key: "supplier", title: t("col.supplier") },
    { key: "account", title: t("col.account") },
    { key: "amount", title: t("col.amount"), align: "right", render: (p) => <span className="tabular-nums">{formatMoney(p.amount)}</span> },
    { key: "status", title: t("col.status"), render: (p) => <SupplierPaymentStatusBadge status={p.status} /> },
  ];
  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-4">
        {canCreate ? (
          <Button
            icon={Plus}
            disabled={workBranch == null}
            title={workBranch == null ? t("selectBranchFirst") : undefined}
            onClick={() => setEditor({ id: null })}
          >
            {t("add")}
          </Button>
        ) : null}
      </div>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={t("ytCaption")}
          columns={columns}
          rows={list.data ?? []}
          rowKey={(p) => String(p.id)}
          loading={list.isPending}
          onRowClick={(p) => setEditor({ id: p.id })}
          toolbar={
            <div className="w-56">
              <Select
                label={t("col.status")}
                size="sm"
                value={status}
                onChange={setStatus}
                placeholder={t("allStatuses")}
                className="[&>span:first-child]:sr-only"
                options={(Object.keys(SUPPLIER_PAYMENT_STATUS) as SupplierPaymentStatus[]).map((value) => ({
                  value,
                  label: t(`supplierStatus.${value}`),
                }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState icon={Wallet} title={t("ytEmpty.title")} description={t("ytEmpty.description")} />
            )
          }
        />
      )}
      {editor ? (
        <SupplierPaymentDrawer id={editor.id} branchId={workBranch} onClose={() => setEditor(null)} onCreated={(id) => setEditor({ id })} />
      ) : null}
    </>
  );
}
