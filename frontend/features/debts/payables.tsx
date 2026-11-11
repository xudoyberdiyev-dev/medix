"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  ClockAlert,
  FileCheck2,
  FileText,
  HandCoins,
  Hourglass,
  Plus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { HubTabs } from "@/components/shell/hub-tabs";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiFilter } from "@/components/ui/multi-filter";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { bucketOf, fitsPay, inPayTab, PAY_TABS, type PayTab } from "./payables-model";
import { sumOf } from "./receivables-model";

type Invoice = components["schemas"]["SupplierInvoice"];

const dash = <span className="text-text-secondary">—</span>;

/** YB qarzi (prototip `Payables`): 4 KPI, yorliqlar, filtrlar, kirim boʻyicha jadval. */
export function PayablesPage() {
  const t = useTranslations("debts.pay");
  const me = useMe();
  const router = useRouter();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "sdebt.view");
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const allBranches = !!me.data?.allBranches && selectedBranch == null;
  const ready = allowed && me.data != null && (me.data.allBranches || branchId != null);
  const q = useQuery({
    queryKey: ["debts", "suppliers", "invoices", branchId],
    queryFn: () => unwrap(api.GET("/api/debts/suppliers/invoices", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: ready,
  });
  const [tab, setTab] = useState<PayTab>("all");
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState<number[]>([]);
  const [branches, setBranches] = useState<number[]>([]);
  const [payTypes, setPayTypes] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const all = useMemo(() => q.data?.rows ?? [], [q.data]);
  const f = { q: search, suppliers, branches, payTypes, owners };
  const fitting = all.filter((r) => fitsPay(r, f));
  const rows = fitting.filter((r) => inPayTab(r, tab));
  const filtered = tab !== "all" || search !== "" || suppliers.length + branches.length + payTypes.length + owners.length > 0;
  const clear = () => {
    setTab("all");
    setSearch("");
    setSuppliers([]);
    setBranches([]);
    setPayTypes([]);
    setOwners([]);
  };

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const open = all.filter((r) => bucketOf(r) !== "paid");
  const bk = (k: "late" | "today" | "3d") => open.filter((r) => bucketOf(r) === k);
  const uniq = <K,>(arr: Invoice[], key: (r: Invoice) => K) => [...new Set(arr.map(key))];
  const supplierOpts = uniq(all, (r) => r.supplierId).map((id) => ({
    value: id,
    label: all.find((r) => r.supplierId === id)?.supplier ?? "",
    count: all.filter((r) => r.supplierId === id).length,
  }));
  const branchOpts = uniq(all, (r) => r.branchId).map((id) => ({
    value: id,
    label: all.find((r) => r.branchId === id)?.branch ?? "",
    count: all.filter((r) => r.branchId === id).length,
  }));
  const payOpts = (["CASH", "TRANSFER", "ONLINE"] as const).map((v) => ({
    value: v as string,
    label: t(`payType.${v}`),
    count: all.filter((r) => r.paymentType === v).length,
  }));
  const ownerOpts = uniq(all, (r) => r.owner ?? "").map((v) => ({
    value: v,
    label: v || t("ownerNone"),
    count: all.filter((r) => (r.owner ?? "") === v).length,
  }));

  const columns: TableColumn<Invoice>[] = [
    {
      key: "supplier",
      title: t("col.supplier"),
      wrap: true,
      render: (r) => (
        <Link
          href={`/debts/suppliers/${r.supplierId}?name=${encodeURIComponent(r.supplier)}`}
          className="font-medium hover:text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.supplier}
        </Link>
      ),
    },
    ...(allBranches
      ? [{ key: "branch", title: t("col.branch"), render: (r: Invoice) => <span className="text-text-secondary">{r.branch}</span> }]
      : []),
    { key: "number", title: t("col.no"), mono: true },
    { key: "date", title: t("col.date"), render: (r) => formatIsoDate(r.date) },
    {
      key: "pay",
      title: t("col.pay"),
      render: (r) => <span className="text-text-secondary">{t(`payType.${r.paymentType as "CASH"}`)}</span>,
    },
    { key: "owner", title: t("col.owner"), render: (r) => r.owner ?? dash },
    { key: "sum", title: t("col.sum"), align: "right", render: (r) => <span className="tabular-nums">{formatMoney(r.sum)}</span> },
    {
      key: "paid",
      title: t("col.paid"),
      align: "right",
      render: (r) => (r.paid === "0.00" ? dash : <span className="tabular-nums text-success">{formatMoney(r.paid)}</span>),
    },
    {
      key: "left",
      title: t("col.left"),
      align: "right",
      render: (r) => {
        const b = bucketOf(r);
        return (
          <span
            className={cn(
              "font-semibold tabular-nums",
              b === "late" ? "text-danger" : b === "today" ? "text-warning" : b === "paid" && "text-text-secondary",
            )}
          >
            {formatMoney(r.left)}
          </span>
        );
      },
    },
    {
      key: "due",
      title: t("col.due"),
      render: (r) => {
        const b = bucketOf(r);
        return r.dueDate ? (
          <span className={cn(b === "late" && "font-semibold text-danger", b === "today" && "font-semibold text-warning")}>
            {formatIsoDate(r.dueDate)}
          </span>
        ) : (
          dash
        );
      },
    },
    { key: "term", title: t("col.term"), render: (r) => <Term r={r} /> },
    { key: "status", title: t("col.status"), render: (r) => <PayStatus r={r} /> },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <HubTabs hub="supplierDebts" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex items-baseline gap-2 text-page-title">
            {t("title")}
            {q.data ? <span className="tabular text-body text-text-secondary">{formatQuantity(open.length)}</span> : null}
          </h1>
          {q.data ? <p className="text-table text-text-secondary">{t("asOf", { d: formatIsoDate(q.data.today) })}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(me.data, "recon.create") ? (
            <Button variant="secondary" icon={FileCheck2} onClick={() => router.push("/reconciliations/new?side=SUPPLIER")}>
              {t("recon")}
            </Button>
          ) : null}
          {can(me.data, "payments.create") ? (
            <Button icon={Plus} onClick={() => router.push("/payments/yt/new")}>
              {t("newPay")}
            </Button>
          ) : null}
        </div>
      </div>
      {q.data ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi
            icon={HandCoins}
            iconClass="bg-primary-soft text-primary"
            label={t("kTotal")}
            rows={open}
            active={tab === "all"}
            onClick={() => setTab("all")}
          />
          <Kpi
            icon={ClockAlert}
            iconClass="bg-danger-bg text-danger"
            label={t("kLate")}
            rows={bk("late")}
            valueClass="text-danger"
            active={tab === "late"}
            onClick={() => setTab("late")}
          />
          <Kpi
            icon={CalendarCheck}
            iconClass="bg-warning-bg text-warning"
            label={t("kToday")}
            rows={bk("today")}
            valueClass="text-warning"
            active={tab === "today"}
            onClick={() => setTab("today")}
          />
          <Kpi
            icon={CalendarClock}
            iconClass="bg-warning-bg text-warning"
            label={t("k3d")}
            rows={bk("3d")}
            active={tab === "3d"}
            onClick={() => setTab("3d")}
          />
        </div>
      ) : null}
      <Tabs
        aria-label={t("tabsLabel")}
        value={tab}
        onChange={(k) => setTab(k as PayTab)}
        items={PAY_TABS.map((k) => ({ key: k, label: t(`tab.${k}`), count: fitting.filter((r) => inPayTab(r, k)).length }))}
      />
      {q.error ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.receiptId)}
          loading={!ready || q.isPending}
          onRowClick={(r) => router.push(`/receipts/${r.receiptId}`)}
          rowActions={(r) => (
            <div className="flex items-center gap-3">
              {bucketOf(r) !== "paid" && can(me.data, "payments.create") ? (
                <Link
                  href={`/payments/yt/new?supplier=${r.supplierId}&supplierName=${encodeURIComponent(r.supplier)}&amount=${r.left}`}
                  className="inline-flex items-center gap-1 text-table text-primary hover:underline"
                >
                  <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                  {t("pay")}
                </Link>
              ) : null}
              <Link href={`/receipts/${r.receiptId}`} className="inline-flex items-center gap-1 text-table text-primary hover:underline">
                <FileText size={14} strokeWidth={1.5} aria-hidden />
                {t("openRc")}
              </Link>
            </div>
          )}
          totals={
            rows.length > 0
              ? {
                  supplier: t("totalN", { n: rows.length }),
                  sum: formatMoney(sumOf(rows, (r) => r.sum)),
                  paid: formatMoney(sumOf(rows, (r) => r.paid)),
                  left: formatMoney(sumOf(rows, (r) => r.left)),
                }
              : undefined
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-80">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder={t("search")}
                  className="[&>label]:sr-only"
                />
              </div>
              <MultiFilter label={t("col.supplier")} options={supplierOpts} selected={suppliers} onChange={setSuppliers} searchable />
              {allBranches ? <MultiFilter label={t("col.branch")} options={branchOpts} selected={branches} onChange={setBranches} /> : null}
              <MultiFilter label={t("col.pay")} options={payOpts} selected={payTypes} onChange={setPayTypes} />
              <MultiFilter label={t("col.owner")} options={ownerOpts} selected={owners} onChange={setOwners} searchable />
              {filtered ? (
                <Button variant="tertiary" size="sm" onClick={clear}>
                  {t("clearFilters")}
                </Button>
              ) : null}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={clear} />
            ) : (
              <EmptyState icon={HandCoins} title={t("emptyTitle")} description={t("emptyDescription")} />
            )
          }
        />
      )}
    </div>
  );
}

