"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Building2, ChevronRight, HandCoins, Receipt, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { uzLatn } from "@/i18n/messages.generated";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useClientTable } from "@/lib/client-table";
import { useBranchStore } from "@/lib/stores/branch";
import { PeriodPicker, usePeriodState } from "./period-picker";

type Home = components["schemas"]["Home"];
type ByPayment = components["schemas"]["ByPayment"];
type BranchRow = components["schemas"]["BranchRow"];
type Debtor = components["schemas"]["Debtor"];
type StatusCell = components["schemas"]["StatusCell"];
type OperatorRow = components["schemas"]["OperatorRow"];
type SupplierBlock = components["schemas"]["SupplierBlock"];
type SupplierStat = components["schemas"]["SupplierStat"];

export type StatusFilter = "all" | "today" | "stale";

/** Buyurtma holati katagi tanlangan filtr bo'yicha (SPEC 8: Hammasi / Bugungi / Kechikkanlar). */
export function cellValue(c: StatusCell, f: StatusFilter): { count: number; amount: string } {
  if (f === "today") return { count: c.todayCount, amount: c.todayAmount };
  if (f === "stale") return { count: c.staleCount, amount: c.staleAmount };
  return { count: c.count, amount: c.amount };
}

export const REPORTS_ALL = "reports.all";
export const REPORTS_VIEW = "reports.view";

const money = (v: string) => <span className="font-mono tabular-nums">{formatMoney(v)}</span>;

/** Summa noldan farqlimi (satr: «0.00», «-12.50», «1250000.00»). */
export function nonZero(v: string): boolean {
  return /[1-9]/.test(v);
}

/** «Diqqat talab qiladi» qatori kaliti = tarjima kaliti `home.attention.rows.<key>`. */
export type AttentionKey = keyof (typeof uzLatn)["home"]["attention"]["rows"];

export interface AttentionRow {
  key: AttentionKey;
  /** Matndagi oʻrinbosarlar (masalan, {count}). */
  values?: Record<string, number>;
  value: string;
  href: string;
  /** Pul bo'lsa — formatMoney, aks holda son. */
  money: boolean;
  danger?: boolean;
}

/** «Diqqat talab qiladi» qatorlari (SPEC 8): har biri tegishli sahifaga filtr bilan olib boradi; nol bo'lganlari yashiriladi. */
export function attentionRows(
  a: Home["attention"],
  perms: { director: boolean; branch: boolean } = { director: true, branch: true },
): AttentionRow[] {
  const rows: AttentionRow[] = [
    { key: "o1", value: a.overdue1to30, href: "/debts/customers", money: true },
    { key: "o2", value: a.overdue31to60, href: "/debts/customers", money: true },
    { key: "o3", value: a.overdue61to90, href: "/debts/customers", money: true, danger: true },
    { key: "o4", value: a.overdue90plus, href: "/debts/customers", money: true, danger: true },
    {
      key: "dir",
      values: { count: a.directorOrders.count },
      value: a.directorOrders.amount,
      href: "/orders?status=PENDING_APPROVAL",
      money: true,
    },
    {
      key: "br",
      values: { count: a.branchOrders.count },
      value: a.branchOrders.amount,
      href: "/orders?status=PENDING_APPROVAL",
      money: true,
    },
    {
      key: "cash",
      values: { count: a.cashApprovals.count },
      value: a.cashApprovals.amount,
      href: "/cash",
      money: true,
    },
    { key: "exp", value: String(a.expiring.expired), href: "/expiry", money: false, danger: true },
    { key: "e1", value: String(a.expiring.d0to30), href: "/expiry", money: false },
    { key: "e2", value: String(a.expiring.d31to60), href: "/expiry", money: false },
    { key: "e3", value: String(a.expiring.d61to90), href: "/expiry", money: false },
    { key: "s0", value: a.supplierOverdue, href: "/debts/suppliers", money: true, danger: true },
    { key: "s1", value: a.supplierToday, href: "/debts/suppliers", money: true },
    { key: "s3", value: a.supplierNext3Days, href: "/debts/suppliers", money: true },
    {
      key: "rcp",
      value: String(a.receiptsToPost),
      href: "/receipts?status=ACCEPTED",
      money: false,
    },
    { key: "bns", value: String(a.bonusDue), href: "/bonuses", money: false },
    {
      key: "zk",
      value: String(a.zoneTransfersPending),
      href: "/zone-transfers?status=PENDING",
      money: false,
    },
    {
      key: "ok",
      value: String(a.transfersInTransit),
      href: "/warehouse-transfers?status=IN_TRANSIT",
      money: false,
    },
    {
      key: "fs",
      value: String(a.branchSalesToReceive),
      href: "/branch-sales?status=IN_TRANSIT",
      money: false,
    },
    {
      key: "hc",
      value: String(a.writeOffsPending),
      href: "/write-offs?status=PENDING",
      money: false,
    },
    {
      key: "qy",
      value: String(a.supplierReturnsPending),
      href: "/supplier-returns?status=PENDING",
      money: false,
    },
    {
      key: "oks",
      value: String(a.transferShortagesOpen),
      href: "/warehouse-transfers?status=RECEIVED",
      money: false,
    },
    {
      key: "fss",
      value: String(a.branchSaleShortagesOpen),
      href: "/branch-sales?status=RECEIVED",
      money: false,
    },
    {
      key: "inc",
      value: String(a.inventoryCheck),
      href: "/inventory-counts?status=CHECK",
      money: false,
    },
    {
      key: "inl",
      value: String(a.inventoryCounting),
      href: "/inventory-counts?status=COUNTING",
      money: false,
    },
    { key: "drv", value: a.driverCash, href: "/cash", money: true },
  ];
  return rows.filter((r) => nonZero(r.value) && (r.key !== "dir" || perms.director) && (r.key !== "br" || perms.branch));
}

