"use client";

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSignature,
  Inbox,
  Info,
  List,
  Lock,
  MessageSquareText,
  PackageCheck,
  PackageOpen,
  Play,
  Printer,
  ReceiptText,
  Replace,
  ScanBarcode,
  Timer,
  TriangleAlert,
  Truck,
  Undo2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type LucideIcon } from "@/components/ui/icon";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { useBranches } from "@/features/employees/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { useOrder } from "./api";
import { IssueButton } from "./issues";
import { batchLabel, OtherBatchModal, type PickBatch } from "./other-batch-modal";
import { useLiveConnected } from "@/lib/live";
import { day } from "./orders-page";
import type { OrdersT } from "./i18n";
import { repickLines } from "./pick-sheet";

/** Qolgan vaqt: musbat — «12:05», manfiy — «Kechikdi: N daqiqa» (SPEC 5.2). */
export function timerText(deadline: Date, now: Date, t: OrdersT): { text: string; late: boolean } {
  const ms = deadline.getTime() - now.getTime();
  if (ms < 0) return { text: t("timer.late", { minutes: Math.ceil(-ms / 60000) }), late: true };
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { text: `${m}:${String(s).padStart(2, "0")}`, late: false };
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

type PickTab = "queue" | "mine" | "done";
type QueueItem = components["schemas"]["PickQueueItem"];

/** Yigʻuvchi paneli (SPEC 5.4, prototip PickerPanel): «Bugungi natijam», yorliqlar Navbat / Mening yigʻishim / Bugun yakunlanganlar. */
export function PickingPage() {
  const t = useTranslations("orders");
  const me = useMe();
  const qc = useQueryClient();
  const now = useNow();
  const allowed = can(me.data, "picking.do");
  const live = useLiveConnected();
  const branches = useBranches();
  const queue = useQuery({
    queryKey: ["orders", "pick-queue"],
    queryFn: () => unwrap(api.GET("/api/orders/pick-queue")),
    enabled: allowed,
    refetchInterval: live ? 60_000 : 15_000,
  });
  const done = useQuery({
    queryKey: ["orders", "pick-done-today"],
    queryFn: () => unwrap(api.GET("/api/orders/pick-done-today")),
    enabled: allowed,
  });
  const [tab, setTab] = useState<PickTab | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const mine = (queue.data ?? []).find((o) => o.status === "PICKING" && o.pickerId === me.data?.id) ?? null;
  const others = (queue.data ?? []).filter((o) => o.id !== mine?.id);
  const current: PickTab = tab ?? (mine ? "mine" : "queue");

  if (me.data && !allowed) return <ForbiddenState description={t("picking.forbidden")} />;

  async function start(id: number) {
    setPending(id);
    setError(null);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/orders/{id}/pick/start", { params: { path: { id } } }));
      await qc.invalidateQueries({ queryKey: ["orders"] });
      setTab("mine");
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  const err = describeError(error);
  const branchName = branches.data?.find((b) => b.id === me.data?.branchId)?.name;
  return (
    <>
      <h1 className="text-page-title">{t("picking.panelTitle")}</h1>
      {me.data ? <p className="mt-1 text-text-secondary">{[me.data.fullName, branchName].filter(Boolean).join(" · ")}</p> : null}
      <TodayStats />
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      <Tabs
        aria-label={t("picking.panelTitle")}
        value={current}
        onChange={(k) => setTab(k as PickTab)}
        items={[
          { key: "queue", label: t("picking.queue"), count: others.filter((o) => o.status !== "PICKING").length || undefined },
          { key: "mine", label: t("picking.mine"), count: mine ? 1 : undefined },
          { key: "done", label: t("picking.doneToday"), count: done.data?.length || undefined },
        ]}
      />
      <div className="mt-4">
        {current === "done" ? (
          <DoneToday query={done} />
        ) : queue.error ? (
          <ErrorState onRetry={() => queue.refetch()} />
        ) : queue.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : current === "mine" ? (
          mine ? (
            <ActivePick item={mine} now={now} />
          ) : (
            <Card>
              <EmptyState
                icon={PackageOpen}
                title={t("picking.emptyTitle")}
                description={t("picking.emptyHint")}
                action={
                  <Button variant="secondary" onClick={() => setTab("queue")}>
                    {t("picking.toQueue")}
                  </Button>
                }
              />
            </Card>
          )
        ) : others.length === 0 ? (
          <Card>
            <EmptyState icon={Inbox} title={t("picking.queueEmptyTitle")} description={t("picking.queueEmptyHint")} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            {others.map((o) => (
              <QueueCard key={o.id} o={o} blocked={Boolean(mine)} pending={pending === o.id} onStart={() => void start(o.id)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** «Bugungi natijam»: 4 ta karta (prototip): yigʻilgan, oʻz vaqtida, kechikkan, oʻrtacha vaqt. */
function TodayStats() {
  const t = useTranslations("orders");
  const today = useQuery({
    queryKey: ["reports", "pickers", "mine"],
    queryFn: () => unwrap(api.GET("/api/reports/pickers/mine")),
    refetchInterval: 60_000,
  });
  if (today.error) return null;
  const r = today.data;
  const items: [string, string, string][] = r
    ? [
        [t("picking.kDone"), formatQuantity(r.orders), ""],
        [t("picking.kOnTime"), formatQuantity(r.onTime), "text-success"],
        [t("picking.kLate"), formatQuantity(r.late), r.late > 0 ? "text-danger" : ""],
        [t("picking.kAvg"), r.orders > 0 ? t("picking.minutes", { n: formatQuantity(r.avgMinutes) }) : "—", ""],
      ]
    : [];
  return <StatCards title={t("myToday.title")} items={r ? items : null} />;
}

/** «Bugungi natijam» kartalari (Yigʻuvchi / Markirovkachi paneli): [nom, qiymat, rang klassi]. */
export function StatCards({ title, items }: { title: string; items: [string, string, string][] | null }) {
  return (
    <section className="mt-6 mb-6" aria-label={title}>
      <h2 className="mb-2 text-table font-semibold text-text-secondary">{title}</h2>
      {items ? (
        <div className={cn("grid grid-cols-2 gap-3", items.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
          {items.map(([label, value, tone]) => (
            <div key={label} className="min-w-0 rounded-card border border-border bg-surface px-4 py-3">
              <div className="text-caption text-text-secondary">{label}</div>
              <div
                className={cn(
                  "mt-1 text-[24px] leading-8 font-semibold break-words tabular-nums max-sm:text-[20px] max-sm:leading-7",
                  tone,
                )}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Skeleton className="h-[72px] w-full" />
      )}
    </section>
  );
}

export function deliveryText(o: { deliveryType: string; deliveryDate?: string | null }, t: OrdersT): string {
  const kind = o.deliveryType === "PICKUP" ? t("list.pickup") : t("picking.deliver");
  return o.deliveryDate ? `${kind} · ${day(o.deliveryDate)}` : kind;
}

/** Navbat kartasi (prototip): raqam, mijoz, belgilar (Band / Yigʻish: N daqiqa / Markirovka), nakladnoy, qatorlar, yetkazish; «Tafsilot» — partiya rejasi. */
function QueueCard({ o, blocked, pending, onStart }: { o: QueueItem; blocked: boolean; pending: boolean; onStart: () => void }) {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  const busy = o.status === "PICKING";
  const meta: [LucideIcon, string][] = [
    [ReceiptText, o.invoice ? t("picking.invoiceN", { number: o.invoice }) : t("picking.noInvoice")],
    ...(o.contract ? ([[FileSignature, t("picking.contract", { number: o.contract })]] as [LucideIcon, string][]) : []),
    [List, t("picking.linesQty", { lines: formatQuantity(o.lines), qty: formatQuantity(o.totalQty) })],
    [o.deliveryType === "PICKUP" ? User : Truck, deliveryText(o, t)],
  ];
  return (
    <article className={cn("rounded-card border border-border p-4", busy ? "bg-background" : "bg-surface")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("font-mono text-table font-semibold", busy && "text-text-secondary")}>{o.number}</div>
          <div className={cn("mt-0.5 text-subtitle", busy && "text-text-secondary")}>{o.customer}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {busy ? (
            <Badge tone="neutral" icon={Lock}>
              {t("picking.busy", { name: o.picker ?? "" })}
            </Badge>
          ) : null}
          <Badge tone={busy ? "neutral" : "info"} icon={Timer}>
            {o.pickMinutes != null ? t("picking.tm", { n: o.pickMinutes }) : t("picking.tmWait")}
          </Badge>
          {o.marked ? (
            <Badge tone="primary" icon={ScanBarcode}>
              {t("picking.marking")}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className={cn("mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-table", busy ? "text-text-secondary" : "text-text-secondary")}>
        {meta.map(([icon, text]) => (
          <span key={text} className="inline-flex items-start gap-1.5">
            <Icon icon={icon} size="sm" className="mt-0.5 shrink-0" />
            <span>{text}</span>
          </span>
        ))}
      </div>
      {o.note ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-control bg-background px-3 py-2 text-table">
          <Icon icon={MessageSquareText} size="sm" className="mt-0.5 shrink-0 text-text-secondary" />
          <span>{o.note}</span>
        </div>
      ) : null}
      {open ? <QueueLines id={o.id} /> : null}
      <div className={cn("mt-4 grid gap-2", busy ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
        <Button variant="secondary" size="lg" icon={open ? ChevronUp : ChevronDown} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t("picking.hide") : t("picking.details")}
        </Button>
        {busy ? null : blocked ? (
          <span className="inline-flex items-center gap-1.5 text-table text-text-secondary">
            <Icon icon={Info} size="sm" />
            {t("picking.oneActive")}
          </span>
        ) : (
          <Button size="lg" icon={Play} loading={pending} onClick={onStart}>
            {t("picking.start")}
          </Button>
        )}
      </div>
    </article>
  );
}

/** «Tafsilot»: qatorlar va FEFO zahirasi (partiya, muddat, zona, miqdor). */
function QueueLines({ id }: { id: number }) {
  const t = useTranslations("orders");
  const order = useOrder(id);
  if (order.error) return <ErrorState onRetry={() => order.refetch()} />;
  if (!order.data) return <Skeleton className="mt-3 h-16 w-full" />;
  return (
    <ul className="mt-3 flex flex-col border-t border-border">
      {repickLines(order.data).map((l) => (
        <li key={l.id} className="border-b border-border py-2">
          <PlanLine line={l} t={t} />
        </li>
      ))}
    </ul>
  );
}

type PlanLineData = {
  productCode: string;
  productName: string;
  qty: number;
  reserved: { batch: string; expiryDate: string; zone: string; qty: number }[];
};

function PlanLine({ line, t }: { line: PlanLineData; t: OrdersT }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="font-mono text-text-secondary">{line.productCode}</span> {line.productName}
        </span>
        <span className="font-semibold whitespace-nowrap tabular-nums">{t("picking.qty", { qty: formatQuantity(line.qty) })}</span>
      </div>
      {line.reserved.map((r) => (
        <div key={`${r.batch}-${r.zone}`} className="mt-1 flex flex-wrap gap-x-3 text-caption text-text-secondary">
          <span className="font-mono">{r.batch}</span>
          <span>{t("picking.exp", { date: day(r.expiryDate) })}</span>
          <span>{r.zone}</span>
          <span className="tabular-nums">{t("picking.qty", { qty: formatQuantity(r.qty) })}</span>
        </div>
      ))}
    </>
  );
}

/** Terish varagʻi yangi oynada ochiladi va oʻzi chop etish oynasini chaqiradi. */
function openPickSheet(ids: number[]) {
  window.open(`/api/orders/pick-sheet/pdf?ids=${ids.join(",")}`, "_blank", "noopener");
}

function ActivePick({ item, now }: { item: QueueItem; now: Date }) {
  const tr = useTranslations("orders");
  const qc = useQueryClient();
  const id = item.id;
  const order = useOrder(id);
  const [taken, setTaken] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [other, setOther] = useState<Record<number, PickBatch>>({});
  const [choosing, setChoosing] = useState<{ id: number; name: string; qty: number } | null>(null);
  if (order.error) return <ErrorState onRetry={() => order.refetch()} />;
  if (!order.data) return <Skeleton className="h-40 w-full" />;
  const d = order.data;
  const deadline = item.deadline ? new Date(item.deadline) : null;
  const left = deadline ? clockLeft(deadline, now) : null;
  // Qator boʻyicha «Yigʻishga qaytarish»dan keyin — faqat shu qatorlar (SPEC 188)
  const lines = repickLines(d);
  const all = lines.every((l) => taken[l.id]);
  const err = describeError(error);

  async function finish() {
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.POST("/api/orders/{id}/pick/finish", {
          params: { path: { id } },
          body: { lines: Object.entries(other).map(([lineId, b]) => ({ lineId: Number(lineId), batchId: b.batchId })) },
        }),
      );
      toast({ tone: "success", title: tr("picking.finished"), description: tr("picking.finishedHint", { number: r.number }) });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["reports", "pickers", "mine"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={cn("rounded-card border bg-surface p-5", left?.over ? "border-danger" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-table font-semibold">{d.number}</div>
          <div className="mt-0.5 text-subtitle">{d.customer}</div>
          <div className="mt-1 text-table text-text-secondary">
            {tr("picking.linesQty", { lines: formatQuantity(item.lines), qty: formatQuantity(item.totalQty) })} · {deliveryText(item, tr)}
          </div>
        </div>
        <Link
          href={`/orders/${id}`}
          className="inline-flex h-control-sm items-center gap-1.5 rounded-control border border-border px-3 text-table hover:bg-background"
        >
          <Icon icon={ArrowUpRight} size="sm" />
          {tr("picking.card")}
        </Link>
      </div>
      {left ? (
        <div
          role="timer"
          aria-live="off"
          className={cn(
            "mt-4 flex flex-col items-center rounded-card px-4 py-5 text-center",
            left.over ? "bg-danger-bg text-danger" : "bg-primary-soft text-primary-button",
          )}
        >
          <span className="font-mono text-[44px] leading-[52px] font-semibold tabular-nums">{left.text}</span>
          <span className="text-table font-semibold">{left.over ? tr("picking.overT") : tr("picking.leftT")}</span>
          <span className="mt-1 text-caption text-text-secondary">
            {tr("picking.tSub", {
              n: item.pickMinutes ?? 0,
              at: item.pickStartedAt ? formatDateTime(new Date(item.pickStartedAt)).slice(-5) : "—",
            })}
          </span>
        </div>
      ) : null}
      {lines.length < d.lines.length ? (
        <Alert className="mt-3" tone="info" title={tr("picking.repickOnly", { count: lines.length })} />
      ) : null}
      <ul className="mt-4 flex flex-col">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start gap-3 border-t border-border py-3">
            <Checkbox
              aria-label={`${tr("picking.taken")}: ${l.productName}`}
              checked={Boolean(taken[l.id])}
              onChange={(v) => setTaken((m) => ({ ...m, [l.id]: v }))}
            />
            <div className="min-w-0 flex-1">
              {other[l.id] ? (
                <>
                  <PlanLine line={{ ...l, reserved: [] }} t={tr} />
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="warning" icon={TriangleAlert}>
                      {tr("picking.otherBatch", { batch: batchLabel(other[l.id]) })}
                    </Badge>
                    <Button
                      size="sm"
                      variant="tertiary"
                      icon={Undo2}
                      onClick={() =>
                        setOther((m) => {
                          const next = { ...m };
                          delete next[l.id];
                          return next;
                        })
                      }
                    >
                      {tr("picking.revert")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <PlanLine line={l} t={tr} />
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon={Replace}
                    className="mt-1"
                    onClick={() => setChoosing({ id: l.id, name: l.productName, qty: l.qty })}
                  >
                    {tr("picking.tookOther")}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-3" /> : null}
      <p className="mt-3 text-caption text-text-secondary">
        {Object.keys(other).length > 0
          ? tr("picking.confirmHintOther", { count: formatQuantity(Object.keys(other).length) })
          : tr("picking.confirmHint")}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" icon={Printer} onClick={() => openPickSheet([id])}>
          {tr("picking.printPickSheet")}
        </Button>
        <IssueButton orderId={id} />
        <Button icon={PackageCheck} disabled={!all} loading={pending} onClick={() => void finish()}>
          {tr("picking.finish")}
        </Button>
      </div>
      <OtherBatchModal
        orderId={id}
        line={choosing}
        onPick={(b) => choosing && setOther((m) => ({ ...m, [choosing.id]: b }))}
        onClose={() => setChoosing(null)}
      />
    </section>
  );
}

/** Taymer matni (prototip): qolgan «MM:SS» yoki kechikish «+MM:SS». */
export function clockLeft(deadline: Date, now: Date): { text: string; over: boolean } {
  const ms = deadline.getTime() - now.getTime();
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  const text = `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return ms < 0 ? { text: `+${text}`, over: true } : { text, over: false };
}

/** «Bugun yakunlanganlar» (prototip): har buyurtma — raqam, mijoz, berilgan va sarflangan vaqt, natija, boshlandi–yakunlandi, muammolar. */
function DoneToday({ query }: { query: UseQueryResult<components["schemas"]["PickDoneItem"][]> }) {
  const t = useTranslations("orders");
  if (query.error) return <ErrorState onRetry={() => query.refetch()} />;
  if (query.isPending) return <Skeleton className="h-16 w-full" />;
  if (query.data.length === 0) {
    return (
      <Card>
        <EmptyState icon={CheckCircle2} title={t("picking.doneTodayEmpty")} description={t("picking.doneTodayHint")} />
      </Card>
    );
  }
  const hm = (iso: string | null | undefined) => (iso ? formatDateTime(new Date(iso)).slice(-5) : "—");
  return (
    <ul className="flex flex-col gap-2">
      {query.data.map((o) => {
        const spent = o.startedAt
          ? Math.max(0, Math.round((new Date(o.finishedAt).getTime() - new Date(o.startedAt).getTime()) / 60000))
          : null;
        const diff = o.minutes != null && spent != null ? o.minutes - spent : null;
        const cells: [string, React.ReactNode, string][] = [
          [t("picking.cNo"), o.number, "font-mono font-semibold"],
          [t("picking.cCust"), o.customer, "font-medium"],
          [t("picking.cGiven"), o.minutes != null ? t("picking.minutes", { n: o.minutes }) : "—", ""],
          [t("picking.cSpent"), spent != null ? t("picking.minutes", { n: spent }) : "—", ""],
          [
            t("picking.cRes"),
            !o.onTime && diff != null
              ? t("picking.resLate", { n: -diff })
              : diff != null && diff > 0
                ? t("picking.resEarly", { n: diff })
                : t("picking.onTime"),
            cn("font-semibold", o.onTime ? "text-success" : "text-danger"),
          ],
          [t("picking.cTime"), `${hm(o.startedAt)} – ${hm(o.finishedAt)}`, "text-text-secondary"],
          ...(o.issues > 0
            ? ([[t("picking.cIssues"), t("picking.issuesN", { n: o.issues }), "font-medium text-danger"]] as [
                string,
                React.ReactNode,
                string,
              ][])
            : []),
        ];
        return (
          <li
            key={o.id}
            className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-card border border-border bg-surface px-4 py-3 md:grid-cols-4 xl:grid-cols-7"
          >
            {cells.map(([label, text, cls]) => (
              <div key={label} className="min-w-0">
                <div className="text-caption text-text-secondary">{label}</div>
                <div className={cn("truncate", cls)}>{text}</div>
              </div>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
