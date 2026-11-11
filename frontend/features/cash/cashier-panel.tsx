"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  HandCoins,
  Hourglass,
  Lock,
  LockKeyhole,
  Receipt,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { PeriodPicker, usePeriodState } from "@/features/home/period-picker";
import { sumMoney } from "./list-model";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranches } from "@/features/employees/api";
import { firstName, greetKey, tashkentHour } from "@/features/home/director-view";
import { cn } from "@/lib/cn";
import { formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { PAYMENT_MT, useAccounts } from "@/features/payments/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { fromCents, isDocTitleKey, toCents } from "./api";

type AccountTurnover = components["schemas"]["AccountTurnover"];
type RecentMove = components["schemas"]["RecentMove"];
type DayPoint = components["schemas"]["DayPoint"];

const money = (v: string) => <span className="tabular-nums">{formatMoney(v)}</span>;

/** Kunlik dinamika ustuni uchun nisbat (0–100), tiyinlarda — float faqat koʻrinish kengligi uchun. */

type AccountKind = "CASH" | "TERMINAL" | "BANK";

export function barPercent(value: string, max: bigint): number {
  if (max <= 0n) return 0;
  return Number((toCents(value) * 100n) / max);
}

export function dayMax(days: DayPoint[]): bigint {
  return days.reduce((m, d) => {
    const a = toCents(d.income);
    const b = toCents(d.expense);
    return [m, a, b].reduce((x, y) => (y > x ? y : x));
  }, 0n);
}

/** Kassir paneli (SPEC 8) — Kassirning bosh sahifasi. Hammasi pul jurnalidan; IO kirim/chiqimga kirmaydi. */
export function CashierPanel() {
  const t = useTranslations("cash.panel");
  const tc = useTranslations("cash");
  const tk = useTranslations("payments.accountKind");
  const th = useTranslations("home");
  const me = useMe();
  const branches = useBranches();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "cash.view");
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState("today");
  const [account, setAccount] = useState<string | null>(null);
  const [kind, setKind] = useState<AccountKind | null>(null);
  const isoFrom = period.range.from;
  const isoTo = period.range.to;
  const accounts = useAccounts(allowed ? branchId : null);
  const panel = useQuery({
    queryKey: ["cash-panel", branchId, isoFrom, isoTo, account, kind],
    queryFn: () =>
      unwrap(
        api.GET("/api/cash-panel", {
          params: {
            query: {
              branchId: branchId as number,
              from: isoFrom ?? undefined,
              to: isoTo ?? undefined,
              accountId: account ? Number(account) : undefined,
              kind: kind ?? undefined,
            },
          },
        }),
      ),
    enabled: allowed && branchId != null && !!isoFrom && !!isoTo,
    refetchInterval: 60_000,
  });
  const driverCash = useQuery({
    queryKey: ["trips", "cash", branchId],
    queryFn: () => unwrap(api.GET("/api/trips/cash", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: can(me.data, PAYMENT_MT) && branchId != null,
    refetchInterval: 30_000,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  if (me.data && branchId == null)
    return (
      <>
        <h1 className="mb-4 text-page-title">{t("title")}</h1>
        <Card>
          <EmptyState icon={Banknote} title={t("noBranch.title")} description={t("noBranch.description")} />
        </Card>
      </>
    );

  const p = panel.data;
  const name = firstName(me.data?.fullName);
  const greet = th(`dir.${greetKey(tashkentHour())}`) + (name ? `, ${name}` : "");
  const branchName = branches.data?.find((b) => b.id === branchId)?.name;
  const driverTotal = (driverCash.data ?? []).reduce((s, c) => s + toCents(c.amount), 0n);
  const driverText = fromCents(driverTotal);

  return (
    <>
      <h1 className="text-page-title">{greet}</h1>
      <p className="mt-1 text-text-secondary">{[formatIsoDate(todayTashkent()), branchName].filter(Boolean).join(" · ")}</p>
      {/* Prototip CashierPanel: tezkor amallar — bitta asosiy (Mijozdan toʻlov) */}
      <div className="mt-4 mb-4 flex flex-wrap gap-2">
        {can(me.data, "cash.view") ? (
          <ActionLink href="/cash/ops/new?kind=ko&dir=OUT" icon={ArrowUpRight}>
            {t("act.out")}
          </ActionLink>
        ) : null}
        {(driverCash.data ?? []).length > 0 ? (
          <ActionLink href="/cash" icon={Truck}>
            {t("act.driver", { n: (driverCash.data ?? []).length })}
          </ActionLink>
        ) : null}
        {can(me.data, "cash.close") ? (
          <ActionLink href="/cash?close=1" icon={LockKeyhole}>
            {t("act.close")}
          </ActionLink>
        ) : null}
        {can(me.data, PAYMENT_MT) ? (
          <ActionLink href="/payments/mt/new" icon={HandCoins} primary>
            {t("act.mt")}
          </ActionLink>
        ) : null}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-secondary">{t("fPeriod")}</span>
          <PeriodPicker state={period} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-caption text-text-secondary">{tc("col.account")}</span>
          <div className="w-56">
            <Select
              label={tc("col.account")}
              size="sm"
              className="[&>span:first-child]:sr-only"
              value={account ?? "all"}
              onChange={(v) => setAccount(v === "all" ? null : v)}
              options={[
                { value: "all", label: t("allAccounts") },
                ...(accounts.data ?? [])
                  .filter((a) => !kind || a.kind === kind)
                  .map((a) => ({ value: String(a.id), label: a.name, sub: `${tk(a.kind)} · ${a.code}` })),
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-caption text-text-secondary">{t("kind")}</span>
          <div role="radiogroup" aria-label={t("kind")} className="inline-flex rounded-control border border-border bg-background p-0.5">
            {([null, "CASH", "BANK", "TERMINAL"] as const).map((k) => {
              const on = kind === k;
              return (
                <button
                  key={k ?? "all"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setKind(k);
                    const acc = (accounts.data ?? []).find((a) => String(a.id) === account);
                    if (k && acc && acc.kind !== k) setAccount(null);
                  }}
                  className={cn(
                    "h-8 rounded-control px-3 text-body font-medium whitespace-nowrap transition-colors duration-150",
                    on ? "bg-surface text-text-primary shadow-xs" : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {k ? t(`pt.${k}`) : t("pt.all")}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-caption text-text-secondary">{t("fBranch")}</span>
          <span
            title={t("branchLock")}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-background px-2.5 text-table text-text-secondary"
          >
            <Lock size={13} strokeWidth={1.5} aria-hidden />
            {branchName ?? "—"}
          </span>
        </div>
        {isoFrom && isoTo ? (
          <span className="ml-auto text-caption text-text-secondary">
            {t("perText", { f: formatIsoDate(isoFrom), t: formatIsoDate(isoTo) })}
          </span>
        ) : null}
      </div>
      {panel.error ? (
        <ErrorState onRetry={() => panel.refetch()} />
      ) : !p ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MoneyCard
              icon={Wallet}
              iconClass="text-primary"
              label={t("balances")}
              value={p.balances.total}
              note={t("balNote", { d: formatIsoDate(todayTashkent()) })}
              rows={[
                ...(kind == null || kind === "CASH" ? [[t("rCash"), p.balances.cash] as const] : []),
                ...(kind == null || kind === "TERMINAL" ? [[tk("TERMINAL"), p.balances.terminal] as const] : []),
                ...(kind == null || kind === "BANK" ? [[tk("BANK"), p.balances.bank] as const] : []),
              ]}
            />
            <MoneyCard
              icon={ArrowDownLeft}
              iconClass="text-success"
              valueClass="text-success"
              label={t("income")}
              value={sumMoney([p.flows.customerPayments, p.flows.otherIncome, p.flows.transfersIn])}
              note={t("docs", { n: p.flows.incomeDocs })}
              rows={[
                [t("rMt"), p.flows.customerPayments],
                [t("rOther"), p.flows.otherIncome],
                [t("rIoIn"), p.flows.transfersIn],
              ]}
            />
            <MoneyCard
              icon={ArrowUpRight}
              iconClass="text-danger"
              valueClass="text-danger"
              label={t("expense")}
              value={sumMoney([p.flows.supplierPayments, p.flows.otherExpense, p.flows.transfersOut])}
              note={t("docs", { n: p.flows.expenseDocs })}
              rows={[
                [t("rYt"), p.flows.supplierPayments],
                [t("expenses"), p.flows.otherExpense],
                [t("rIoOut"), p.flows.transfersOut],
              ]}
            />
            <MoneyCard
              icon={Receipt}
              iconClass="text-warning"
              label={t("expenses")}
              value={p.expensesTotal}
              rows={p.expenses.map((e) => [e.item, e.amount] as const)}
              empty={t("noExpenses")}
            />
            <MoneyCard
              icon={Hourglass}
              iconClass="text-info"
              label={t("expected")}
              value={sumMoney([driverText, p.customerDueToday, p.customerDueSoon, p.draftPaymentsAmount])}
              note={t("waitNote")}
              rows={[
                [t("atDrivers"), driverText],
                [t("dueToday"), p.customerDueToday],
                [t("dueSoon"), p.customerDueSoon],
                [t("draftPayments", { count: p.draftPayments }), p.draftPaymentsAmount],
                [t("pendingOps", { count: p.pendingOps }), p.pendingOpsAmount],
              ]}
              footer={
                <Link href="/cash" className="text-caption text-primary-button hover:underline">
                  {t("goToCash")}
                </Link>
              }
            />
          </div>
          <AccountsTable rows={p.accounts} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Dynamics days={p.days} />
            <Recent rows={p.recent} />
          </div>
        </div>
      )}
    </>
  );
}

function MoneyCard(props: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  valueClass?: string;
  note?: string;
  rows: readonly (readonly [string, string])[];
  empty?: string;
  footer?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-4">
      <span className="flex items-center gap-1.5 text-caption font-medium text-text-secondary">
        <Icon size={14} strokeWidth={1.5} className={props.iconClass} aria-hidden />
        {props.label}
      </span>
      <span className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("text-stat whitespace-nowrap tabular-nums", props.valueClass)}>{formatMoney(props.value)}</span>
        <span className="text-caption text-text-secondary">soʻm</span>
      </span>
      {props.note ? <span className="text-caption text-text-secondary">{props.note}</span> : null}
      <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-table">
        {props.rows.length === 0 && props.empty ? <span className="text-caption text-text-secondary">{props.empty}</span> : null}
        {props.rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-text-secondary">{k}</dt>
            <dd className={cn("whitespace-nowrap tabular-nums", toCents(v) === 0n ? "text-text-secondary" : "text-text-primary")}>
              {formatMoney(v)}
            </dd>
          </div>
        ))}
      </dl>
      {props.footer ? <div className="mt-2">{props.footer}</div> : null}
    </section>
  );
}

function AccountsTable({ rows }: { rows: AccountTurnover[] }) {
  const t = useTranslations("cash.panel");
  const tc = useTranslations("cash");
  const tk = useTranslations("payments.accountKind");
  const columns: TableColumn<AccountTurnover>[] = [
    {
      key: "name",
      title: tc("col.account"),
      render: (a) => (
        <div>
          <div>{a.name}</div>
          <div className="text-caption text-text-secondary">
            {tk(a.kind)} · <span className="font-mono">{a.code}</span>
          </div>
        </div>
      ),
    },
    { key: "resp", title: t("resp"), render: (a) => <span className="text-text-secondary">{a.cashierName ?? "—"}</span> },
    { key: "opening", title: tc("statement.opening"), align: "right", render: (a) => money(a.opening) },
    { key: "income", title: tc("col.in"), align: "right", render: (a) => money(a.income) },
    { key: "expense", title: tc("col.out"), align: "right", render: (a) => money(a.expense) },
    { key: "closing", title: tc("statement.closing"), align: "right", render: (a) => <strong>{money(a.closing)}</strong> },
  ];
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-subtitle">{t("accounts")}</h2>
        <span className="text-caption text-text-secondary">{t("accFormula")}</span>
      </div>
      <Table
        caption={t("accountsCaption")}
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(a) => String(a.id)}
        emptyState={<EmptyState icon={Wallet} title={t("accountsEmpty.title")} description={t("accountsEmpty.description")} />}
      />
      {rows.length > 1 ? (
        <div className="mt-1 flex flex-wrap justify-end gap-x-6 gap-y-1 rounded-card bg-background px-4 py-2 text-table font-semibold tabular-nums">
          <span>{t("total")}</span>
          <span>
            {tc("statement.opening")}: {formatMoney(sumMoney(rows.map((r) => r.opening)))}
          </span>
          <span>
            {tc("col.in")}: {formatMoney(sumMoney(rows.map((r) => r.income)))}
          </span>
          <span>
            {tc("col.out")}: {formatMoney(sumMoney(rows.map((r) => r.expense)))}
          </span>
          <span>
            {tc("statement.closing")}: {formatMoney(sumMoney(rows.map((r) => r.closing)))}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function Dynamics({ days }: { days: DayPoint[] }) {
  const t = useTranslations("cash.panel");
  const tc = useTranslations("cash");
  const max = dayMax(days);
  const shown = days.slice(-31);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-subtitle">{t("dynamics")}</h2>
        <div className="flex items-center gap-4 text-caption text-text-secondary">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-success" aria-hidden /> {tc("col.in")}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-warning" aria-hidden /> {tc("col.out")}
          </span>
        </div>
      </div>
      {max === 0n ? (
        <p className="text-caption text-text-secondary">{t("noMoves")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((d) => (
            <li key={d.date} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-caption">
              <span className="font-mono text-text-secondary">{formatIsoDate(d.date)}</span>
              <div
                className="flex flex-col gap-1"
                title={t("dayTitle", { income: formatMoney(d.income), expense: formatMoney(d.expense) })}
              >
                <div className="h-2 rounded-full bg-success" style={{ width: `${barPercent(d.income, max)}%` }} />
                <div className="h-2 rounded-full bg-warning" style={{ width: `${barPercent(d.expense, max)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Recent({ rows }: { rows: RecentMove[] }) {
  const t = useTranslations("cash.panel");
  const tc = useTranslations("cash");
  const columns: TableColumn<RecentMove>[] = [
    { key: "occurredAt", title: tc("col.time"), render: (m) => formatDateTime(new Date(m.occurredAt)) },
    {
      key: "docNumber",
      title: tc("col.document"),
      mono: true,
      render: (m) => <span title={isDocTitleKey(m.docType) ? tc(`docType.${m.docType}`) : m.docType}>{m.docNumber}</span>,
    },
    { key: "account", title: tc("col.account") },
    {
      key: "amount",
      title: tc("col.amount"),
      align: "right",
      render: (m) => <span className={`tabular-nums ${m.amount.startsWith("-") ? "" : "text-success"}`}>{formatMoney(m.amount)}</span>,
    },
  ];
  return (
    <section>
      <h2 className="mb-2 text-subtitle">{t("recent")}</h2>
      <Table
        caption={t("recent")}
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(m) => String(m.id)}
        emptyState={<EmptyState icon={Receipt} title={t("recentEmpty.title")} description={t("recentEmpty.description")} />}
      />
    </section>
  );
}

function ActionLink({
  href,
  icon: Glyph,
  primary,
  children,
}: {
  href: string;
  icon: LucideIcon;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-control-md items-center gap-2 rounded-control border px-4 text-body font-medium",
        primary
          ? "border-transparent bg-primary-button text-white hover:bg-primary-button-hover"
          : "border-border bg-surface text-text-primary hover:bg-background",
      )}
    >
      <Glyph size={16} strokeWidth={1.5} aria-hidden />
      {children}
    </Link>
  );
}
