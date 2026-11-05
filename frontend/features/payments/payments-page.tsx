"use client";

import { Ban, CircleCheck, FilePen, Plus, Truck, Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
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
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {PAYMENT_STATUS[status]}
    </Badge>
  );
}

/** Pul → Toʻlovlar (SPEC 5.5): mijozdan (MT) va yetkazib beruvchiga (YT). */
export function PaymentsPage() {
  const me = useMe();
  // Bildirishnomadan oʻtish: ?tab=yt
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState(initialTab === "yt" ? "yt" : "mt");
  if (me.data && !can(me.data, "payments.view")) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;
  return (
    <>
      <h1 className="mb-4 text-page-title">Toʻlovlar</h1>
      <Tabs
        aria-label="Toʻlov turi"
        value={tab}
        onChange={setTab}
        items={[
          { key: "mt", label: "Mijozdan (MT)" },
          { key: "yt", label: "Yetkazib beruvchiga (YT)" },
        ]}
      />
      <div className="mt-4">{tab === "mt" ? <CustomerPayments /> : <SupplierPaymentsTab />}</div>
    </>
  );
}

/** MT — qoralama → oʻtkazish (eng eski qarzdan, ortigʻi avans) → bekor qilish. */
function CustomerPayments() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "payments.view");
  const canCreate = can(me.data, PAYMENT_MT);
  const scopeBranch = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const workBranch = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const list = usePayments(scopeBranch, (status as PaymentStatus | null) ?? null, allowed);

  const columns: TableColumn<PaymentSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "paymentDate", title: "Sana", render: (p) => formatIsoDate(p.paymentDate) },
    { key: "customer", title: "Mijoz" },
    { key: "account", title: "Hisob" },
    {
      key: "amount",
      title: "Summa",
      align: "right",
      render: (p) => <span className="tabular-nums">{formatMoney(p.amount)}</span>,
    },
    {
      key: "source",
      title: "Manba",
      render: (p) =>
        p.source === "DRIVER" ? (
          <Badge tone="info" icon={Truck}>
            Haydovchidan
          </Badge>
        ) : (
          "Kassir"
        ),
    },
    { key: "status", title: "Holat", render: (p) => <PaymentStatusBadge status={p.status} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-4">
        {canCreate ? (
          <Button
            icon={Plus}
            disabled={workBranch == null}
            title={workBranch == null ? "Avval yuqorida filialni tanlang" : undefined}
            onClick={() => setEditor({ id: null })}
          >
            Toʻlov qoʻshish
          </Button>
        ) : null}
      </div>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption="Mijozdan toʻlovlar"
          columns={columns}
          rows={list.data ?? []}
          rowKey={(p) => String(p.id)}
          loading={list.isPending}
          onRowClick={(p) => setEditor({ id: p.id })}
          toolbar={
            <div className="w-56">
              <Select
                label="Holat"
                size="sm"
                value={status}
                onChange={setStatus}
                placeholder="Barcha holatlar"
                className="[&>span:first-child]:sr-only"
                options={Object.entries(PAYMENT_STATUS).map(([value, label]) => ({ value, label }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={Wallet}
                title="Hali toʻlov yoʻq"
                description="Mijoz toʻlagan pul shu yerda yoziladi: summa eng eski qarzdan yopiladi, ortigʻi avans boʻladi."
              />
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
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const canCreate = can(me.data, PAYMENT_YT);
  const scopeBranch = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const workBranch = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const list = useSupplierPayments(scopeBranch, (status as SupplierPaymentStatus | null) ?? null, true);
  const columns: TableColumn<SupplierPaymentSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "paymentDate", title: "Sana", render: (p) => formatIsoDate(p.paymentDate) },
    { key: "supplier", title: "Yetkazib beruvchi" },
    { key: "account", title: "Hisob" },
    { key: "amount", title: "Summa", align: "right", render: (p) => <span className="tabular-nums">{formatMoney(p.amount)}</span> },
    { key: "status", title: "Holat", render: (p) => <SupplierPaymentStatusBadge status={p.status} /> },
  ];
  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-4">
        {canCreate ? (
          <Button
            icon={Plus}
            disabled={workBranch == null}
            title={workBranch == null ? "Avval yuqorida filialni tanlang" : undefined}
            onClick={() => setEditor({ id: null })}
          >
            Toʻlov qoʻshish
          </Button>
        ) : null}
      </div>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption="Yetkazib beruvchiga toʻlovlar"
          columns={columns}
          rows={list.data ?? []}
          rowKey={(p) => String(p.id)}
          loading={list.isPending}
          onRowClick={(p) => setEditor({ id: p.id })}
          toolbar={
            <div className="w-56">
              <Select
                label="Holat"
                size="sm"
                value={status}
                onChange={setStatus}
                placeholder="Barcha holatlar"
                className="[&>span:first-child]:sr-only"
                options={Object.entries(SUPPLIER_PAYMENT_STATUS).map(([value, label]) => ({ value, label }))}
              />
            </div>
          }
          emptyState={
            status ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={Wallet}
                title="Hali YT yoʻq"
                description="Yetkazib beruvchiga toʻlov tasdiqdan soʻng oʻtkaziladi: summa eng eski kirim qarzidan yopiladi."
              />
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
