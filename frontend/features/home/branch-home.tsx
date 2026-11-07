"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, Clock, Minus, TrendingDown, TrendingUp, Truck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { Attention, type MiniCol, MiniTable, Panel, REPORTS_ALL, REPORTS_VIEW, STATUS_ICON, isOrderStatus } from "./director-home";
import { firstName, greetKey, pctDelta, tashkentHour, waitParts } from "./director-view";
import { PeriodPicker, usePeriodState } from "./period-picker";

type View = components["schemas"]["BranchHomeView"];
type Approval = components["schemas"]["PendingApproval"];
type Trip = components["schemas"]["HomeTrip"];
type Account = components["schemas"]["HomeAccount"];
type StatusCell = components["schemas"]["StatusCell"];

/** «Bugungi oqim» kataklari (prototip flowCard): bugun kiritilgan buyurtmalar holati. */
const FLOW = ["PENDING_APPROVAL", "QUEUED", "PICKING", "MARKING", "CHECKING", "DOCUMENTING", "LOADING", "IN_TRANSIT", "DELIVERED"] as const;

const TYPE_KEYS = ["ORDER", "NO", "YT", "KO", "BO", "ZK", "HC", "QY", "IN"] as const;
type ApprovalType = (typeof TYPE_KEYS)[number];
const isType = (s: string): s is ApprovalType => (TYPE_KEYS as readonly string[]).includes(s);

const TRIP_KEYS = ["PLANNED", "IN_TRANSIT", "RETURN_WAIT", "DONE", "CANCELLED"] as const;
type TripStatus = (typeof TRIP_KEYS)[number];
const isTrip = (s: string): s is TripStatus => (TRIP_KEYS as readonly string[]).includes(s);

/** Filial rahbari bosh sahifasi — prototip `Home.dc.html` («branch» varianti, SPEC 8). */
export function BranchHome() {
  const t = useTranslations("home");
  const me = useMe();
  const selected = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, REPORTS_ALL) || can(me.data, REPORTS_VIEW);
  const branchId = me.data?.allBranches ? (selected ?? me.data?.branchId ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState("month");
  const { from, to } = period.range;
  const enabled = allowed && !!from && !!to && branchId != null;
  const params = { query: { branchId: branchId ?? undefined, from: from ?? undefined, to: to ?? undefined } };
  const view = useQuery({
    queryKey: ["home", "branch", branchId, from, to],
    queryFn: () => unwrap(api.GET("/api/home/branch", { params })),
    enabled,
    refetchInterval: 120_000,
  });
  const dir = useQuery({
    queryKey: ["home", "director", branchId, from, to],
    queryFn: () => unwrap(api.GET("/api/home/director", { params })),
    enabled,
    refetchInterval: 120_000,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const v = view.data;
  const name = firstName(me.data?.fullName);
  const greet = t(`dir.${greetKey(tashkentHour())}`) + (name ? `, ${name}` : "");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-page-title">{greet}</h1>
          <p className="mt-0.5 text-body text-text-secondary">
            {formatIsoDate(v?.today ?? todayTashkent())}
            {v ? ` · ${v.branchName}` : ""}
          </p>
        </div>
        <PeriodPicker state={period} />
      </div>
      {view.error || dir.error ? (
        <ErrorState
          onRetry={() => {
            void view.refetch();
            void dir.refetch();
          }}
        />
      ) : !v || !dir.data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <Approvals rows={v.approvals} />
          <Kpis view={v} />
          <Flow cells={dir.data.orderStatuses} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-7">
              <Trips rows={v.trips} />
            </div>
            <div className="min-w-0 xl:col-span-5">
              <Accounts rows={v.accounts} />
            </div>
          </div>
          <Attention home={dir.data} />
        </div>
      )}
    </>
  );
}

