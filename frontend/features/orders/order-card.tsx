"use client";

import { Check, ChevronDown, ChevronRight, ScanLine, TriangleAlert, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useState, type ReactNode } from "react";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatQuantity, formatTime } from "@/lib/format";
import { CodesOwnerValue } from "./codes-owner";
import { useOrderHistory, type OrderDetail } from "./api";
import { formatPct } from "./discount";
import { pickPhase, pickRows } from "./order-pick";
import { day } from "./orders-page";

type Status = OrderDetail["status"];

const FLOW: Status[] = ["DRAFT", "QUEUED", "PICKING", "MARKING", "CHECKING", "DOCUMENTING", "LOADING", "IN_TRANSIT", "DELIVERED"];
const PICKUP_FLOW: Status[] = ["DRAFT", "QUEUED", "PICKING", "MARKING", "CHECKING", "DOCUMENTING", "DELIVERED"];

export interface Step {
  status: Status;
  state: "done" | "current" | "todo" | "fail";
}

/**
 * Buyurtma bosqichlari (prototip `OrderCard` stepper): Qoralama → [Tasdiqlashda] → Navbatda → … → Yetkazildi.
 * «Tasdiqlashda» faqat tasdiq talab qilingan buyurtmada; «Oʻzi olib ketadi» — yuklash va yoʻl bosqichlarisiz.
 * Rad etilgan — «Tasdiqlashda» qizil; yetkazilmagan — oxirgi bosqich qizil; bekor qilingan — joriy bosqich qizil.
 */
export function orderSteps(o: {
  status: Status;
  deliveryType: "DELIVERY" | "PICKUP";
  approvalLevel?: string | null;
  submittedAt?: string | null;
  pickStartedAt?: string | null;
  pickFinishedAt?: string | null;
}): Step[] {
  const base = o.deliveryType === "PICKUP" ? PICKUP_FLOW : FLOW;
  const approval = o.approvalLevel != null || o.status === "PENDING_APPROVAL" || o.status === "REJECTED";
  const flow: Status[] = approval ? [base[0], "PENDING_APPROVAL", ...base.slice(1)] : [...base];
  let at: number;
  let fail = false;
  if (o.status === "REJECTED") {
    at = flow.indexOf("PENDING_APPROVAL");
    fail = true;
  } else if (o.status === "UNDELIVERED") {
    at = flow.length - 1;
    fail = true;
  } else if (o.status === "CANCELLED") {
    // Bekor qilingan joy: yigʻish tugagan → Markirovka, boshlangan → Yigʻish, yuborilgan → Navbat, aks holda Qoralama
    at = flow.indexOf(o.pickFinishedAt ? "MARKING" : o.pickStartedAt ? "PICKING" : o.submittedAt ? "QUEUED" : "DRAFT");
    fail = true;
  } else {
    at = flow.indexOf(o.status);
  }
  return flow.map((status, i) => ({
    status,
    state: i < at ? "done" : i === at ? (fail ? "fail" : o.status === "DELIVERED" ? "done" : "current") : "todo",
  }));
}

function stamp(iso?: string | null): string | undefined {
  return iso ? `${formatDate(new Date(iso)).slice(0, 5)} ${formatTime(new Date(iso))}` : undefined;
}

/** Pul satri ("1250.50") → tiyin (BigInt) — float ishlatilmaydi. */
export function cents(amount: string): bigint {
  const neg = amount.trim().startsWith("-");
  const [i, f = ""] = amount.trim().replace("-", "").split(".");
  const v = BigInt(i) * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -v : v;
}

export function fromCents(v: bigint): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

function shortName(name?: string | null): string | undefined {
  if (!name) return undefined;
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
}

