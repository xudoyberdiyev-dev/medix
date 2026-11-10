"use client";

import { AlertTriangle, ArrowLeft, ArrowUpRight, Check, Clock, Gauge, Info, Lock, Stamp, Undo2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useApproveOrder, useOrder, useRejectOrder, useReturnOrder } from "@/features/orders/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { chips, creditBar, fromTiyin, toMln, visibleOrders, waitLate, waitParts, type ApprovalTab } from "./model";
import { useThresholds } from "@/features/settings/thresholds";

type View = components["schemas"]["ApprovalsView"];
type OrderApproval = components["schemas"]["OrderApproval"];
type CreditDetail = components["schemas"]["CreditDetail"];

const VIEW_PERMS = ["approvals.view", "approvals.branch", "approvals.director"];

function useApprovals(branchId: number | null, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["approvals", branchId],
    queryFn: () => unwrap(api.GET("/api/approvals", { params: { query: { branchId: branchId ?? undefined } } })),
    refetchInterval: 60_000,
  });
}

function useCredit(id: number | null) {
  return useQuery({
    queryKey: ["approvals", "credit", id],
    queryFn: () => unwrap(api.GET("/api/approvals/orders/{id}/credit", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

/** «Tasdiqlash» (prototip `Approvals`): narx tasdiqlari bloki, yorliqlar, chapda navbat, oʻngda kredit tafsiloti va qaror tugmalari. */
export function ApprovalsPage() {
  const t = useTranslations("approvals");
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const allowed = VIEW_PERMS.some((k) => can(me.data, k));
  const q = useApprovals(branchId, allowed);
  const tab = (["mine", "all", "today"] as const).find((k) => k === params.get("tab")) ?? "mine";
  const openId = Number(params.get("open")) || null;
  const setUrl = (next: { tab?: ApprovalTab; open?: number | null }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.tab !== undefined) {
      if (next.tab === "mine") sp.delete("tab");
      else sp.set("tab", next.tab);
      sp.delete("open");
    }
    if (next.open === null) sp.delete("open");
    else if (next.open !== undefined) sp.set("open", String(next.open));
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const data = q.data;
  const orders = data ? visibleOrders(data.orders, tab === "today" ? "all" : tab) : [];
  const mineCount = data ? visibleOrders(data.orders, "mine").length : undefined;
  const selected = tab === "today" ? null : (orders.find((o) => o.id === openId) ?? orders[0] ?? null);

  return (
    <>
      <div className="mb-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("title")}
          {data ? <span className="tabular text-body font-normal text-text-secondary">{data.orders.length}</span> : null}
        </h1>
        <p className="mt-1 text-text-secondary">{t("sub")}</p>
      </div>
      {q.error ? (
        <div className="rounded-card border border-border bg-surface">
          <ErrorState onRetry={() => q.refetch()} />
        </div>
      ) : !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <>
          {data.prices.length > 0 ? <PriceBlock prices={data.prices} /> : null}
          <div className="mb-4">
            <Tabs
              aria-label={t("tabsLabel")}
              value={tab}
              onChange={(k) => setUrl({ tab: k as ApprovalTab })}
              items={[
                { key: "mine", label: t("tabMine"), count: mineCount },
                { key: "all", label: t("tabAll"), count: data.orders.length },
                { key: "today", label: t("tabToday"), count: data.resolvedToday.length },
              ]}
            />
          </div>
          {tab === "today" ? (
            <Resolved items={data.resolvedToday} />
          ) : orders.length === 0 ? (
            <div className="rounded-card border border-border bg-surface">
              <EmptyState icon={Stamp} title={t("emptyTitle")} description={t("emptyDescription")} />
            </div>
          ) : (
            <div className="grid overflow-hidden rounded-card border border-border bg-surface lg:grid-cols-[400px_minmax(0,1fr)]">
              <ul className={cn("border-border lg:border-r", selected && openId ? "max-lg:hidden" : "")} aria-label={t("tabsLabel")}>
                {orders.map((o) => (
                  <QueueRow key={o.id} o={o} active={selected?.id === o.id} onSelect={() => setUrl({ open: o.id })} />
                ))}
              </ul>
              {selected ? (
                <div className={cn("min-w-0", !openId && "max-lg:hidden")}>
                  <button
                    type="button"
                    onClick={() => setUrl({ open: null })}
                    className="m-4 mb-0 inline-flex items-center gap-1 text-table text-primary-button lg:hidden"
                  >
                    <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
                    {t("back")}
                  </button>
                  <Detail key={selected.id} o={selected} onDone={() => setUrl({ open: null })} />
                </div>
              ) : (
                <p className="p-6 text-text-secondary">{t("selectHint")}</p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function PriceBlock({ prices }: { prices: View["prices"] }) {
  const t = useTranslations("approvals");
  return (
    <section className="mb-4 rounded-card border border-primary/40 bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-subtitle">{t("prices", { count: prices.length })}</h2>
        <p className="text-caption text-text-secondary">{t("pricesSub")}</p>
      </div>
      <ul>
        {prices.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
            <span className="font-mono text-table">{p.number}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{t("priceLine", { branch: p.branch, lines: p.lines })}</span>
              <span className="text-caption text-text-secondary">
                {t("priceSent", { at: formatDateTime(new Date(p.submittedAt)), who: p.createdBy })}
              </span>
            </span>
            <Link
              href={`/prices/changes/${p.id}`}
              className="inline-flex h-control-md items-center rounded-control border border-border px-3 font-medium text-primary-button hover:bg-background"
            >
              {t("review")}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Wait({ minutes }: { minutes: number }) {
  const t = useTranslations("approvals");
  const w = waitParts(minutes);
  return (
    <span className={cn("inline-flex items-center gap-1 text-table", waitLate(minutes) ? "text-warning" : "text-text-secondary")}>
      <Clock size={14} strokeWidth={1.5} aria-hidden />
      {t(w.key, { d: w.d, h: w.h, m: w.m })}
    </span>
  );
}

function QueueRow({ o, active, onSelect }: { o: OrderApproval; active: boolean; onSelect: () => void }) {
  return (
    <li className="border-b border-border">
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "relative flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-background",
          active && "bg-primary-soft hover:bg-primary-soft",
        )}
      >
        {active ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" /> : null}
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium">{o.customer}</span>
          <span className="tabular shrink-0 font-semibold">{formatMoney(o.total)}</span>
        </span>
        <span className="flex items-center justify-between gap-3 text-table text-text-secondary">
          <span className="truncate">
            <span className="font-mono">{o.number}</span> · {o.createdBy}
          </span>
          <Wait minutes={o.waitMinutes} />
        </span>
        <ChipRow o={o} />
      </button>
    </li>
  );
}

function ChipRow({ o }: { o: OrderApproval }) {
  const t = useTranslations("approvals");
  const list = chips(o, useThresholds());
  if (list.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {list.map((c) => (
        <span
          key={c.kind}
          className={cn(
            "rounded-sm px-2 py-0.5 text-table",
            c.tone === "danger" ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning",
          )}
        >
          {c.kind === "limit"
            ? t("chipLimit", { pct: c.pct ?? 0 })
            : c.kind === "overdue"
              ? t("chipOverdue", { mln: c.mln ?? "", days: c.days ?? 0 })
              : t("chipBlocked")}
        </span>
      ))}
    </span>
  );
}

function Detail({ o, onDone }: { o: OrderApproval; onDone: () => void }) {
  const t = useTranslations("approvals");
  const qc = useQueryClient();
  const credit = useCredit(o.id);
  const order = useOrder(o.id);
  const approve = useApproveOrder();
  const back = useReturnOrder();
  const reject = useRejectOrder();
  const [rejecting, setRejecting] = useState(false);
  const done = (title: string) => {
    toast({ tone: "success", title, description: o.number });
    void qc.invalidateQueries({ queryKey: ["approvals"] });
    onDone();
  };
  const bar = creditBar(o.debt, o.total, o.creditLimit);
  const lines = order.data?.lines ?? [];
  const reasonIcon = (r: string) => (/limit/i.test(r) ? Gauge : /muddat|просроч/i.test(r) ? Clock : /blok|заблок/i.test(r) ? Lock : Info);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-section-title">{o.customer}</h2>
          {o.customerTin ? <span className="tabular font-mono text-table text-text-secondary">{o.customerTin}</span> : null}
          {o.customerAddress ? <span className="text-table text-text-secondary">{o.customerAddress}</span> : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-text-secondary">
          {t("order", { number: o.number, lines: o.lines, total: formatMoney(o.total) })}
          <Link href={`/orders/${o.id}`} className="inline-flex items-center gap-1 text-primary-button hover:underline">
            {t("openCard")}
            <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
          </Link>
        </p>
      </header>

      <section className="rounded-card border border-warning/50 bg-warning-bg/40 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 font-medium text-warning">
            <AlertTriangle size={16} strokeWidth={1.5} aria-hidden />
            {t("why")}
          </h3>
          <span className="text-table text-text-secondary">
            {t("level", { level: t(`level${o.level === "DIRECTOR" ? "DIRECTOR" : "BRANCH"}`) })}
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {(o.reasons.length ? o.reasons : [t("whyNone")]).map((r) => {
            const Icon = reasonIcon(r);
            return (
              <li key={r} className="flex items-start gap-2">
                <Icon size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
                {r}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-card border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-medium">{t("credit")}</h3>
          <Link
            href={`/customers/${o.customerId}?tab=recon`}
            className="inline-flex items-center gap-1 text-table text-primary-button hover:underline"
          >
            {t("currentDebt", { sum: formatMoney(o.debt) })}
            <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-background" aria-hidden>
          <span className="absolute inset-y-0 left-0 bg-text-secondary" style={{ width: `${bar.debt}%` }} />
          <span className="absolute inset-y-0 bg-primary" style={{ left: `${bar.debt}%`, width: `${bar.order}%` }} />
          <span
            className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--color-danger)_0_4px,transparent_4px_7px)]"
            style={{ left: `${bar.debt + bar.order}%`, width: `${bar.over}%` }}
          />
          {bar.limitAt != null ? <span className="absolute -inset-y-1 w-0.5 bg-text-primary" style={{ left: `${bar.limitAt}%` }} /> : null}
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-table">
          <Legend color="bg-text-secondary" label={t("lgDebt")} value={formatMoney(o.debt)} />
          <Legend color="bg-primary" label={t("lgOrder")} value={formatMoney(o.total)} />
          {bar.over > 0 ? <Legend color="bg-danger" label={t("lgOver")} value={formatMoney(fromTiyin(bar.overAmount))} /> : null}
          {o.creditLimit ? <Legend color="bg-text-primary" label={t("lgLimit")} value={formatMoney(o.creditLimit)} /> : null}
        </dl>
        <p className={cn("mt-3 text-table", bar.over > 0 ? "text-danger" : "text-text-secondary")}>
          {!o.creditLimit
            ? t("noLimit")
            : bar.over > 0
              ? t("overBy", { sum: formatMoney(fromTiyin(bar.overAmount)) })
              : t("left", { sum: formatMoney(fromTiyin(bar.leftAmount ?? 0n)) })}
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-card border border-border p-4">
          <h3 className="mb-3 font-medium">{t("aging")}</h3>
          {credit.data ? <Aging c={credit.data} /> : <Skeleton className="h-14 w-full" />}
          <h3 className="mt-5 mb-1 font-medium">{t("discipline")}</h3>
          {credit.data ? <Discipline c={credit.data} /> : <Skeleton className="h-24 w-full" />}
        </section>
        <section className="rounded-card border border-border p-4">
          <h3 className="mb-3 font-medium">{t("lastPays")}</h3>
          {!credit.data ? (
            <Skeleton className="h-20 w-full" />
          ) : credit.data.payments.length === 0 ? (
            <p className="text-table text-text-secondary">{t("noPays")}</p>
          ) : (
            <ul>
              {credit.data.payments.map((p, i) => (
                <li key={i} className="flex items-center gap-4 border-b border-border py-2 text-table last:border-b-0">
                  <span className="tabular text-text-secondary">{p.date.split("-").reverse().join(".")}</span>
                  <span className="flex-1 text-text-secondary">
                    {t(`kind${p.kind === "CASH" ? "CASH" : p.kind === "TERMINAL" ? "TERMINAL" : "BANK"}`)}
                  </span>
                  <span className="tabular font-medium">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {o.note ? (
        <section className="rounded-card bg-background p-4">
          <p className="text-caption text-text-secondary">{t("opNote", { who: o.createdBy })}</p>
          <p className="mt-1 italic">«{o.note}»</p>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 font-medium">{t("lines")}</h3>
        {order.data ? (
          <ul>
            {lines.slice(0, 5).map((l) => (
              <li key={l.id} className="flex justify-between gap-4 border-b border-border py-1.5">
                <span className="truncate">{l.productName}</span>
                <span className="tabular shrink-0">{formatQuantity(l.qty)}</span>
              </li>
            ))}
            {lines.length > 5 ? <li className="pt-1.5 text-table text-text-secondary">{t("more", { count: lines.length - 5 })}</li> : null}
          </ul>
        ) : (
          <Skeleton className="h-24 w-full" />
        )}
      </section>

      <footer className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 py-3 md:-mx-6 md:-mb-6 md:px-6">
        {o.mine ? (
          <>
            <Button
              variant="tertiary"
              icon={Undo2}
              loading={back.isPending}
              onClick={() =>
                void back.mutateAsync(o.id).then(
                  () => done(t("returned")),
                  () => undefined,
                )
              }
            >
              {t("returnDraft")}
            </Button>
            <Button variant="secondary" onClick={() => (reject.reset(), setRejecting(true))}>
              {t("reject")}
            </Button>
            <Button
              icon={Check}
              loading={approve.isPending}
              onClick={() =>
                void approve.mutateAsync(o.id).then(
                  () => done(t("approved")),
                  () => undefined,
                )
              }
            >
              {t("approve")}
            </Button>
          </>
        ) : (
          <p className="inline-flex items-center gap-2 text-table text-text-secondary">
            <Lock size={16} strokeWidth={1.5} aria-hidden />
            {t("needDirector")}
          </p>
        )}
      </footer>
      {rejecting ? (
        <DeactivateDialog
          title={t("rejectTitle", { number: o.number })}
          consequence={t("rejectConsequence")}
          actionLabel={t("reject")}
          pending={reject.isPending}
          error={reject.error}
          onClose={() => setRejecting(false)}
          onConfirm={(reason) =>
            void reject.mutateAsync({ id: o.id, reason }).then(
              () => (setRejecting(false), done(t("rejected"))),
              () => undefined,
            )
          }
        />
      ) : null}
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-[2px]", color)} />
      <dt className="text-text-secondary">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}

function Aging({ c }: { c: CreditDetail }) {
  const t = useTranslations("approvals");
  const cells = [
    [t("ag0"), c.d0to30],
    [t("ag1"), c.d31to60],
    [t("ag2"), c.d61to90],
    [t("ag3"), c.d90plus],
  ] as const;
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-control border border-border">
      {cells.map(([label, v], i) => (
        <div key={label} className={cn("px-2.5 py-2", i > 0 && "border-l border-border")}>
          <div className="text-caption text-text-secondary">{label}</div>
          <div className={cn("tabular text-table font-medium", i >= 2 && Number(toMln(v).replace(",", "")) > 0 && "text-danger")}>
            {/^0+(\.0+)?$/.test(v) ? "—" : t("mln", { mln: toMln(v) })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Discipline({ c }: { c: CreditDetail }) {
  const t = useTranslations("approvals");
  const names = t("monthsShort").split(",");
  const max = Math.max(1, ...c.months.map((m) => m.avgDelayDays));
  return (
    <>
      <p className="text-table text-text-secondary">{t("disciplineAvg", { days: c.avgDelayDays })}</p>
      <div className="mt-3 flex h-24 items-end gap-3">
        {c.months.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
            <span className="tabular text-caption text-text-secondary">{m.avgDelayDays}</span>
            <span
              aria-hidden
              className={cn("w-full rounded-t-[2px]", m.avgDelayDays > 30 ? "bg-danger" : m.avgDelayDays > 0 ? "bg-warning" : "bg-border")}
              style={{ height: `${Math.max(3, (m.avgDelayDays / max) * 56)}px` }}
            />
            <span className="text-caption text-text-secondary">{names[Number(m.month.slice(5)) - 1]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Resolved({ items }: { items: View["resolvedToday"] }) {
  const t = useTranslations("approvals");
  if (items.length === 0)
    return (
      <div className="rounded-card border border-border bg-surface">
        <EmptyState icon={Stamp} title={t("noneToday")} description={t("emptyDescription")} />
      </div>
    );
  return (
    <ul className="rounded-card border border-border bg-surface">
      {items.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{r.customer}</span>
            <span className="text-table text-text-secondary">
              <Link href={`/orders/${r.id}`} className="font-mono text-primary-button hover:underline">
                {r.number}
              </Link>{" "}
              · {t("decidedBy", { at: formatDateTime(new Date(r.decidedAt)), who: r.decidedBy })}
              {r.reason ? ` · «${r.reason}»` : ""}
            </span>
          </span>
          <span className="tabular font-medium">{formatMoney(r.total)}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-table",
              r.decision === "REJECTED" ? "bg-danger-bg text-danger" : "bg-success-bg text-success",
            )}
          >
            {r.decision === "REJECTED" ? (
              <AlertTriangle size={14} strokeWidth={1.5} aria-hidden />
            ) : (
              <Check size={14} strokeWidth={1.5} aria-hidden />
            )}
            {t(r.decision === "REJECTED" ? "decREJECTED" : "decAPPROVED")}
          </span>
        </li>
      ))}
    </ul>
  );
}