function Approvals({ rows }: { rows: Approval[] }) {
  const t = useTranslations("home.br");
  const main = rows.filter((r) => r.page);
  const other = rows.filter((r) => !r.page);
  const cols: MiniCol<Approval>[] = [
    { key: "no", title: t("c.doc"), render: (r) => <span className="font-mono text-caption">{r.number}</span> },
    { key: "type", title: t("c.type"), render: (r) => (isType(r.type) ? t(`type.${r.type}`) : r.type) },
    { key: "who", title: t("c.who"), render: (r) => r.createdBy },
    { key: "sum", title: t("c.sum"), right: true, render: (r) => (r.amount ? formatMoney(r.amount) : "—") },
    {
      key: "wait",
      title: t("c.wait"),
      right: true,
      render: (r) => {
        const w = waitParts(r.waitMinutes);
        return <span className={r.waitMinutes > 240 ? "text-warning" : "text-text-secondary"}>{t(w.key, { n: w.n })}</span>;
      },
    },
    {
      key: "go",
      title: "",
      right: true,
      render: () => (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-primary-button">
          {t("review")} <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
        </span>
      ),
    },
  ];
  const table = (list: Approval[]) => (
    <MiniTable
      caption={t("apprCaption")}
      cols={cols}
      rows={list}
      rowKey={(r) => `${r.type}-${r.id}`}
      rowHref={(r) => r.href}
      minWidth="760px"
      empty={<EmptyState icon={CircleCheck} title={t("apprNone")} description={t("apprNoneHint")} />}
    />
  );
  return (
    <>
      <Panel title={t("apprT", { n: main.length })} href="/orders?status=PENDING_APPROVAL">
        {table(main)}
      </Panel>
      {other.length ? <Panel title={t("apprOtherT", { n: other.length })}>{table(other)}</Panel> : null}
    </>
  );
}

function Delta({ cur, prev }: { cur: string; prev: string | null | undefined }) {
  const t = useTranslations("home.br");
  const d = prev == null ? null : pctDelta(cur, prev);
  if (!d)
    return (
      <span className="flex items-center gap-1 text-caption text-text-secondary">
        <Minus size={14} strokeWidth={1.5} aria-hidden /> {t("noCmp")}
      </span>
    );
  const Icon = d.up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("flex items-center gap-1 text-caption", d.up ? "text-success" : "text-danger")}>
      <Icon size={14} strokeWidth={1.5} aria-hidden /> {d.text} <span className="text-text-secondary">{t("vsPrev")}</span>
    </span>
  );
}

export function Now() {
  const t = useTranslations("home.br");
  return (
    <span className="flex items-center gap-1 text-caption text-text-secondary">
      <Clock size={14} strokeWidth={1.5} aria-hidden /> {t("now")}
    </span>
  );
}

export function Kpi({ label, value, delta, note, href }: { label: string; value: string; delta: ReactNode; note: string; href: string }) {
  const t = useTranslations("home.dir");
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary"
    >
      <div className="text-body text-text-secondary">{label}</div>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-section-title whitespace-nowrap tabular-nums xl:text-[22px]">{formatMoney(value)}</span>
        <span className="text-caption text-text-secondary">{t("soum")}</span>
      </div>
      {delta}
      <div className="text-caption text-text-secondary">{note}</div>
    </Link>
  );
}

function Kpis({ view: v }: { view: View }) {
  const t = useTranslations("home.br");
  const k = v.kpi;
  const cost = k.profit != null;
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", cost ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
      <Kpi
        label={t("kSales")}
        value={k.sales}
        delta={<Delta cur={k.sales} prev={k.salesPrev} />}
        note={t("nSales", { n: k.salesDocs })}
        href="/reports/sales"
      />
      {cost ? (
        <Kpi
          label={t("kGp")}
          value={k.profit ?? "0"}
          delta={<Delta cur={k.profit ?? "0"} prev={k.profitPrev} />}
          note={t("nGp", { m: k.margin ? k.margin.replace(".", ",") : "—" })}
          href="/reports/products"
        />
      ) : null}
      <Kpi label={t("kDebt")} value={k.debt} delta={<Now />} note={t("nDebt", { v: formatMoney(k.overdue) })} href="/debts/customers" />
      <Kpi
        label={t("kMoney")}
        value={k.money}
        delta={<Now />}
        note={t("nMoney", { c: formatMoney(k.cash), b: formatMoney(k.bank) })}
        href="/cash"
      />
    </div>
  );
}