const BRANCH_TABS = ["sales", "customerDebt", "supplierDebt", "expenses"] as const;
type BranchTab = (typeof BRANCH_TABS)[number];

/** Direktor / Admin / Buxgalter (barcha filiallar) va Filial rahbari (oʻz filiali) bosh sahifasi (SPEC 8). */
export function DirectorHome() {
  const t = useTranslations("home");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, REPORTS_ALL) || can(me.data, REPORTS_VIEW);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState();
  const range = period.range;
  const home = useQuery({
    queryKey: ["home", "director", branchId, range.from, range.to],
    queryFn: () =>
      unwrap(
        api.GET("/api/home/director", {
          params: { query: { branchId: branchId ?? undefined, from: range.from ?? undefined, to: range.to ?? undefined } },
        }),
      ),
    enabled: allowed && !!range.from && !!range.to,
    refetchInterval: 120_000,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const h = home.data;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        <PeriodPicker state={period} />
      </div>
      {home.error ? (
        <ErrorState onRetry={() => home.refetch()} />
      ) : !h ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-caption text-text-secondary">
            {h.from === h.to ? formatIsoDate(h.from) : `${formatIsoDate(h.from)} – ${formatIsoDate(h.to)}`}
            {h.branchId == null ? ` · ${t("allBranches")}` : ""}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PaymentCard icon={Banknote} title={t("card.salesNet")} note={t("card.salesNote")} value={h.sales} />
            <DebtCard icon={Users} title={t("card.customerDebt")} card={h.customerDebt} href="/debts/customers" />
            <DebtCard icon={HandCoins} title={t("card.supplierDebt")} card={h.supplierDebt} href="/debts/suppliers" />
            <PaymentCard icon={Receipt} title={t("card.expenses")} note={t("card.expensesNote")} value={h.expenses} />
          </div>
          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <Attention home={h} />
            <TopDebtors rows={h.topDebtors} />
          </div>
          <OrderStatuses cells={h.orderStatuses} staleDays={h.staleDays} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Branches rows={h.branches} />
            <Operators rows={h.operators} />
          </div>
          {h.supplierStaff && h.supplierCompanies ? (
            <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
              <Suppliers title={t("director.supplierStaff")} party={t("director.staff")} block={h.supplierStaff} />
              <Suppliers title={t("director.supplierCompany")} party={t("director.company")} block={h.supplierCompanies} />
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

export function CardTitle({ icon: Icon, title }: { icon: typeof Banknote; title: string }) {
  return (
    <div className="flex items-center gap-2 text-caption text-text-secondary">
      <Icon size={16} strokeWidth={1.5} aria-hidden />
      {title}
    </div>
  );
}

export function PaymentCard({ icon, title, note, value }: { icon: typeof Banknote; title: string; note: string; value: ByPayment }) {
  const t = useTranslations("home.card");
  return (
    <Card>
      <CardTitle icon={icon} title={title} />
      <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(value.total)}</div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-caption text-text-secondary">
        <dt>{t("cash")}</dt>
        <dd className="text-right font-mono tabular-nums">{formatMoney(value.cash)}</dd>
        <dt>{t("transfer")}</dt>
        <dd className="text-right font-mono tabular-nums">{formatMoney(value.transfer)}</dd>
        <dt>{t("online")}</dt>
        <dd className="text-right font-mono tabular-nums">{formatMoney(value.online)}</dd>
      </dl>
      <div className="mt-2 text-caption text-text-secondary">{note}</div>
    </Card>
  );
}

function DebtCard({ icon, title, card, href }: { icon: typeof Banknote; title: string; card: Home["customerDebt"]; href: string }) {
  const t = useTranslations("home.card");
  return (
    <Card>
      <CardTitle icon={icon} title={title} />
      <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(card.debt)}</div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-caption text-text-secondary">
        <dt>{t("overdue")}</dt>
        <dd className={`text-right font-mono tabular-nums ${nonZero(card.overdue) ? "text-danger" : ""}`}>{formatMoney(card.overdue)}</dd>
        <dt>{t("advance")}</dt>
        <dd className="text-right font-mono tabular-nums">{formatMoney(card.advance)}</dd>
      </dl>
      <Link href={href} className="mt-2 inline-block text-caption text-primary-button hover:underline">
        {t("openDebts")}
      </Link>
    </Card>
  );
}

function Attention({ home }: { home: Home }) {
  const t = useTranslations("home.attention");
  const me = useMe();
  const rows = attentionRows(home.attention, { director: can(me.data, "approvals.director"), branch: can(me.data, "approvals.branch") });
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-subtitle">
        <AlertTriangle size={18} strokeWidth={1.5} aria-hidden /> {t("title")}
      </h2>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={AlertTriangle} title={t("allGood")} description={t("directorEmpty")} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-body hover:bg-background">
                  <span className={r.danger ? "text-danger" : ""}>{t(`rows.${r.key}`, r.values)}</span>
                  <span className="flex items-center gap-2">
                    {r.money ? money(r.value) : <span className="font-mono tabular-nums">{r.value}</span>}
                    <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function TopDebtors({ rows }: { rows: Debtor[] }) {
  const t = useTranslations("home");
  const columns: TableColumn<Debtor>[] = [
    { key: "name", title: t("director.customer"), wrap: true },
    { key: "debt", title: t("director.debt"), align: "right", render: (d) => money(d.debt) },
    {
      key: "overdue",
      title: t("card.overdue"),
      align: "right",
      render: (d) => (
        <span className={nonZero(d.overdue) ? "text-danger" : ""}>
          {money(d.overdue)}
          {d.maxOverdueDays > 0 ? (
            <span className="ml-1 text-caption text-text-secondary">{t("director.overdueDays", { days: d.maxOverdueDays })}</span>
          ) : null}
        </span>
      ),
    },
  ];
  return (
    <section>
      <h2 className="mb-2 text-subtitle">{t("director.topDebtors")}</h2>
      <Table
        caption={t("director.topDebtorsCaption")}
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(d) => String(d.id)}
        emptyState={<EmptyState icon={Users} title={t("director.noDebtors")} description={t("director.noDebtorsHint")} />}
      />
    </section>
  );
}

function Branches({ rows }: { rows: BranchRow[] }) {
  const t = useTranslations("home.director");
  const [tab, setTab] = useState<BranchTab>("sales");
  const title = t(`branchTab.${tab}`);
  const table = useClientTable(rows);
  const columns: TableColumn<BranchRow>[] = [
    { key: "name", title: t("branch"), sortable: true },
    { key: tab, title, align: "right", sortable: true, render: (b) => money(b[tab]) },
  ];
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-subtitle">
          <Building2 size={18} strokeWidth={1.5} aria-hidden /> {t("branches")}
        </h2>
        <Tabs
          aria-label={t("metric")}
          items={BRANCH_TABS.map((k) => ({ key: k, label: t(`branchTab.${k}`) }))}
          value={tab}
          onChange={(k) => setTab(k as BranchTab)}
        />
      </div>
      <Table
        caption={t("branches")}
        density="compact"
        columns={columns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.onSortChange}
        pagination={table.pagination}
        rowKey={(b) => String(b.id)}
        emptyState={<EmptyState icon={Building2} title={t("noBranches")} description={t("noBranchesHint")} />}
      />
    </section>
  );
}

const ORDER_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "QUEUED",
  "PICKING",
  "MARKING",
  "CHECKING",
  "DOCUMENTING",
  "LOADING",
  "IN_TRANSIT",
  "DELIVERED",
  "UNDELIVERED",
  "REJECTED",
  "CANCELLED",
] as const;

function isOrderStatus(s: string): s is (typeof ORDER_STATUSES)[number] {
  return (ORDER_STATUSES as readonly string[]).includes(s);
}

/** hrefSuffix — havolaga qoʻshimcha soʻrov (masalan, Operator uchun «&mine=1»). */
export function OrderStatuses({ cells, staleDays, hrefSuffix = "" }: { cells: StatusCell[]; staleDays: number; hrefSuffix?: string }) {
  const t = useTranslations("home");
  const [filter, setFilter] = useState<StatusFilter>("all");
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-subtitle">{t("director.orderStatuses")}</h2>
        <Tabs
          aria-label={t("director.ordersFilter")}
          items={[
            { key: "all", label: t("director.filter.all") },
            { key: "today", label: t("director.filter.today") },
            { key: "stale", label: t("director.filter.stale") },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as StatusFilter)}
        />
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {cells.map((c) => {
          const v = cellValue(c, filter);
          return (
            <li key={c.status}>
              <Link
                href={`/orders?status=${c.status}${hrefSuffix}`}
                className="block rounded-card border border-border bg-surface p-3 hover:bg-background"
              >
                <div className="truncate text-caption text-text-secondary">
                  {isOrderStatus(c.status) ? t(`orderStatus.${c.status}`) : c.status}
                </div>
                <div className="mt-1 font-mono text-subtitle tabular-nums">{v.count}</div>
                <div className="font-mono text-caption tabular-nums text-text-secondary">{formatMoney(v.amount)}</div>
                {filter === "all" && c.staleCount > 0 ? (
                  <div className="mt-1 text-caption text-warning">{t("director.staleCount", { count: c.staleCount, days: staleDays })}</div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Operators({ rows }: { rows: OperatorRow[] }) {
  const t = useTranslations("home.director");
  const columns: TableColumn<OperatorRow>[] = [
    { key: "name", title: t("operator") },
    { key: "sales", title: t("salesVat"), align: "right", render: (o) => money(o.sales) },
  ];
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-subtitle">
        <Users size={18} strokeWidth={1.5} aria-hidden /> {t("operators")}
      </h2>
      <Table
        caption={t("operatorsCaption")}
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(o) => String(o.id)}
        emptyState={<EmptyState icon={Users} title={t("noSales")} description={t("noSalesHint")} />}
      />
    </section>
  );
}

function Suppliers({ title, party, block }: { title: string; party: string; block: SupplierBlock }) {
  const t = useTranslations("home.director");
  const [tab, setTab] = useState<"active" | "passive">("active");
  const columns: TableColumn<SupplierStat>[] = [
    { key: "name", title: party, wrap: true },
    { key: "brought", title: t("brought"), align: "right", render: (r) => money(r.brought) },
    { key: "sold", title: t("sold"), align: "right", render: (r) => money(r.sold) },
    { key: "left", title: t("left"), align: "right", render: (r) => money(r.left) },
  ];
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-subtitle">{title}</h2>
        <Tabs
          aria-label={title}
          items={[
            { key: "active", label: t("active"), count: block.active.length },
            { key: "passive", label: t("passive"), count: block.passive.length },
          ]}
          value={tab}
          onChange={(k) => setTab(k as "active" | "passive")}
        />
      </div>
      <Table
        caption={t("suppliersCaption", { title })}
        density="compact"
        columns={columns}
        rows={block[tab]}
        rowKey={(r) => String(r.id)}
        emptyState={
          <EmptyState
            icon={HandCoins}
            title={tab === "active" ? t("noIncome") : t("noPassive")}
            description={tab === "active" ? t("noIncomeHint") : t("noPassiveHint")}
          />
        }
      />
      <p className="mt-1 text-caption text-text-secondary">{t("suppliersNote")}</p>
    </section>
  );
}
