"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Clock, Receipt, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { ACCOUNT_KIND, PAYMENT_MT, useAccounts } from "@/features/payments/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { DOC_TITLE, fromCents, toCents } from "./api";

type AccountTurnover = components["schemas"]["AccountTurnover"];
type RecentMove = components["schemas"]["RecentMove"];
type DayPoint = components["schemas"]["DayPoint"];

const money = (v: string) => <span className="tabular-nums">{formatMoney(v)}</span>;

/** Kunlik dinamika ustuni uchun nisbat (0–100), tiyinlarda — float faqat koʻrinish kengligi uchun. */
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
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "cash.view");
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const today = formatIsoDate(todayTashkent());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [account, setAccount] = useState<string | null>(null);
  const isoFrom = parseUzDate(from);
  const isoTo = parseUzDate(to);
  const accounts = useAccounts(allowed ? branchId : null);
  const panel = useQuery({
    queryKey: ["cash-panel", branchId, isoFrom, isoTo, account],
    queryFn: () =>
      unwrap(
        api.GET("/api/cash-panel", {
          params: {
            query: {
              branchId: branchId as number,
              from: isoFrom ?? undefined,
              to: isoTo ?? undefined,
              accountId: account ? Number(account) : undefined,
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

  if (me.data && !allowed) return <ForbiddenState description="Kassir paneli sizning rolingiz uchun yopiq." />;
  if (me.data && branchId == null)
    return <EmptyState icon={Banknote} title="Filialni tanlang" description="Kassir paneli filial boʻyicha — yuqorida filialni tanlang." />;

  const p = panel.data;
  const driverTotal = (driverCash.data ?? []).reduce((s, c) => s + toCents(c.amount), 0n);
  const driverText = fromCents(driverTotal);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">Kassir paneli</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <TextField
              label="Dan"
              size="sm"
              value={from}
              onChange={setFrom}
              placeholder="04.10.2026"
              error={isoFrom ? undefined : "Sana?"}
            />
          </div>
          <div className="w-36">
            <TextField label="Gacha" size="sm" value={to} onChange={setTo} placeholder="04.10.2026" error={isoTo ? undefined : "Sana?"} />
          </div>
          <div className="w-56">
            <Select
              label="Hisob"
              size="sm"
              value={account ?? "all"}
              onChange={(v) => setAccount(v === "all" ? null : v)}
              options={[
                { value: "all", label: "Barcha hisoblar" },
                ...(accounts.data ?? []).map((a) => ({ value: String(a.id), label: a.name, sub: `${ACCOUNT_KIND[a.kind]} · ${a.code}` })),
              ]}
            />
          </div>
        </div>
      </div>
      {panel.error ? (
        <ErrorState onRetry={() => panel.refetch()} />
      ) : !p ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardTitle icon={Wallet} title="Qoldiq pullar" />
              <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(p.balances.total)}</div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-caption text-text-secondary">
                <dt>Naqd</dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(p.balances.cash)}</dd>
                <dt>Terminal</dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(p.balances.terminal)}</dd>
                <dt>Bank</dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(p.balances.bank)}</dd>
              </dl>
            </Card>
            <Card>
              <CardTitle icon={Banknote} title="Kirim pullar" />
              <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(p.income)}</div>
              <div className="mt-2 text-caption text-text-secondary">Oʻtkazmalarsiz (IO)</div>
            </Card>
            <Card>
              <CardTitle icon={Receipt} title="Chiqim pullar" />
              <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(p.expense)}</div>
              <div className="mt-2 text-caption text-text-secondary">Oʻtkazmalarsiz (IO)</div>
            </Card>
            <Card>
              <CardTitle icon={Receipt} title="Xarajatlar" />
              <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(p.expensesTotal)}</div>
              {p.expenses.length === 0 ? (
                <div className="mt-2 text-caption text-text-secondary">Davrda xarajat yoʻq</div>
              ) : (
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 text-caption text-text-secondary">
                  {p.expenses.slice(0, 4).map((e) => (
                    <div key={e.item} className="contents">
                      <dt className="truncate">{e.item}</dt>
                      <dd className="text-right font-mono tabular-nums">{formatMoney(e.amount)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
            <Card>
              <CardTitle icon={Clock} title="Kutilayotgan pullar" />
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-caption">
                <dt className="flex items-center gap-1 text-text-secondary">
                  <Truck size={14} strokeWidth={1.5} aria-hidden /> Haydovchilarda
                </dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(driverText)}</dd>
                <dt className="text-text-secondary">Tasdiqlanmagan MT ({p.draftPayments})</dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(p.draftPaymentsAmount)}</dd>
                <dt className="text-text-secondary">Tasdiq kutayotgan chiqim ({p.pendingOps})</dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(p.pendingOpsAmount)}</dd>
                <dt className="text-text-secondary">Mijozlar toʻlov kuni: bugun</dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(p.customerDueToday)}</dd>
                <dt className="text-text-secondary">Mijozlar toʻlov kuni: 3 kun ichida</dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(p.customerDueSoon)}</dd>
              </dl>
              <Link href="/cash" className="mt-2 inline-block text-caption text-primary-button hover:underline">
                Kassaga oʻtish
              </Link>
            </Card>
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

function CardTitle({ icon: Icon, title }: { icon: typeof Wallet; title: string }) {
  return (
    <div className="flex items-center gap-2 text-caption text-text-secondary">
      <Icon size={16} strokeWidth={1.5} aria-hidden />
      {title}
    </div>
  );
}

function AccountsTable({ rows }: { rows: AccountTurnover[] }) {
  const columns: TableColumn<AccountTurnover>[] = [
    {
      key: "name",
      title: "Hisob",
      render: (a) => (
        <div>
          <div>{a.name}</div>
          <div className="text-caption text-text-secondary">
            {ACCOUNT_KIND[a.kind]} · <span className="font-mono">{a.code}</span>
            {a.cashierName ? ` · ${a.cashierName}` : ""}
          </div>
        </div>
      ),
    },
    { key: "opening", title: "Davr boshi", align: "right", render: (a) => money(a.opening) },
    { key: "income", title: "Kirim", align: "right", render: (a) => money(a.income) },
    { key: "expense", title: "Chiqim", align: "right", render: (a) => money(a.expense) },
    { key: "closing", title: "Davr oxiri", align: "right", render: (a) => <strong>{money(a.closing)}</strong> },
  ];
  return (
    <section>
      <h2 className="mb-2 text-subtitle">Hisoblar</h2>
      <Table
        caption="Hisoblar: davr boshi + kirim − chiqim = davr oxiri"
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(a) => String(a.id)}
        emptyState={
          <EmptyState icon={Wallet} title="Hisob yoʻq" description="Filialda kassa yoki bank hisobi ochilgach shu yerda koʻrinadi." />
        }
      />
    </section>
  );
}

function Dynamics({ days }: { days: DayPoint[] }) {
  const max = dayMax(days);
  const shown = days.slice(-31);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-subtitle">Kunlik dinamika</h2>
        <div className="flex items-center gap-4 text-caption text-text-secondary">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-success" aria-hidden /> Kirim
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-warning" aria-hidden /> Chiqim
          </span>
        </div>
      </div>
      {max === 0n ? (
        <p className="text-caption text-text-secondary">Davrda harakat yoʻq.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((d) => (
            <li key={d.date} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-caption">
              <span className="font-mono text-text-secondary">{formatIsoDate(d.date)}</span>
              <div className="flex flex-col gap-1" title={`Kirim ${formatMoney(d.income)} · Chiqim ${formatMoney(d.expense)}`}>
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
  const columns: TableColumn<RecentMove>[] = [
    { key: "occurredAt", title: "Vaqt", render: (m) => formatDateTime(new Date(m.occurredAt)) },
    { key: "docNumber", title: "Hujjat", mono: true, render: (m) => <span title={DOC_TITLE[m.docType] ?? m.docType}>{m.docNumber}</span> },
    { key: "account", title: "Hisob" },
    {
      key: "amount",
      title: "Summa",
      align: "right",
      render: (m) => <span className={`tabular-nums ${m.amount.startsWith("-") ? "" : "text-success"}`}>{formatMoney(m.amount)}</span>,
    },
  ];
  return (
    <section>
      <h2 className="mb-2 text-subtitle">Oxirgi operatsiyalar</h2>
      <Table
        caption="Oxirgi operatsiyalar"
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(m) => String(m.id)}
        emptyState={<EmptyState icon={Receipt} title="Operatsiya yoʻq" description="Pul harakati boʻlgach shu yerda koʻrinadi." />}
      />
    </section>
  );
}
