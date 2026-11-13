"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, ChevronRight, CircleCheck, FileText, FileWarning, Landmark, type LucideIcon, Wallet } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { Kpi, Now } from "./branch-home";
import { type MiniCol, MiniTable, Panel, REPORTS_ALL, REPORTS_VIEW } from "./director-home";
import { axisLabel, firstName, greetKey, maxCents, share, sumMoney, tashkentHour } from "./director-view";
import { PeriodPicker, usePeriodState } from "./period-picker";

type View = components["schemas"]["AccountantHomeView"];
type Day = components["schemas"]["CalendarDay"];
type BranchMoney = components["schemas"]["BranchMoney"];

/** Buxgalter bosh sahifasi — prototip `Home.dc.html` («accountant» varianti, SPEC 8). */
export function AccountantHome() {
  const t = useTranslations("home");
  const me = useMe();
  const selected = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, REPORTS_ALL) || can(me.data, REPORTS_VIEW);
  const branchId = me.data?.allBranches ? (selected ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState("month");
  const view = useQuery({
    queryKey: ["home", "accountant", branchId],
    queryFn: () => unwrap(api.GET("/api/home/accountant", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: allowed && !!me.data,
    refetchInterval: 120_000,
  });
  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const v = view.data;
  const name = firstName(me.data?.fullName);
  const greet = t(`dir.${greetKey(tashkentHour())}`) + (name ? `, ${name}` : "");
  const branchName = v ? (v.branchId == null ? t("dir.allBr") : (v.money[0]?.name ?? "")) : "";
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-page-title">{greet}</h1>
          <p className="mt-0.5 text-body text-text-secondary">
            {formatIsoDate(v?.today ?? todayTashkent())}
            {branchName ? ` · ${branchName}` : ""}
          </p>
        </div>
        <PeriodPicker state={period} />
      </div>
      {view.error ? <ErrorState onRetry={() => view.refetch()} /> : !v ? <Skeleton className="h-40 w-full" /> : <Body view={v} />}
    </>
  );
}

function Body({ view: v }: { view: View }) {
  const t = useTranslations("home");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("acc.kCash")} value={v.cash} delta={<Now />} note="" href="/cash" />
        <Kpi label={t("acc.kBank")} value={v.bank} delta={<Now />} note="" href="/cash?tab=statement" />
        <Kpi
          label={t("br.kDebt")}
          value={v.customerDebt}
          delta={<Now />}
          note={t("br.nDebt", { v: formatMoney(v.customerOverdue) })}
          href="/debts/customers"
        />
        <Kpi
          label={t("dir.supplierDebt")}
          value={v.supplierDebt}
          delta={<Now />}
          note={t("acc.nSup7", { v: formatMoney(v.supplierDue7) })}
          href="/debts/suppliers"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <Calendar days={v.calendar} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <Work work={v.work} />
        </div>
      </div>
      <MoneyByBranch rows={v.money} />
    </div>
  );
}