function Flow({ cells }: { cells: StatusCell[] }) {
  const t = useTranslations("home");
  const by = new Map(cells.map((c) => [c.status, c]));
  return (
    <Panel title={t("br.flowT")}>
      <ul className="grid grid-cols-3 gap-2 px-4 pb-4 md:grid-cols-5 xl:grid-cols-9">
        {FLOW.map((s) => {
          const c = by.get(s);
          const Icon = isOrderStatus(s) ? STATUS_ICON[s] : Truck;
          const n = c?.todayCount ?? 0;
          return (
            <li key={s} className="min-w-0" title={s === "IN_TRANSIT" ? t("br.shipped") : t(`orderStatus.${s}`)}>
              <Link
                href={`/orders?status=${s}`}
                className="block h-full rounded-control border border-border px-3 py-2.5 hover:bg-background"
              >
                <div className="flex items-center gap-1.5 text-caption text-text-secondary">
                  <Icon
                    size={14}
                    strokeWidth={1.5}
                    aria-hidden
                    className={cn("mt-px shrink-0", s === "PENDING_APPROVAL" && n > 0 ? "text-warning" : "text-primary")}
                  />
                  <span className="min-w-0 truncate">{s === "IN_TRANSIT" ? t("br.shipped") : t(`orderStatus.${s}`)}</span>
                </div>
                <div className="mt-1 text-section-title tabular-nums">{n}</div>
                <div className="text-caption tabular-nums text-text-secondary">{formatMoney(c?.todayAmount ?? "0")}</div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Trips({ rows }: { rows: Trip[] }) {
  const t = useTranslations("home.br");
  const cols: MiniCol<Trip>[] = [
    { key: "no", title: t("c.trip"), render: (r) => <span className="font-mono text-caption">{r.number}</span> },
    { key: "driver", title: t("c.driver"), render: (r) => r.driver },
    { key: "car", title: t("c.car"), render: (r) => r.vehicle },
    { key: "orders", title: t("c.orders"), right: true, render: (r) => r.orders },
    { key: "st", title: t("c.status"), render: (r) => (isTrip(r.status) ? t(`trip.${r.status}`) : r.status) },
  ];
  return (
    <Panel title={t("tripsT")} href="/shipments?tab=trips">
      <MiniTable
        caption={t("tripsT")}
        cols={cols}
        rows={rows}
        rowKey={(r) => String(r.id)}
        rowHref={() => "/shipments?tab=trips"}
        minWidth="620px"
        empty={<EmptyState icon={Truck} title={t("tripsNone")} description={t("tripsNoneHint")} />}
      />
    </Panel>
  );
}

function Accounts({ rows }: { rows: Account[] }) {
  const t = useTranslations("home.br");
  const time = (iso: string) =>
    new Intl.DateTimeFormat("uz-Latn", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Tashkent" }).format(
      new Date(iso),
    );
  const cols: MiniCol<Account>[] = [
    { key: "name", title: t("c.acc"), render: (r) => r.name },
    { key: "bal", title: t("c.bal"), right: true, render: (r) => formatMoney(r.balance) },
    {
      key: "day",
      title: t("c.day"),
      render: (r) =>
        r.kind !== "CASH" ? (
          <span className="text-text-secondary">—</span>
        ) : r.closedAt ? (
          <span className="text-success">{t("closed", { t: time(r.closedAt) })}</span>
        ) : (
          <span className="text-info">{t("open")}</span>
        ),
    },
  ];
  return (
    <Panel title={t("moneyT")}>
      <MiniTable
        caption={t("moneyT")}
        cols={cols}
        rows={rows}
        rowKey={(r) => String(r.id)}
        rowHref={(r) => (r.kind === "BANK" ? "/cash?tab=statement" : "/cash")}
        minWidth="420px"
        empty={<EmptyState icon={CircleCheck} title={t("noAccounts")} description={t("noAccountsHint")} />}
      />
    </Panel>
  );
}