export function OrderStepper({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders");
  const steps = orderSteps(doc);
  const meta: Partial<Record<Status, { time?: string; who?: string }>> = {
    DRAFT: { time: stamp(doc.createdAt), who: shortName(doc.createdBy) },
    PENDING_APPROVAL: { time: stamp(doc.submittedAt) },
    QUEUED: { time: stamp(doc.decidedAt ?? doc.submittedAt), who: shortName(doc.decidedBy) },
    PICKING: { time: stamp(doc.pickStartedAt), who: shortName(doc.picker) },
    MARKING: { time: stamp(doc.pickFinishedAt) },
  };
  return (
    <section
      aria-label={t("card.steps")}
      className="grid min-h-16 items-start rounded-card border border-border bg-surface px-2 py-3 shadow-sm"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((s, i) => {
        const m = s.state === "todo" ? undefined : meta[s.status];
        const line = i < steps.length - 1;
        return (
          <div
            key={s.status}
            className="relative flex min-w-0 flex-col items-center gap-1.5"
            aria-current={s.state === "current" ? "step" : undefined}
          >
            {line ? (
              <span
                aria-hidden
                className={`absolute top-[9px] left-[calc(50%+14px)] h-0.5 w-[calc(100%-28px)] rounded-full ${s.state === "done" ? "bg-primary" : "bg-border"}`}
              />
            ) : null}
            <span
              aria-hidden
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-white ${
                s.state === "done"
                  ? "bg-primary"
                  : s.state === "fail"
                    ? "bg-danger"
                    : s.state === "current"
                      ? "border-2 border-primary bg-surface"
                      : "border-2 border-border bg-surface"
              }`}
            >
              {s.state === "done" ? <Check size={12} strokeWidth={2} /> : null}
              {s.state === "fail" ? <X size={12} strokeWidth={2} /> : null}
              {s.state === "current" ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            <span className="flex max-w-full min-w-0 flex-col items-center px-1 text-center">
              <span
                className={`text-[11.5px] leading-[15px] [overflow-wrap:anywhere] ${
                  s.state === "current"
                    ? "font-semibold text-text-primary"
                    : s.state === "fail"
                      ? "font-semibold text-danger"
                      : "text-text-secondary"
                }`}
              >
                {s.state === "fail" && doc.status !== "REJECTED" ? t(`status.${doc.status}`) : t(`status.${s.status}`)}
              </span>
              {m?.time ? <span className="text-[11px] leading-[14px] text-text-secondary tabular-nums">{m.time}</span> : null}
              {m?.who ? <span className="max-w-full truncate text-[11px] leading-[14px] text-text-secondary">{m.who}</span> : null}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function InfoCard({ title, rows }: { title: string; rows: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <section className="rounded-card border border-border bg-surface shadow-sm">
      <h3 className="border-b border-border px-5 py-3.5 font-semibold">{title}</h3>
      <dl className="flex flex-col px-5 pb-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-b-0">
            <dt className="text-caption text-text-secondary">{r.label}</dt>
            <dd className={r.mono ? "font-mono text-[13px]" : "[overflow-wrap:anywhere]"}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Buyurtma kartasi tanasi (prototip `OrderCard`): yorliqlar, uchta maʼlumot kartasi, qatorlar (buyurtma / yigʻilgan / joʻnatilgan). */
const HISTORY_ACTIONS = new Set<string>([
  "approve",
  "backToDocumenting",
  "cancel",
  "check",
  "codesOwner",
  "create",
  "delivered",
  "documented",
  "issue",
  "issueResolve",
  "markConfirm",
  "markExport",
  "markFinish",
  "markRemove",
  "markStart",
  "partial",
  "pickFinish",
  "pickStart",
  "reject",
  "returnAccept",
  "returnToDraft",
  "returnToPick",
  "submit",
  "time",
  "undelivered",
  "update",
]);
type HistoryAction =
  | "approve"
  | "backToDocumenting"
  | "cancel"
  | "check"
  | "codesOwner"
  | "create"
  | "delivered"
  | "documented"
  | "issue"
  | "issueResolve"
  | "markConfirm"
  | "markExport"
  | "markFinish"
  | "markRemove"
  | "markStart"
  | "partial"
  | "pickFinish"
  | "pickStart"
  | "reject"
  | "returnAccept"
  | "returnToDraft"
  | "returnToPick"
  | "submit"
  | "time"
  | "undelivered"
  | "update";

function OrderHistory({ id }: { id: number }) {
  const t = useTranslations("orders.card.history");
  const q = useOrderHistory(id);
  return (
    <HistoryTimeline
      query={q}
      label={(a) => {
        const k = a.replace(/^order\./, "");
        return HISTORY_ACTIONS.has(k) ? t(k as HistoryAction) : a;
      }}
    />
  );
}

/** «Toʻlov» yorligʻi (prototip `OrderCard`): sotuv summasi, toʻlandi, qoldi, toʻlov muddati (kechikish), taqsimlangan MT lar. */
/** «Terish» yorligʻi (prototip `OrderCard`): kim va qachon yigʻdi, partiyalar (FEFO zahira yoki yigʻilgan), markirovka holati. */
function OrderPicking({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders.card.pick");
  const rows = pickRows(doc);
  const phase = pickPhase(doc);
  if (rows.length === 0)
    return (
      <div className="rounded-card border border-border bg-surface">
        <EmptyState icon={ScanLine} title={t("emptyTitle")} description={phase === "reserved" ? t("emptyQueued") : t("emptyNotYet")} />
      </div>
    );
  const at = (iso: string) => `${formatDate(new Date(iso))} ${formatTime(new Date(iso))}`;
  const meta =
    phase === "done" && doc.pickStartedAt && doc.pickFinishedAt
      ? t("metaDone", { who: doc.picker ?? "—", from: at(doc.pickStartedAt), to: formatTime(new Date(doc.pickFinishedAt)) })
      : phase === "running" && doc.pickStartedAt
        ? t("metaRunning", { who: doc.picker ?? "—", from: at(doc.pickStartedAt) })
        : t("metaReserved");
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
        <span>{meta}</span>
        {doc.fefoDeviation ? (
          <span className="flex items-center gap-1 text-warning">
            <TriangleAlert size={14} strokeWidth={1.5} aria-hidden />
            {t("fefo")}
          </span>
        ) : null}
      </p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[720px] text-table">
          <thead className="bg-table-header text-left text-caption text-text-secondary">
            <tr>
              <th className="px-3 py-2.5 font-medium">{t("cProduct")}</th>
              <th className="px-3 py-2.5 font-medium">{t("cBatch")}</th>
              <th className="px-3 py-2.5 font-medium">{t("cExp")}</th>
              <th className="px-3 py-2.5 font-medium">{t("cZone")}</th>
              <th className="px-3 py-2.5 text-right font-medium">{t("cQty")}</th>
              <th className="px-3 py-2.5 font-medium">{t("cMark")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-3 font-medium">{r.product}</td>
                <td className="px-3 py-3 font-mono text-[12.5px]">{r.batch}</td>
                <td className="px-3 py-3 tabular-nums">{day(r.expiryDate)}</td>
                <td className="px-3 py-3 text-text-secondary">{r.zone}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{formatQuantity(r.qty)}</td>
                <td className={cn("px-3 py-3", r.mark === "done" ? "text-success" : "text-text-secondary")}>
                  <span className="flex items-center gap-1">
                    {r.mark === "done" ? <Check size={14} strokeWidth={1.5} aria-hidden /> : null}
                    {r.mark === "none" ? "—" : t(r.mark === "done" ? "markDone" : "markWait")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderPayment({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders.card");
  const me = useMe();
  const saleId = doc.documents.saleId ?? null;
  const pay = useQuery({
    queryKey: ["orders", "payment", saleId],
    queryFn: () => unwrap(api.GET("/api/payments/customer/doc", { params: { query: { docType: "SV", docId: saleId ?? 0 } } })),
    enabled: saleId !== null && doc.documents.saleStatus === "POSTED",
  });
  if (saleId === null || doc.documents.saleStatus !== "POSTED")
    return (
      <div className="rounded-card border border-border bg-surface p-5">
        <p className="font-medium">{t("payEmptyT")}</p>
        <p className="mt-1 text-text-secondary">{t("payEmpty")}</p>
      </div>
    );
  if (pay.isPending)
    return (
      <div className="flex justify-center rounded-card border border-border bg-surface p-8">
        <Spinner />
      </div>
    );
  if (pay.error || !pay.data) return <ErrorState onRetry={() => pay.refetch()} />;
  const p = pay.data;
  const closed = p.open === "0.00" || p.open.startsWith("-");
  const canOpen = can(me.data, "payments.view");
  const kpis: { label: string; value: string; tone?: string; note?: string; noteTone?: string }[] = [
    { label: t("paySale"), value: formatMoney(p.total) },
    { label: t("payPaid"), value: formatMoney(p.settled), tone: "text-success" },
    {
      label: t("payLeft"),
      value: formatMoney(closed ? "0.00" : p.open),
      tone: closed ? "text-success" : undefined,
      note: closed ? t("payClosed") : undefined,
      noteTone: "text-success",
    },
    {
      label: t("payDue"),
      value: p.dueDate ? day(p.dueDate) : "—",
      tone: p.overdueDays > 0 ? "text-danger" : undefined,
      note: p.overdueDays > 0 ? t("payLate", { n: p.overdueDays }) : undefined,
      noteTone: "text-danger",
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
            <span className="text-caption text-text-secondary">{k.label}</span>
            <span className={cn("text-[20px] leading-7 font-semibold tabular-nums", k.tone)}>{k.value}</span>
            {k.note ? <span className={cn("text-caption", k.noteTone)}>{k.note}</span> : null}
          </div>
        ))}
      </div>
      <div className="rounded-card border border-border bg-surface">
        <p className="border-b border-border px-4 py-3 font-semibold">{t("payList")}</p>
        {p.payments.length === 0 ? (
          <p className="px-4 py-6 text-center text-text-secondary">{t("payNone")}</p>
        ) : (
          p.payments.map((x) => (
            <div
              key={x.paymentId}
              className="grid min-h-11 grid-cols-[140px_110px_minmax(0,1fr)_140px] items-center gap-3 border-b border-border px-4 text-[13px] last:border-b-0"
            >
              {canOpen ? (
                <Link href={`/payments/mt/${x.paymentId}`} className="font-mono text-mono text-primary hover:underline">
                  {x.number}
                </Link>
              ) : (
                <span className="font-mono text-mono">{x.number}</span>
              )}
              <span className="text-text-secondary tabular-nums">{day(x.date)}</span>
              <span className="truncate">{x.account}</span>
              <span className="text-right font-medium tabular-nums">{formatMoney(x.amount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function OrderCardBody({ doc, shipping }: { doc: OrderDetail; shipping?: ReactNode }) {
  const t = useTranslations("orders");
  const [tab, setTab] = useState("order");
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const totalQty = doc.lines.reduce((n, l) => n + l.qty, 0);
  const pay = t(`paymentType.${doc.paymentType}`);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Tabs
        aria-label={t("card.tabs")}
        value={tab}
        onChange={setTab}
        items={[
          { key: "order", label: t("card.tOrder") },
          { key: "pick", label: t("card.tPick") },
          { key: "ship", label: t("card.tShip") },
          { key: "pay", label: t("card.tPay") },
          { key: "history", label: t("card.tHistory") },
        ]}
      />
      {tab === "history" ? (
        <OrderHistory id={doc.id} />
      ) : tab === "pay" ? (
        <OrderPayment doc={doc} />
      ) : tab === "pick" ? (
        <OrderPicking doc={doc} />
      ) : tab === "ship" ? (
        (shipping ?? <p className="rounded-card border border-border bg-surface p-5 text-text-secondary">{t("card.shipEmpty")}</p>)
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-start gap-4">
            <InfoCard
              title={t("card.iGeneral")}
              rows={[
                { label: t("card.number"), value: doc.number, mono: true },
                { label: t("entry.orderDate"), value: `${day(doc.orderDate)}, ${formatTime(new Date(doc.createdAt))}` },
                { label: t("card.operator"), value: doc.createdBy },
              ]}
            />
            <InfoCard
              title={t("card.iDelivery")}
              rows={[
                { label: t("entry.warehouse"), value: doc.warehouse },
                { label: t("entry.deliveryType"), value: doc.deliveryType === "PICKUP" ? t("list.pickup") : t("list.delivery") },
                { label: t("drawer.deliveryDate"), value: doc.deliveryDate ? day(doc.deliveryDate) : "—" },
                ...(doc.deliveryType === "PICKUP" ? [] : [{ label: t("drawer.address"), value: doc.address || "—" }]),
              ]}
            />
            <InfoCard
              title={t("card.iTerms")}
              rows={[
                {
                  label: t("drawer.paymentType"),
                  value: doc.credit.paymentDays ? t("card.payTerm", { pay, days: doc.credit.paymentDays }) : pay,
                },
                { label: t("drawer.note"), value: doc.note || "—" },
                ...(doc.lines.some((l) => l.marked) ? [{ label: t("codesOwner.label"), value: <CodesOwnerValue doc={doc} /> }] : []),
              ]}
            />
          </div>
          <section aria-label={t("entry.lines")} className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px] leading-[18px]">
                <thead className="bg-table-header text-left text-caption text-text-secondary">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">{t("drawer.col.product")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("card.cOrdered")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("card.cPicked")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("card.cShipped")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("drawer.col.price")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("card.cDisc")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("card.cSum")}</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((l) => {
                    const expanded = open[l.id] ?? false;
                    const short = l.picked != null && l.picked < l.qty;
                    return (
                      <Fragment key={l.id}>
                        <tr
                          className="cursor-pointer border-t border-border hover:bg-background"
                          aria-expanded={expanded}
                          onClick={() => setOpen((o) => ({ ...o, [l.id]: !expanded }))}
                        >
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-1.5">
                              {expanded ? (
                                <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
                              ) : (
                                <ChevronRight size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
                              )}
                              <span className="font-medium">{l.productName}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatQuantity(l.qty)}</td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${short ? "font-medium text-warning" : ""}`}
                            title={short ? t("card.short", { n: formatQuantity(l.qty - (l.picked ?? 0)) }) : undefined}
                          >
                            {l.picked != null ? formatQuantity(l.picked) : "—"}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{l.shipped != null ? formatQuantity(l.shipped) : "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{l.price ? formatMoney(l.price) : "—"}</td>
                          <td className={`px-3 py-3 text-right tabular-nums ${Number(l.discountPct) > 0 ? "" : "text-text-secondary"}`}>
                            {formatPct(l.discountPct)}%
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">{l.amount ? formatMoney(l.amount) : "—"}</td>
                        </tr>
                        {expanded ? (
                          <tr className="bg-background">
                            <td colSpan={7} className="px-3 pt-2 pb-3 pl-8 text-[13px]">
                              <span className="font-mono text-caption text-text-secondary">{l.productCode}</span>
                              {l.manufacturer ? <span className="ml-2 text-text-secondary">{l.manufacturer}</span> : null}
                              {l.reserved.length > 0 ? (
                                <ul className="mt-1.5 flex flex-col gap-1">
                                  {l.reserved.map((r) => (
                                    <li key={`${r.batch}-${r.zone}`} className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                                      <span className="min-w-28 font-mono text-caption">{r.batch}</span>
                                      <span className="text-text-secondary tabular-nums">{day(r.expiryDate)}</span>
                                      <span className="text-text-secondary">{r.zone}</span>
                                      <span className="tabular-nums">{formatQuantity(r.qty)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <dl
              aria-label={t("customer.totals")}
              className="flex flex-wrap items-center justify-end gap-x-7 gap-y-1 border-t border-border bg-table-header px-4 py-3"
            >
              <div className="flex gap-1.5">
                <dt className="text-text-secondary">{t("entry.tLines")}</dt>
                <dd className="tabular-nums">{formatQuantity(doc.lines.length)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-text-secondary">{t("entry.tQty")}</dt>
                <dd className="tabular-nums">{formatQuantity(totalQty)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-text-secondary">{t("entry.tGross")}</dt>
                <dd className="tabular-nums">{formatMoney(doc.grossTotal)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-text-secondary">{t("entry.tDisc")}</dt>
                <dd className="tabular-nums">{formatMoney(doc.discountTotal)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-text-secondary">{t("entry.tVat")}</dt>
                <dd className="tabular-nums">{formatMoney(doc.vatTotal)}</dd>
              </div>
              <div className="flex items-baseline gap-2 border-l border-border pl-6">
                <dt className="text-text-secondary">{t("entry.tTotal")}</dt>
                <dd className="text-[18px] leading-6 font-semibold tabular-nums">{formatMoney(doc.total)}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

/** Oʻng ustun (prototip `CustomerPanel`): mijoz, kredit holati, hozir kimda. */
export function OrderCardAside({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders");
  const c = doc.credit;
  const limit = c.creditLimit ? cents(c.creditLimit) : null;
  const counts = doc.status !== "DELIVERED" && doc.status !== "CANCELLED" && doc.status !== "REJECTED" && doc.status !== "UNDELIVERED";
  const withOrder = cents(c.debt) + (counts ? cents(doc.total) : 0n);
  const over = limit !== null && withOrder > limit;
  const pct = limit !== null && limit > 0n ? Number(withOrder > limit ? 100n : (withOrder * 100n) / limit) : over ? 100 : 0;
  return (
    <aside className="flex flex-col gap-4">
      <section className="rounded-card border border-border bg-surface px-4 py-4 shadow-sm">
        <h3 className="text-subtitle">{doc.customer}</h3>
        {doc.customerTin ? (
          <p className="mt-1 text-[13px] text-text-secondary">
            {t("card.tin")} <span className="font-mono text-text-primary">{doc.customerTin}</span>
          </p>
        ) : null}
        {c.blocked ? <p className="mt-2 text-caption font-medium text-danger">{t("list.credit.blocked")}</p> : null}
      </section>
      <section aria-label={t("card.credit")} className="rounded-card border border-border bg-surface px-4 py-4 shadow-sm">
        <h3 className="mb-2 font-semibold">{t("card.credit")}</h3>
        <dl className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">{t("credit.limit")}</dt>
            <dd className="tabular-nums">{c.creditLimit ? formatMoney(c.creditLimit) : t("credit.notSet")}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">{t("card.debtNow")}</dt>
            <dd className="text-primary tabular-nums">{formatMoney(c.debt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">{t("credit.overdue")}</dt>
            <dd className={`tabular-nums ${c.overdueDays > 0 ? "text-danger" : ""}`}>
              {c.overdueDays > 0
                ? t("credit.overdueValue", { amount: formatMoney(c.overdue), days: c.overdueDays })
                : formatMoney(c.overdue)}
            </dd>
          </div>
          {counts ? (
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">{t("card.withOrder")}</dt>
              <dd className="font-medium text-primary tabular-nums">{formatMoney(doc.total)}</dd>
            </div>
          ) : null}
        </dl>
        {limit !== null ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background" aria-hidden>
            <div className={`h-full rounded-full ${over ? "bg-danger" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {over && limit !== null ? (
          <p className="mt-2 flex items-center gap-1.5 text-caption text-danger">
            <TriangleAlert size={14} strokeWidth={1.5} aria-hidden />
            {t("card.overLimit", { amount: formatMoney(fromCents(withOrder - limit)) })}
          </p>
        ) : null}
      </section>
      <section className="rounded-card border border-border bg-surface px-4 py-4 shadow-sm">
        <h3 className="mb-1 text-caption text-text-secondary">{t("docs.holder")}</h3>
        <p className="font-medium">{doc.holder}</p>
      </section>
    </aside>
  );
}