function Kpi(props: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  rows: Invoice[];
  valueClass?: string;
  active: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("debts.pay");
  const Icon = props.icon;
  const sum = sumOf(props.rows, (r) => r.left);
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-card border bg-surface px-4 py-3.5 text-left transition-colors hover:border-text-secondary",
        props.active ? "border-primary" : "border-border",
      )}
    >
      <span className="flex items-center gap-2 text-caption font-medium text-text-secondary">
        <span className={cn("flex size-6 flex-none items-center justify-center rounded-[6px]", props.iconClass)}>
          <Icon size={14} strokeWidth={1.5} aria-hidden />
        </span>
        {props.label}
      </span>
      <span className={cn("max-w-full truncate text-kpi tabular-nums", props.rows.length > 0 && props.valueClass)}>{formatMoney(sum)}</span>
      <span className="text-caption text-text-secondary">{t("nDocs", { n: props.rows.length })}</span>
    </button>
  );
}

function Term({ r }: { r: Invoice }) {
  const t = useTranslations("debts.pay");
  const b = bucketOf(r);
  if (b === "paid") return <span className="font-medium text-success">{r.prepaid ? t("prepaidShort") : t("st.paid")}</span>;
  if (r.days == null) return dash;
  if (r.days < 0) return <span className="font-medium text-danger">{t("late", { n: -r.days })}</span>;
  if (r.days === 0) return <span className="font-medium text-warning">{t("today")}</span>;
  return <span className={cn("font-medium", r.days <= 3 ? "text-warning" : "text-text-secondary")}>{t("left", { n: r.days })}</span>;
}

const ST: Record<"paid" | "late" | "today" | "part" | "open", { tone: Tone; icon: LucideIcon }> = {
  paid: { tone: "success", icon: CircleCheck },
  late: { tone: "danger", icon: ClockAlert },
  today: { tone: "warning", icon: CalendarCheck },
  part: { tone: "neutral", icon: Hourglass },
  open: { tone: "neutral", icon: Hourglass },
};

function PayStatus({ r }: { r: Invoice }) {
  const t = useTranslations("debts.pay");
  const b = bucketOf(r);
  const k = b === "paid" ? "paid" : b === "late" ? "late" : b === "today" ? "today" : r.paid !== "0.00" ? "part" : "open";
  return (
    <Badge tone={ST[k].tone} icon={ST[k].icon}>
      {k === "paid" && r.prepaid ? t("prepaidShort") : t(`st.${k}`)}
    </Badge>
  );
}
