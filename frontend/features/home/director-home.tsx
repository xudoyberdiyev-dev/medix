"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Building2, ChevronRight, HandCoins, Receipt, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { PERIOD_LABELS, type PeriodPreset, periodRange } from "./period";

type Home = components["schemas"]["Home"];
type ByPayment = components["schemas"]["ByPayment"];
type BranchRow = components["schemas"]["BranchRow"];
type Debtor = components["schemas"]["Debtor"];

export const REPORTS_ALL = "reports.all";

const money = (v: string) => <span className="font-mono tabular-nums">{formatMoney(v)}</span>;

/** Summa noldan farqlimi (satr: «0.00», «-12.50», «1250000.00»). */
export function nonZero(v: string): boolean {
  return /[1-9]/.test(v);
}

export interface AttentionRow {
  key: string;
  label: string;
  value: string;
  href: string;
  /** Pul bo'lsa — formatMoney, aks holda son. */
  money: boolean;
  danger?: boolean;
}

/** «Diqqat talab qiladi» qatorlari (SPEC 8): har biri tegishli sahifaga filtr bilan olib boradi; nol bo'lganlari yashiriladi. */
export function attentionRows(a: Home["attention"]): AttentionRow[] {
  const rows: AttentionRow[] = [
    { key: "o1", label: "Muddati oʻtgan qarz: 1–30 kun", value: a.overdue1to30, href: "/debts/customers", money: true },
    { key: "o2", label: "Muddati oʻtgan qarz: 31–60 kun", value: a.overdue31to60, href: "/debts/customers", money: true },
    { key: "o3", label: "Muddati oʻtgan qarz: 61–90 kun", value: a.overdue61to90, href: "/debts/customers", money: true, danger: true },
    { key: "o4", label: "Muddati oʻtgan qarz: 90+ kun", value: a.overdue90plus, href: "/debts/customers", money: true, danger: true },
    {
      key: "dir",
      label: `Direktor tasdigʻini kutayotgan buyurtmalar (${a.directorOrders.count})`,
      value: a.directorOrders.amount,
      href: "/orders?status=PENDING_APPROVAL",
      money: true,
    },
    {
      key: "cash",
      label: `Tasdiq kutayotgan chiqimlar (${a.cashApprovals.count})`,
      value: a.cashApprovals.amount,
      href: "/cash",
      money: true,
    },
    { key: "exp", label: "Muddati oʻtgan partiyalar", value: String(a.expiring.expired), href: "/expiry", money: false, danger: true },
    { key: "e1", label: "Muddati tugaydigan partiyalar: 0–30 kun", value: String(a.expiring.d0to30), href: "/expiry", money: false },
    { key: "e2", label: "Muddati tugaydigan partiyalar: 31–60 kun", value: String(a.expiring.d31to60), href: "/expiry", money: false },
    { key: "e3", label: "Muddati tugaydigan partiyalar: 61–90 kun", value: String(a.expiring.d61to90), href: "/expiry", money: false },
    { key: "s0", label: "Taʼminotchiga toʻlov: kechikkan", value: a.supplierOverdue, href: "/debts/suppliers", money: true, danger: true },
    { key: "s1", label: "Taʼminotchiga toʻlov: bugun", value: a.supplierToday, href: "/debts/suppliers", money: true },
    { key: "s3", label: "Taʼminotchiga toʻlov: 3 kun ichida", value: a.supplierNext3Days, href: "/debts/suppliers", money: true },
    {
      key: "rcp",
      label: "Oʻtkazish kutayotgan kirimlar",
      value: String(a.receiptsToPost),
      href: "/receipts?status=ACCEPTED",
      money: false,
    },
    { key: "drv", label: "Haydovchilardagi pul", value: a.driverCash, href: "/cash", money: true },
  ];
  return rows.filter((r) => nonZero(r.value));
}

const BRANCH_TABS = [
  { key: "sales", label: "Savdo" },
  { key: "customerDebt", label: "Mijozlar qarzi" },
  { key: "supplierDebt", label: "Taʼminotchilarga qarz" },
  { key: "expenses", label: "Xarajatlar" },
] as const;
type BranchTab = (typeof BRANCH_TABS)[number]["key"];

/** Direktor va Admin bosh sahifasi (SPEC 8). */
export function DirectorHome() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, REPORTS_ALL);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const today = todayTashkent();
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [customFrom, setCustomFrom] = useState(formatIsoDate(today));
  const [customTo, setCustomTo] = useState(formatIsoDate(today));
  const range =
    preset === "custom" ? { from: parseUzDate(customFrom) ?? null, to: parseUzDate(customTo) ?? null } : periodRange(preset, today);
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

  if (me.data && !allowed) return <ForbiddenState description="Bu bosh sahifa Direktor va Admin uchun." />;
  const h = home.data;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">Bosh sahifa</h1>
        <div className="flex flex-wrap items-end gap-3">
          <Tabs
            aria-label="Davr"
            items={(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((k) => ({ key: k, label: PERIOD_LABELS[k] }))}
            value={preset}
            onChange={(k) => setPreset(k as PeriodPreset)}
          />
          {preset === "custom" ? (
            <>
              <div className="w-36">
                <TextField
                  label="Dan"
                  size="sm"
                  value={customFrom}
                  onChange={setCustomFrom}
                  placeholder="04.10.2026"
                  error={parseUzDate(customFrom) ? undefined : "Sana?"}
                />
              </div>
              <div className="w-36">
                <TextField
                  label="Gacha"
                  size="sm"
                  value={customTo}
                  onChange={setCustomTo}
                  placeholder="04.10.2026"
                  error={parseUzDate(customTo) ? undefined : "Sana?"}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
      {home.error ? (
        <ErrorState onRetry={() => home.refetch()} />
      ) : !h ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-caption text-text-secondary">
            {h.from === h.to ? formatIsoDate(h.from) : `${formatIsoDate(h.from)} – ${formatIsoDate(h.to)}`}
            {h.branchId == null ? " · barcha filiallar" : ""}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PaymentCard icon={Banknote} title="Savdo (sof)" note="Sotuv − qaytarish, QQS bilan" value={h.sales} />
            <DebtCard icon={Users} title="Mijozlar qarzi" card={h.customerDebt} href="/debts/customers" />
            <DebtCard icon={HandCoins} title="Taʼminotchilarga qarz" card={h.supplierDebt} href="/debts/suppliers" />
            <PaymentCard icon={Receipt} title="Xarajatlar" note="Oʻtkazilgan chiqimlar (KO/BO)" value={h.expenses} />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Attention home={h} />
            <TopDebtors rows={h.topDebtors} />
          </div>
          <Branches rows={h.branches} />
        </div>
      )}
    </>
  );
}

