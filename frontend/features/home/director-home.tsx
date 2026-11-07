"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  ClockAlert,
  FilePen,
  FileText,
  FileX,
  Gift,
  HandCoins,
  House,
  ListOrdered,
  type LucideIcon,
  PackageCheck,
  PackageX,
  ScanBarcode,
  ScanLine,
  Stamp,
  Truck,
  Undo2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { uzLatn } from "@/i18n/messages.generated";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  axisLabel,
  firstName,
  greetKey,
  maxCents,
  mergeSuppliers,
  minusMoney,
  share,
  sumMoney,
  tashkentHour,
  toCents,
} from "./director-view";
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

const PT_TABS = ["sales", "customerDebt", "supplierDebt", "expenses"] as const;
type PtTab = (typeof PT_TABS)[number];

/** «Diqqat talab qiladi» ikonkalari (prototip AT_ICON). */
const ATT_ICON: Partial<Record<AttentionKey, LucideIcon>> = {
  o1: HandCoins,
  o2: HandCoins,
  o3: HandCoins,
  o4: HandCoins,
  dir: Stamp,
  br: Stamp,
  cash: Banknote,
  exp: CircleX,
  e1: CalendarClock,
  e2: CalendarClock,
  e3: CalendarClock,
  s0: ClockAlert,
  s1: CalendarClock,
  s3: CalendarClock,
  rcp: PackageCheck,
  bns: Gift,
  ok: Truck,
  fs: Truck,
  drv: Truck,
  inc: ClipboardCheck,
  inl: ClipboardCheck,
  hc: FileX,
  qy: Undo2,
};

/** Direktor / Admin / Buxgalter (barcha filiallar) va Filial rahbari (oʻz filiali) bosh sahifasi — prototip `Home.dc.html` (SPEC 8). */
export function DirectorHome() {
  const t = useTranslations("home");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, REPORTS_ALL) || can(me.data, REPORTS_VIEW);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState("month");
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
  const name = firstName(me.data?.fullName);
  const greet = t(`dir.${greetKey(tashkentHour())}`) + (name ? `, ${name}` : "");
  const branchName = h ? (h.branchId == null ? t("dir.allBr") : (h.branches.find((b) => b.id === h.branchId)?.name ?? "")) : "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-page-title">{greet}</h1>
          <p className="mt-0.5 text-body text-text-secondary">
            {formatIsoDate(h?.today ?? todayTashkent())}
            {branchName ? ` · ${branchName}` : ""}
          </p>
        </div>
        <PeriodPicker state={period} />
      </div>
      {home.error ? <ErrorState onRetry={() => home.refetch()} /> : !h ? <Skeleton className="h-40 w-full" /> : <DirectorBody home={h} />}
    </>
  );
}

function DirectorBody({ home: h }: { home: Home }) {
  const t = useTranslations("home.dir");
  const per = h.from === h.to ? formatIsoDate(h.from) : `${formatIsoDate(h.from)} – ${formatIsoDate(h.to)}`;
  const branchTotals: Record<PtTab, ByPayment> = {
    sales: h.sales,
    customerDebt: h.customerDebtBy,
    supplierDebt: h.supplierDebtBy,
    expenses: h.expenses,
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PtCard label={t("sales")} value={h.sales} note={per} href="/shipping" />
        <PtCard label={t("customerDebt")} value={h.customerDebtBy} note={t("today")} href="/debts/customers" />
        <PtCard label={t("supplierDebt")} value={h.supplierDebtBy} note={t("today")} href="/debts/suppliers" />
        <PtCard label={t("expenses")} value={h.expenses} note={per} href="/cash" />
      </div>
      <PtTable rows={h.branches} totals={branchTotals} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <SalesChart home={h} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <Attention home={h} />
        </div>
      </div>
      <OrderStatuses cells={h.orderStatuses} staleDays={h.staleDays} />
      <Branches home={h} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TopDebtors rows={h.topDebtors} />
        <Operators rows={h.operators} per={per} />
      </div>
      {h.supplierStaff && h.supplierCompanies ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Suppliers title={t("supplierStaff")} party={t("employee")} block={h.supplierStaff} href="/reports" />
          <Suppliers title={t("supplierCompany")} party={t("supplier")} block={h.supplierCompanies} href="/reports" />
        </div>
      ) : null}
      <Aging card={h.customerDebt} attention={h.attention} />
    </div>
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

/** Prototip kartasi: sarlavha (+ «Hammasi →» havolasi) va tana. */
function Panel({ title, href, children, footer }: { title: string; href?: string; children: ReactNode; footer?: ReactNode }) {
  const t = useTranslations("home.dir");
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <h2 className="text-subtitle">{title}</h2>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-body text-primary-button hover:underline">
            {t("all")} <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
          </Link>
        ) : null}
      </header>
      {children}
      {footer ? <p className="border-t border-border px-4 py-3 text-caption text-text-secondary">{footer}</p> : null}
    </section>
  );
}