/** To'lov taqvimi: tepaga — kutilayotgan tushum, pastga — to'lanishi kerak (prototip). */
function Calendar({ days }: { days: Day[] }) {
  const t = useTranslations("home.acc");
  const [tip, setTip] = useState<number | null>(null);
  const W = 600;
  const H = 140;
  const mid = H / 2;
  const n = Math.max(1, days.length);
  const bw = W / n;
  const max = maxCents(days.flatMap((d) => [d.incoming, d.outgoing]));
  const cur = tip == null ? null : days[tip];
  return (
    <Panel title={t("calT")}>
      <div className="relative px-4 pb-4">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-36 w-full" role="img" aria-label={t("calT")}>
          <line x1={0} x2={W} y1={mid + 0.5} y2={mid + 0.5} className="stroke-border" strokeWidth={1} />
          {days.map((d, i) => {
            const hi = share(d.incoming, max) * (mid - 6);
            const ho = share(d.outgoing, max) * (mid - 6);
            return (
              <g key={d.date} onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)}>
                <rect x={i * bw} y={0} width={bw} height={H} className="fill-transparent" />
                {hi > 0 ? (
                  <rect
                    x={i * bw + bw * 0.2}
                    y={mid - hi}
                    width={bw * 0.6}
                    height={hi}
                    className={tip === i ? "fill-primary-button" : "fill-primary"}
                  />
                ) : null}
                {ho > 0 ? <rect x={i * bw + bw * 0.2} y={mid + 1} width={bw * 0.6} height={ho} className="fill-warning" /> : null}
              </g>
            );
          })}
        </svg>
        <div className="mt-1 flex text-caption text-text-secondary">
          {days.map((d, i) => (
            <span key={d.date} className="flex-1 text-center tabular-nums">
              {i % 2 ? "" : axisLabel(d.date, 0, 1)}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-caption text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-primary" aria-hidden /> {t("calIn")}:{" "}
            {formatMoney(sumMoney(days.map((d) => d.incoming)))}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-warning" aria-hidden /> {t("calOut")}:{" "}
            {formatMoney(sumMoney(days.map((d) => d.outgoing)))}
          </span>
        </div>
        {cur ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-control border border-border bg-surface px-3 py-2 text-caption whitespace-nowrap"
            style={{ left: `${((tip! + 0.5) / n) * 100}%` }}
          >
            <div className="text-text-secondary">{formatIsoDate(cur.date)}</div>
            <div className="tabular-nums">
              {t("calIn")}: {formatMoney(cur.incoming)}
            </div>
            <div className="tabular-nums">
              {t("calOut")}: {formatMoney(cur.outgoing)}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Work({ work }: { work: View["work"] }) {
  const t = useTranslations("home.acc");
  const rows: Array<{ key: "wInv" | "wInvLate" | "wYt" | "wBank" | "wCash"; n: number; icon: LucideIcon; href: string }> = [
    { key: "wInvLate", n: work.invoicesOverdue, icon: FileWarning, href: "/invoices" },
    { key: "wInv", n: work.invoicesPending - work.invoicesOverdue, icon: FileText, href: "/invoices" },
    { key: "wYt", n: work.ytPending, icon: Wallet, href: "/payments?tab=yt" },
    { key: "wBank", n: work.bankUnreconciled, icon: Landmark, href: "/cash?tab=statement" },
    { key: "wCash", n: work.cashDaysOpen, icon: Banknote, href: "/cash" },
  ];
  const shown = rows.filter((r) => r.n > 0);
  return (
    <Panel title={t("workT")}>
      {shown.length === 0 ? (
        <EmptyState icon={CircleCheck} title={t("tasksNone")} description={t("tasksNoneHint")} />
      ) : (
        <ul className="mx-4 mb-2 divide-y divide-border border-t border-border">
          {shown.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className="flex min-h-11 items-center gap-3 py-2 text-body hover:bg-background">
                <r.icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-warning" />
                <span className="min-w-0 flex-1">{t(r.key, { n: r.n })}</span>
                <span className="tabular-nums">{r.n}</span>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MoneyByBranch({ rows }: { rows: BranchMoney[] }) {
  const t = useTranslations("home");
  const setBranch = useBranchStore((s) => s.setBranchId);
  const cols: MiniCol<BranchMoney>[] = [
    { key: "name", title: t("director.branch"), render: (r) => r.name },
    { key: "cash", title: t("acc.cCash"), right: true, render: (r) => formatMoney(r.cash) },
    { key: "bank", title: t("acc.cBank"), right: true, render: (r) => formatMoney(r.bank) },
    { key: "total", title: t("dir.total"), right: true, render: (r) => formatMoney(r.total) },
  ];
  return (
    <Panel title={t("acc.moneyBrT")}>
      <MiniTable
        caption={t("acc.moneyBrT")}
        cols={cols}
        rows={rows}
        rowKey={(r) => String(r.id)}
        onRowClick={(r) => setBranch(r.id)}
        foot={[
          t("dir.total"),
          formatMoney(sumMoney(rows.map((r) => r.cash))),
          formatMoney(sumMoney(rows.map((r) => r.bank))),
          formatMoney(sumMoney(rows.map((r) => r.total))),
        ]}
        minWidth="560px"
        empty={<EmptyState icon={Banknote} title={t("br.noAccounts")} description={t("br.noAccountsHint")} />}
      />
    </Panel>
  );
}
