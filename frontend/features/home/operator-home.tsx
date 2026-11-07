"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CircleCheck, CircleX, PackageX, Plus, Search, Stamp } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { useBranches } from "@/features/employees/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { Flow } from "./branch-home";
import { type AttentionRow, type MiniCol, MiniTable, Panel } from "./director-home";
import { firstName, greetKey, share, tashkentHour, toCents, waitParts } from "./director-view";
import { PeriodPicker, usePeriodState } from "./period-picker";

type OperatorHomeView = components["schemas"]["OperatorHomeView"];
type RecentOrder = components["schemas"]["RecentOrder"];
type OperatorNote = components["schemas"]["OperatorNote"];
type CustomerStatus = components["schemas"]["CustomerStatus"];

export const REPORTS_OWN = "reports.own";

/** Operatorning «Diqqat talab qiladi» qatorlari: faqat oʻz buyurtmalari; nol boʻlganlari yashiriladi. */
export function operatorAttentionRows(a: OperatorHomeView["attention"]): AttentionRow[] {
  const rows: (AttentionRow & { count: number })[] = [
    {
      key: "rej",
      values: { days: a.rejectedDays, count: a.rejected.count },
      value: a.rejected.amount,
      count: a.rejected.count,
      href: "/orders?status=REJECTED&mine=1",
      money: true,
      danger: true,
    },
    {
      key: "draft",
      values: { count: a.drafts.count },
      value: a.drafts.amount,
      count: a.drafts.count,
      href: "/orders?status=DRAFT&mine=1",
      money: true,
    },
    {
      key: "pend",
      values: { count: a.pendingApproval.count },
      value: a.pendingApproval.amount,
      count: a.pendingApproval.count,
      href: "/orders?status=PENDING_APPROVAL&mine=1",
      money: true,
    },
    {
      key: "stale",
      values: { count: a.stale.count },
      value: a.stale.amount,
      count: a.stale.count,
      href: "/orders?mine=1",
      money: true,
    },
  ];
  return rows
    .filter((r) => r.count > 0)
    .map((r): AttentionRow => ({ key: r.key, values: r.values, value: r.value, href: r.href, money: r.money, danger: r.danger }));
}