interface MiniCol<T> {
  key: string;
  title: string;
  right?: boolean;
  render: (r: T) => ReactNode;
}

/** Karta ichidagi ixcham jadval (prototip): kulrang sarlavha, 44 px qatorlar, «Jami» qatori. */
function MiniTable<T>({
  caption,
  cols,
  rows,
  rowKey,
  rowHref,
  foot,
  empty,
  minWidth,
}: {
  caption: string;
  cols: MiniCol<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  rowHref?: (r: T) => string;
  foot?: ReactNode[];
  empty: ReactNode;
  minWidth: string;
}) {
  const router = useRouter();
  if (rows.length === 0) return <div className="border-t border-border">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-table" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-table-header text-text-secondary">
            {cols.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("h-10 px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4", c.right ? "text-right" : "text-left")}
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const href = rowHref?.(r);
            return (
              <tr
                key={rowKey(r)}
                className={cn("h-11 border-t border-border", href && "cursor-pointer hover:bg-background")}
                onClick={href ? () => router.push(href) : undefined}
                onKeyDown={href ? (e) => e.key === "Enter" && router.push(href) : undefined}
                tabIndex={href ? 0 : undefined}
              >
                {cols.map((c) => (
                  <td key={c.key} className={cn("px-3 first:pl-4 last:pr-4", c.right ? "text-right tabular-nums" : "text-left")}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {foot ? (
          <tfoot>
            <tr className="h-11 border-t border-border bg-table-header font-semibold">
              {foot.map((v, i) => (
                <td
                  key={cols[i]?.key ?? i}
                  className={cn("px-3 first:pl-4 last:pr-4", cols[i]?.right ? "text-right tabular-nums" : "text-left")}
                >
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

const mny = (v: string) => <span className={nonZero(v) ? "" : "text-text-secondary"}>{formatMoney(v)}</span>;

function PtCard({ label, value, note, href }: { label: string; value: ByPayment; note: string; href: string }) {
  const t = useTranslations("home");
  return (
    <Link href={href} className="block min-w-0 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary">
      <div className="text-body text-text-secondary">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-section-title whitespace-nowrap tabular-nums xl:text-[22px]">{formatMoney(value.total)}</span>
        <span className="text-caption text-text-secondary">{t("dir.soum")}</span>
      </div>
      <div className="mt-1 text-caption text-text-secondary">{note}</div>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 border-t border-border pt-3 text-body">
        <dt className="text-text-secondary">{t("card.cash")}</dt>
        <dd className="text-right tabular-nums">{mny(value.cash)}</dd>
        <dt className="text-text-secondary">{t("card.transfer")}</dt>
        <dd className="text-right tabular-nums">{mny(value.transfer)}</dd>
        <dt className="text-text-secondary">{t("card.online")}</dt>
        <dd className="text-right tabular-nums">{mny(value.online)}</dd>
      </dl>
    </Link>
  );
}

const PT_FIELD: Record<PtTab, "salesBy" | "customerDebtBy" | "supplierDebtBy" | "expensesBy"> = {
  sales: "salesBy",
  customerDebt: "customerDebtBy",
  supplierDebt: "supplierDebtBy",
  expenses: "expensesBy",
};

function PtTable({ rows, totals }: { rows: BranchRow[]; totals: Record<PtTab, ByPayment> }) {
  const t = useTranslations("home");
  const setBranch = useBranchStore((s) => s.setBranchId);
  const [tab, setTab] = useState<PtTab>("sales");
  const f = PT_FIELD[tab];
  const tot = totals[tab];
  const cols: MiniCol<BranchRow>[] = [
    { key: "name", title: t("director.branch"), render: (b) => b.name },
    { key: "cash", title: t("card.cash"), right: true, render: (b) => mny(b[f].cash) },
    { key: "transfer", title: t("card.transfer"), right: true, render: (b) => mny(b[f].transfer) },
    { key: "online", title: t("card.online"), right: true, render: (b) => mny(b[f].online) },
    { key: "total", title: t("dir.total"), right: true, render: (b) => <span className="font-semibold">{formatMoney(b[f].total)}</span> },
  ];
  return (
    <Panel title={t("dir.byPayment")}>
      <div className="px-4">
        <Tabs
          aria-label={t("dir.byPayment")}
          items={PT_TABS.map((k) => ({ key: k, label: t(`dir.${k}`) }))}
          value={tab}
          onChange={(k) => setTab(k as PtTab)}
        />
      </div>
      <div className="mt-3">
        <BranchClickTable
          caption={t("dir.byPayment")}
          cols={cols}
          rows={rows}
          onPick={setBranch}
          foot={[t("dir.total"), formatMoney(tot.cash), formatMoney(tot.transfer), formatMoney(tot.online), formatMoney(tot.total)]}
          minWidth="640px"
        />
      </div>
    </Panel>
  );
}

/** Filial qatorini bosish — shu filialga oʻtish (prototip onBranch). */
function BranchClickTable({
  caption,
  cols,
  rows,
  onPick,
  foot,
  minWidth,
}: {
  caption: string;
  cols: MiniCol<BranchRow>[];
  rows: BranchRow[];
  onPick: (id: number) => void;
  foot: ReactNode[];
  minWidth: string;
}) {
  const t = useTranslations("home.director");
  if (rows.length === 0) return <EmptyState icon={Building2} title={t("noBranches")} description={t("noBranchesHint")} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-table" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-table-header text-text-secondary">
            {cols.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("h-10 px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4", c.right ? "text-right" : "text-left")}
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr
              key={b.id}
              className="h-11 cursor-pointer border-t border-border hover:bg-background"
              onClick={() => onPick(b.id)}
              onKeyDown={(e) => e.key === "Enter" && onPick(b.id)}
              tabIndex={0}
            >
              {cols.map((c) => (
                <td key={c.key} className={cn("px-3 first:pl-4 last:pr-4", c.right ? "text-right tabular-nums" : "text-left")}>
                  {c.render(b)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="h-11 border-t border-border bg-table-header font-semibold">
            {foot.map((v, i) => (
              <td
                key={cols[i]?.key ?? i}
                className={cn("px-3 first:pl-4 last:pr-4", cols[i]?.right ? "text-right tabular-nums" : "text-left")}
              >
                {v}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SalesChart({ home: h }: { home: Home }) {
  const t = useTranslations("home.dir");
  const [tip, setTip] = useState<number | null>(null);
  const days = h.daily;
  const n = Math.max(1, days.length);
  const W = 600;
  const H = 160;
  const max = maxCents(days.map((d) => d.amount));
  const bw = W / n;
  const barW = Math.min(bw * 0.6, 36);
  const cur = tip == null ? null : days[tip];
  const empty = days.every((d) => !nonZero(d.amount));
  return (
    <Panel title={t("chart")}>
      <div className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-[1fr_auto]">
        <div className="relative min-w-0">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-40 w-full" role="img" aria-label={t("chart")}>
            {[0, 0.25, 0.5, 0.75].map((y) => (
              <line
                key={y}
                x1={0}
                x2={W}
                y1={Math.round(H * y) + 0.5}
                y2={Math.round(H * y) + 0.5}
                className="stroke-border"
                strokeWidth={1}
              />
            ))}
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-border" strokeWidth={1} />
            {days.map((d, i) => {
              const s = share(d.amount, max);
              const bh = s > 0 ? Math.max(2, s * (H - 8)) : 0;
              return (
                <rect
                  key={d.date}
                  x={i * bw + (bw - barW) / 2}
                  y={H - bh}
                  width={barW}
                  height={bh}
                  rx={2}
                  className={tip === i ? "fill-primary-button" : "fill-primary"}
                  onMouseEnter={() => setTip(i)}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}
          </svg>
          <div className="mt-1 flex text-caption text-text-secondary">
            {days.map((d, i) => (
              <span key={d.date} className="flex-1 text-center tabular-nums">
                {axisLabel(d.date, i, days.length)}
              </span>
            ))}
          </div>
          {cur ? (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-control border border-border bg-surface px-3 py-2 text-caption whitespace-nowrap"
              style={{ left: `${((tip! + 0.5) / n) * 100}%` }}
            >
              <div className="text-text-secondary">{formatIsoDate(cur.date)}</div>
              <div className="font-semibold tabular-nums">
                {formatMoney(cur.amount)} {t("soum")}
              </div>
              <div className="text-text-secondary">{t("docsN", { n: cur.docs })}</div>
            </div>
          ) : null}
          {empty ? <p className="mt-2 text-caption text-text-secondary">{t("noSales")}</p> : null}
        </div>
        <div className="flex flex-col gap-4 border-border sm:min-w-44 sm:border-l sm:pl-4">
          <div>
            <div className="text-caption text-text-secondary">{t("ordersN")}</div>
            <div className="text-section-title tabular-nums">{h.salesDocs}</div>
          </div>
          <div>
            <div className="text-caption text-text-secondary">{t("avgOrder")}</div>
            <div className="text-section-title tabular-nums">{h.salesDocs ? formatMoney(h.avgSale) : "—"}</div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Attention({ home }: { home: Home }) {
  const t = useTranslations("home.attention");
  const td = useTranslations("home.dir");
  const me = useMe();
  const rows = attentionRows(home.attention, { director: can(me.data, "approvals.director"), branch: can(me.data, "approvals.branch") });
  return (
    <Panel title={td("attention")}>
      {rows.length === 0 ? (
        <EmptyState icon={CircleCheck} title={t("allGood")} description={t("directorEmpty")} />
      ) : (
        <ul className="mx-4 mb-2 divide-y divide-border border-t border-border">
          {rows.map((r) => {
            const Icon = ATT_ICON[r.key] ?? AlertTriangle;
            const tone = r.danger ? "text-danger" : r.key === "ok" || r.key === "fs" ? "text-info" : "text-warning";
            return (
              <li key={r.key}>
                <Link href={r.href} className="flex min-h-11 items-center gap-3 py-2 text-body hover:bg-background">
                  <Icon size={16} strokeWidth={1.5} aria-hidden className={cn("shrink-0", tone)} />
                  <span className="min-w-0 flex-1">{t(`rows.${r.key}`, r.values)}</span>
                  <span className="shrink-0 text-right tabular-nums">{r.money ? formatMoney(r.value) : r.value}</span>
                  <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const STATUS_ICON: Record<(typeof ORDER_STATUSES)[number], LucideIcon> = {
  DRAFT: FilePen,
  PENDING_APPROVAL: Stamp,
  QUEUED: ListOrdered,
  PICKING: ScanLine,
  MARKING: ScanBarcode,
  CHECKING: ClipboardCheck,
  DOCUMENTING: FileText,
  LOADING: PackageCheck,
  IN_TRANSIT: Truck,
  DELIVERED: House,
  UNDELIVERED: PackageX,
  REJECTED: CircleX,
  CANCELLED: CircleX,
};

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

/** Buyurtma holatlari (prototip statBlock). hrefSuffix — havolaga qoʻshimcha soʻrov (masalan, Operator uchun «&mine=1»). */
export function OrderStatuses({ cells, staleDays, hrefSuffix = "" }: { cells: StatusCell[]; staleDays: number; hrefSuffix?: string }) {
  const t = useTranslations("home");
  const [filter, setFilter] = useState<StatusFilter>("all");
  return (
    <Panel title={t("director.orderStatuses")} href={`/orders${hrefSuffix ? `?${hrefSuffix.replace(/^&/, "")}` : ""}`}>
      <div className="px-4">
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
      <ul className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-4 min-[1610px]:grid-cols-6">
        {cells.map((c) => {
          const v = cellValue(c, filter);
          const delivered = c.status === "DELIVERED";
          const late = !delivered && c.staleCount > 0;
          const Icon = isOrderStatus(c.status) ? STATUS_ICON[c.status] : FileText;
          return (
            <li key={c.status} className="flex min-w-0 flex-col overflow-hidden rounded-control border border-border">
              <Link href={`/orders?status=${c.status}${hrefSuffix}`} className="block flex-1 px-3 pt-2.5 pb-2 hover:bg-background">
                <div className="flex items-center gap-1.5 truncate text-caption text-text-secondary">
                  <Icon size={14} strokeWidth={1.5} aria-hidden className={c.status === "UNDELIVERED" ? "text-danger" : "text-primary"} />
                  {isOrderStatus(c.status) ? t(`orderStatus.${c.status}`) : c.status}
                </div>
                <div className="mt-1 text-section-title tabular-nums">{v.count}</div>
                <div className="text-caption tabular-nums text-text-secondary">{formatMoney(v.amount)}</div>
              </Link>
              {late ? (
                <Link
                  href={`/orders?status=${c.status}&stale=1${hrefSuffix}`}
                  className="border-t border-danger-bg bg-danger-bg px-3 py-1.5 text-caption font-medium text-danger"
                >
                  {t("dir.lateN", { d: staleDays, n: c.staleCount, s: formatMoney(c.staleAmount) })}
                </Link>
              ) : (
                <div className="border-t border-border px-3 py-1.5 text-caption text-text-secondary">
                  {delivered ? t("dir.delivPer") : t("dir.lateN", { d: staleDays, n: 0, s: formatMoney("0") })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Branches({ home: h }: { home: Home }) {
  const t = useTranslations("home");
  const setBranch = useBranchStore((s) => s.setBranchId);
  const cost = h.branches.some((b) => b.stockValue != null);
  const sum = (pick: (b: BranchRow) => string) => formatMoney(sumMoney(h.branches.map(pick)));
  const cols: MiniCol<BranchRow>[] = [
    { key: "name", title: t("director.branch"), render: (b) => b.name },
    { key: "sales", title: t("dir.sales"), right: true, render: (b) => formatMoney(b.sales) },
    { key: "debt", title: t("dir.customerDebt"), right: true, render: (b) => formatMoney(b.customerDebt) },
    {
      key: "over",
      title: t("dir.overdue"),
      right: true,
      render: (b) => <span className={nonZero(b.overdue) ? "text-danger" : ""}>{formatMoney(b.overdue)}</span>,
    },
    ...(cost ? [{ key: "stock", title: t("dir.stock"), right: true, render: (b: BranchRow) => formatMoney(b.stockValue ?? "0") }] : []),
    { key: "money", title: t("dir.money"), right: true, render: (b) => formatMoney(b.money) },
  ];
  const foot: ReactNode[] = [
    t("dir.total"),
    sum((b) => b.sales),
    sum((b) => b.customerDebt),
    sum((b) => b.overdue),
    ...(cost ? [sum((b) => b.stockValue ?? "0")] : []),
    sum((b) => b.money),
  ];
  return (
    <Panel title={t("director.branches")} footer={t("dir.grpDebt", { v: formatMoney(h.groupDebt) })}>
      <BranchClickTable caption={t("director.branches")} cols={cols} rows={h.branches} onPick={setBranch} foot={foot} minWidth="860px" />
    </Panel>
  );
}

function TopDebtors({ rows }: { rows: Debtor[] }) {
  const t = useTranslations("home");
  const cols: MiniCol<Debtor>[] = [
    { key: "name", title: t("director.customer"), render: (d) => d.name },
    { key: "branch", title: t("director.branch"), render: (d) => <span className="font-mono text-caption">{d.branches || "—"}</span> },
    { key: "debt", title: t("director.debt"), right: true, render: (d) => formatMoney(d.debt) },
    {
      key: "late",
      title: t("dir.late"),
      right: true,
      render: (d) =>
        d.maxOverdueDays > 0 ? (
          <span className={d.maxOverdueDays > 90 ? "text-danger" : "text-warning"}>{t("dir.daysOver", { n: d.maxOverdueDays })}</span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
  ];
  return (
    <Panel title={t("director.topDebtors")} href="/debts/customers">
      <MiniTable
        caption={t("director.topDebtorsCaption")}
        cols={cols}
        rows={rows}
        rowKey={(d) => String(d.id)}
        rowHref={() => "/debts/customers"}
        minWidth="460px"
        empty={<EmptyState icon={CircleCheck} title={t("director.noDebtors")} description={t("director.noDebtorsHint")} />}
      />
    </Panel>
  );
}

function StatusWord({ active }: { active: boolean }) {
  const t = useTranslations("home.director");
  return <span className={active ? "text-success" : "text-text-secondary"}>{active ? t("active") : t("passive")}</span>;
}

function Operators({ rows, per }: { rows: OperatorRow[]; per: string }) {
  const t = useTranslations("home");
  const cols: MiniCol<OperatorRow>[] = [
    { key: "name", title: t("dir.employee"), render: (o) => o.name },
    { key: "docs", title: t("dir.orders"), right: true, render: (o) => o.docs },
    { key: "sales", title: t("dir.sales"), right: true, render: (o) => formatMoney(o.sales) },
    { key: "st", title: t("dir.status"), render: (o) => <StatusWord active={o.active} /> },
  ];
  return (
    <Panel title={t("dir.operators")} href="/reports/sales" footer={t("dir.opNote", { per })}>
      <MiniTable
        caption={t("director.operatorsCaption")}
        cols={cols}
        rows={rows}
        rowKey={(o) => String(o.id)}
        minWidth="430px"
        empty={<EmptyState icon={Users} title={t("director.noSales")} description={t("director.noSalesHint")} />}
      />
    </Panel>
  );
}

function Suppliers({ title, party, block, href }: { title: string; party: string; block: SupplierBlock; href: string }) {
  const t = useTranslations("home.director");
  const rows = mergeSuppliers<SupplierStat>(block.active, block.passive);
  const cols: MiniCol<SupplierStat & { active: boolean }>[] = [
    { key: "name", title: party, render: (r) => r.name },
    { key: "brought", title: t("brought"), right: true, render: (r) => formatMoney(r.brought) },
    { key: "sold", title: t("sold"), right: true, render: (r) => formatMoney(r.sold) },
    { key: "left", title: t("left"), right: true, render: (r) => <span className="font-semibold">{formatMoney(r.left)}</span> },
    { key: "st", title: t("status"), render: (r) => <StatusWord active={r.active} /> },
  ];
  return (
    <Panel title={title} href={href} footer={t("suppliersNote")}>
      <MiniTable
        caption={t("suppliersCaption", { title })}
        cols={cols}
        rows={rows}
        rowKey={(r) => String(r.id)}
        minWidth="470px"
        empty={<EmptyState icon={Users} title={t("noIncome")} description={t("noIncomeHint")} />}
      />
    </Panel>
  );
}

function Aging({ card, attention: a }: { card: Home["customerDebt"]; attention: Home["attention"] }) {
  const t = useTranslations("home.dir");
  const segs = [
    { key: "ag0", value: minusMoney(card.debt, card.overdue), color: "bg-border", href: "/debts/customers" },
    { key: "ag1", value: a.overdue1to30, color: "bg-warning/50", href: "/debts/customers" },
    { key: "ag2", value: a.overdue31to60, color: "bg-warning", href: "/debts/customers" },
    { key: "ag3", value: a.overdue61to90, color: "bg-danger/70", href: "/debts/customers" },
    { key: "ag4", value: a.overdue90plus, color: "bg-danger", href: "/debts/customers" },
  ] as const;
  const total = segs.reduce((s, x) => s + (toCents(x.value) > 0n ? toCents(x.value) : 0n), 0n);
  return (
    <Panel title={t("aging")}>
      <div className="px-4 pb-4">
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-background" aria-hidden>
          {segs.map((s) => {
            const w = share(s.value, total);
            return w > 0 ? <span key={s.key} className={cn("h-full min-w-1.5", s.color)} style={{ flexGrow: w, flexBasis: 0 }} /> : null;
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          {segs.map((s) => (
            <Link key={s.key} href={s.href} className="block rounded-control hover:bg-background">
              <div className="flex items-center gap-1.5 text-caption text-text-secondary">
                <span className={cn("size-2 rounded-xs", s.color)} aria-hidden />
                {t(s.key)}
              </div>
              <div className="mt-1 font-semibold tabular-nums">{formatMoney(s.value)}</div>
            </Link>
          ))}
        </div>
      </div>
    </Panel>
  );
}