function CardTitle({ icon: Icon, title }: { icon: typeof Banknote; title: string }) {
  return (
    <div className="flex items-center gap-2 text-caption text-text-secondary">
      <Icon size={16} strokeWidth={1.5} aria-hidden />
      {title}
    </div>
  );
}

function PaymentCard({ icon, title, note, value }: { icon: typeof Banknote; title: string; note: string; value: ByPayment }) {
  return (
    <Card>
      <CardTitle icon={icon} title={title} />
      <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(value.total)}</div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-caption text-text-secondary">
        <dt>Naqd</dt>
        <dd className="text-right font-mono tabular-nums">{formatMoney(value.cash)}</dd>
        <dt>Perechisleniye</dt>
        <dd className="text-right font-mono tabular-nums">{formatMoney(value.transfer)}</dd>
        <dt>Online</dt>
        <dd className="text-right font-mono tabular-nums">{formatMoney(value.online)}</dd>
      </dl>
      <div className="mt-2 text-caption text-text-secondary">{note}</div>
    </Card>
  );
}

function DebtCard({ icon, title, card, href }: { icon: typeof Banknote; title: string; card: Home["customerDebt"]; href: string }) {
  return (
    <Card>
      <CardTitle icon={icon} title={title} />
      <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(card.debt)}</div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-caption text-text-secondary">
        <dt>Muddati oʻtgan</dt>
        <dd className={`text-right font-mono tabular-nums ${nonZero(card.overdue) ? "text-danger" : ""}`}>{formatMoney(card.overdue)}</dd>
        <dt>Avans</dt>
        <dd className="text-right font-mono tabular-nums">{formatMoney(card.advance)}</dd>
      </dl>
      <Link href={href} className="mt-2 inline-block text-caption text-primary-button hover:underline">
        Qarzlarni ochish
      </Link>
    </Card>
  );
}

function Attention({ home }: { home: Home }) {
  const rows = attentionRows(home.attention);
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-subtitle">
        <AlertTriangle size={18} strokeWidth={1.5} aria-hidden /> Diqqat talab qiladi
      </h2>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Hammasi joyida" description="Muddati oʻtgan qarz, kutilayotgan tasdiq va toʻlov yoʻq." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-body hover:bg-background">
                  <span className={r.danger ? "text-danger" : ""}>{r.label}</span>
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
  const columns: TableColumn<Debtor>[] = [
    { key: "name", title: "Mijoz" },
    { key: "debt", title: "Qarz", align: "right", render: (d) => money(d.debt) },
    {
      key: "overdue",
      title: "Muddati oʻtgan",
      align: "right",
      render: (d) => (
        <span className={nonZero(d.overdue) ? "text-danger" : ""}>
          {money(d.overdue)}
          {d.maxOverdueDays > 0 ? <span className="ml-1 text-caption text-text-secondary">({d.maxOverdueDays} kun)</span> : null}
        </span>
      ),
    },
  ];
  return (
    <section>
      <h2 className="mb-2 text-subtitle">Eng katta qarzdorlar</h2>
      <Table
        caption="Eng katta qarzdorlar (top 5)"
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(d) => String(d.id)}
        emptyState={<EmptyState icon={Users} title="Qarzdor yoʻq" description="Mijozlarning ochiq qarzi boʻlsa, shu yerda koʻrinadi." />}
      />
    </section>
  );
}

function Branches({ rows }: { rows: BranchRow[] }) {
  const [tab, setTab] = useState<BranchTab>("sales");
  const title = BRANCH_TABS.find((t) => t.key === tab)?.label ?? "";
  const columns: TableColumn<BranchRow>[] = [
    { key: "name", title: "Filial" },
    { key: tab, title, align: "right", render: (b) => money(b[tab]) },
  ];
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-subtitle">
          <Building2 size={18} strokeWidth={1.5} aria-hidden /> Filiallar kesimi
        </h2>
        <Tabs aria-label="Koʻrsatkich" items={[...BRANCH_TABS]} value={tab} onChange={(k) => setTab(k as BranchTab)} />
      </div>
      <Table
        caption="Filiallar kesimi"
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(b) => String(b.id)}
        emptyState={<EmptyState icon={Building2} title="Filial yoʻq" description="Faol filiallar shu yerda koʻrinadi." />}
      />
    </section>
  );
}