/** Operator bosh sahifasi — prototip `Home.dc.html` («operator» varianti; SPEC 2, 8): bugungi buyurtmalarim, oxirgi 10 ta, «Eʼtibor bering», «Mijoz holati». */
export function OperatorHome() {
  const t = useTranslations("home");
  const me = useMe();
  const branches = useBranches();
  const allowed = can(me.data, REPORTS_OWN);
  const period = usePeriodState("month");
  const { from, to } = period.range;
  const home = useQuery({
    queryKey: ["home", "operator", from, to],
    queryFn: () => unwrap(api.GET("/api/home/operator", { params: { query: { from: from ?? undefined, to: to ?? undefined } } })),
    enabled: allowed && !!from && !!to,
    refetchInterval: 120_000,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const h = home.data;
  const name = firstName(me.data?.fullName);
  const greet = t(`dir.${greetKey(tashkentHour())}`) + (name ? `, ${name}` : "");
  const branchName = (branches.data ?? []).find((b) => b.id === me.data?.branchId)?.name ?? "";

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
        <div className="flex flex-wrap items-center gap-3">
          {can(me.data, "orders.create") ? (
            <Link
              href="/orders?new=1"
              className="inline-flex h-9 items-center gap-2 rounded-control bg-primary-button px-4 font-medium text-white hover:bg-primary-button-hover"
            >
              <Plus size={16} strokeWidth={1.5} aria-hidden /> {t("op.newOrder")}
            </Link>
          ) : null}
          <PeriodPicker state={period} />
        </div>
      </div>
      {home.error ? (
        <ErrorState onRetry={() => home.refetch()} />
      ) : !h ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <Flow cells={h.orderStatuses} title={t("op.myOrdersT")} hrefSuffix="&mine=1" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-7">
              <Recent rows={h.recent} />
              {can(me.data, "orders.create") ? <CustomerLookup /> : null}
            </div>
            <div className="min-w-0 xl:col-span-5">
              <Notes rows={h.notes} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const ORDER_STATUS = [
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
const isStatus = (s: string): s is (typeof ORDER_STATUS)[number] => (ORDER_STATUS as readonly string[]).includes(s);

function Recent({ rows }: { rows: RecentOrder[] }) {
  const t = useTranslations("home");
  const cols: MiniCol<RecentOrder>[] = [
    { key: "no", title: t("br.c.doc"), render: (r) => <span className="font-mono text-caption">{r.number}</span> },
    { key: "cust", title: t("director.customer"), render: (r) => <span className="line-clamp-1">{r.customer}</span> },
    { key: "sum", title: t("br.c.sum"), right: true, render: (r) => formatMoney(r.total) },
    { key: "st", title: t("br.c.status"), render: (r) => (isStatus(r.status) ? t(`orderStatus.${r.status}`) : r.status) },
  ];
  return (
    <Panel title={t("op.lastOrders")} href="/orders?mine=1">
      <MiniTable
        caption={t("op.lastOrders")}
        cols={cols}
        rows={rows}
        rowKey={(r) => String(r.id)}
        rowHref={(r) => `/orders?open=${r.id}`}
        minWidth="580px"
        empty={<EmptyState icon={CircleCheck} title={t("op.noOrders")} description={t("op.noOrdersHint")} />}
      />
    </Panel>
  );
}

function Notes({ rows }: { rows: OperatorNote[] }) {
  const t = useTranslations("home.op");
  const tb = useTranslations("home.br");
  // Prototip: avval qizil (rad etilgan, qoldiq yo'q), keyin boshqalar
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
  return (
    <Panel title={t("noteT")}>
      {sorted.length === 0 ? (
        <EmptyState icon={CircleCheck} title={t("noteNone")} description={t("noteNoneHint")} />
      ) : (
        <ul className="mx-4 mb-2 divide-y divide-border border-t border-border">
          {sorted.map((n) => {
            const w = waitParts(n.waitMinutes);
            const Icon = n.kind === "REJECTED" ? CircleX : n.kind === "PENDING" ? Stamp : PackageX;
            const tone = n.kind === "REJECTED" || (n.kind === "LOW_STOCK" && n.available === 0) ? "text-danger" : "text-warning";
            const text =
              n.kind === "REJECTED"
                ? t("rej", { no: n.number, r: n.reason ?? "—" })
                : n.kind === "PENDING"
                  ? t("waitAt", { no: n.number, who: `${n.level === "DIRECTOR" ? t("lvDirector") : t("lvBranch")}: ${n.approver ?? "—"}` })
                  : t("lowStock", { p: n.product ?? "", a: n.available, q: n.requested });
            return (
              <li key={`${n.kind}-${n.orderId}-${n.product ?? ""}`}>
                <Link
                  href={n.kind === "LOW_STOCK" ? `/stock?q=${encodeURIComponent(n.product ?? "")}` : `/orders?open=${n.orderId}`}
                  className="flex min-h-11 items-center gap-3 py-2 text-body hover:bg-background"
                >
                  <Icon size={16} strokeWidth={1.5} aria-hidden className={cn("shrink-0", tone)} />
                  <span className="min-w-0 flex-1">
                    {text}
                    {n.kind === "PENDING" ? <span className="block text-caption text-text-secondary">{tb(w.key, { n: w.n })}</span> : null}
                  </span>
                  {n.amount ? <span className="shrink-0 tabular-nums">{formatMoney(n.amount)}</span> : null}
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

function rank(n: OperatorNote): number {
  return n.kind === "REJECTED" || (n.kind === "LOW_STOCK" && n.available === 0) ? 0 : 1;
}

/** «Mijoz holati» (prototip): nomi yoki STIR boʻyicha — holat, qarz / limit, muddati oʻtgan, «Buyurtma yaratish». */
function CustomerLookup() {
  const t = useTranslations("home.op");
  const [q, setQ] = useState("");
  const query = q.trim();
  const res = useQuery({
    queryKey: ["home", "operator", "customers", query],
    queryFn: () => unwrap(api.GET("/api/home/operator/customers", { params: { query: { q: query } } })),
    enabled: query.length >= 2,
  });
  return (
    <Panel title={t("custT")}>
      <div className="px-4 pb-4">
        <label className="flex h-10 items-center gap-2 rounded-control border border-border px-3 focus-within:border-primary">
          <Search size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
          <span className="sr-only">{t("custT")}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("custPh")}
            className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-text-disabled"
          />
        </label>
        {query.length >= 2 ? (
          res.error ? (
            <ErrorState onRetry={() => res.refetch()} />
          ) : !res.data ? (
            <Skeleton className="mt-3 h-16 w-full" />
          ) : res.data.length === 0 ? (
            <p className="mt-3 text-caption text-text-secondary">{t("custNone")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {res.data.map((c) => (
                <CustomerCard key={c.id} c={c} />
              ))}
            </ul>
          )
        ) : null}
      </div>
    </Panel>
  );
}

function CustomerCard({ c }: { c: CustomerStatus }) {
  const t = useTranslations("home.op");
  const bad = c.blocked || c.licenseExpired;
  const limit = c.limit ? toCents(c.limit) : 0n;
  const pct = limit > 0n ? Math.round(share(c.debt, limit) * 100) : 0;
  const over = limit > 0n && toCents(c.debt) > limit;
  return (
    <li className="rounded-control border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{c.name}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-caption font-medium",
            bad ? "bg-danger-bg text-danger" : "bg-success-bg text-success",
          )}
        >
          {c.blocked ? t("custBlocked") : c.licenseExpired ? t("custLic") : t("custOk")}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 text-caption sm:grid-cols-2">
        <div>
          <div className="text-text-secondary">{t("custLimit")}</div>
          <div className="tabular-nums">
            {formatMoney(c.debt)} / {c.limit ? formatMoney(c.limit) : "—"}
            {limit > 0n ? ` · ${pct}%` : ""}
          </div>
          {limit > 0n ? (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background">
              <div
                className={cn("h-full rounded-full", over ? "bg-danger" : pct > 80 ? "bg-warning" : "bg-primary")}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          ) : null}
        </div>
        <div>
          <div className="text-text-secondary">{t("custOver")}</div>
          <div className={cn("tabular-nums", toCents(c.overdue) > 0n ? "text-danger" : "")}>{formatMoney(c.overdue)}</div>
        </div>
      </div>
      <Link
        href={`/orders?new=1&customer=${c.id}&customerName=${encodeURIComponent(c.name)}`}
        className="mt-2 inline-flex items-center gap-1 text-body text-primary-button hover:underline"
      >
        {t("createOrder")} →
      </Link>
    </li>
  );
}
