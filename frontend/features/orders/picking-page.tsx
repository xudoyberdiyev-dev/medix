"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Play, Printer, Replace, Timer, TriangleAlert, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { useOrder } from "./api";
import { IssueButton } from "./issues";
import { MyToday } from "./my-today";
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

/** Yigʻuvchi paneli (SPEC 5.4): navbat, mening yigʻishim (katta taymer, «Olindi» belgilari, partiya tasdigʻi). */
export function PickingPage() {
  const t = useTranslations("orders");
  const me = useMe();
  const qc = useQueryClient();
  const now = useNow();
  const allowed = can(me.data, "picking.do");
  const live = useLiveConnected();
  const queue = useQuery({
    queryKey: ["orders", "pick-queue"],
    queryFn: () => unwrap(api.GET("/api/orders/pick-queue")),
    enabled: allowed,
    refetchInterval: live ? 60_000 : 15_000,
  });
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const mine = (queue.data ?? []).find((o) => o.status === "PICKING" && o.pickerId === me.data?.id) ?? null;

  if (me.data && !allowed) return <ForbiddenState description={t("picking.forbidden")} />;

  async function start(id: number) {
    setPending(id);
    setError(null);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/orders/{id}/pick/start", { params: { path: { id } } }));
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  const err = describeError(error);
  return (
    <>
      <h1 className="mb-4 text-page-title">{t("picking.title")}</h1>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      {queue.error ? (
        <ErrorState onRetry={() => queue.refetch()} />
      ) : queue.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-[2fr_1fr] gap-6">
          <section>
            <h2 className="mb-3 text-subtitle">{t("picking.mine")}</h2>
            {mine ? (
              <ActivePick id={mine.id} deadline={mine.deadline ? new Date(mine.deadline) : null} now={now} />
            ) : (
              <Card>
                <EmptyState icon={ClipboardList} title={t("picking.emptyTitle")} description={t("picking.emptyHint")} />
              </Card>
            )}
          </section>
          <section>
            <MyToday kind="pickers" />
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-subtitle">{t("picking.queue")}</h2>
              <Button variant="secondary" size="sm" icon={Printer} disabled={selected.length === 0} onClick={() => openPickSheet(selected)}>
                {selected.length > 0 ? t("picking.printSheetCount", { count: selected.length }) : t("picking.printSheet")}
              </Button>
            </div>
            <ul className="flex flex-col gap-3">
              {(queue.data ?? []).filter((o) => o.id !== mine?.id).length === 0 ? (
                <li className="text-text-secondary">{t("picking.queueEmpty")}</li>
              ) : null}
              {(queue.data ?? [])
                .filter((o) => o.id !== mine?.id)
                .map((o) => (
                  <li key={o.id} className="rounded-card border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Checkbox
                          aria-label={t("picking.toSheet", { number: o.number })}
                          checked={selected.includes(o.id)}
                          onChange={(v) => setSelected((ids) => (v ? [...ids, o.id] : ids.filter((x) => x !== o.id)))}
                        />
                        <span className="font-mono">{o.number}</span>
                      </span>
                      {o.marked ? <Badge tone="info">{t("picking.marking")}</Badge> : null}
                    </div>
                    <div className="mt-1">{o.customer}</div>
                    <div className="mt-1 text-caption text-text-secondary">
                      {t("picking.meta", {
                        lines: formatQuantity(o.lines),
                        qty: formatQuantity(o.totalQty),
                        minutes: o.pickMinutes ?? "—",
                      })}
                    </div>
                    <div className="mt-2">
                      {o.status === "PICKING" ? (
                        <Badge tone="warning">{t("picking.busy", { name: o.picker ?? "" })}</Badge>
                      ) : (
                        <Button size="sm" icon={Play} disabled={Boolean(mine)} loading={pending === o.id} onClick={() => void start(o.id)}>
                          {t("picking.start")}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
            <DoneToday enabled={allowed} />
          </section>
        </div>
      )}
    </>
  );
}

/** Terish varagʻi yangi oynada ochiladi va oʻzi chop etish oynasini chaqiradi. */
function openPickSheet(ids: number[]) {
  window.open(`/api/orders/pick-sheet/pdf?ids=${ids.join(",")}`, "_blank", "noopener");
}

function ActivePick({ id, deadline, now }: { id: number; deadline: Date | null; now: Date }) {
  const tr = useTranslations("orders");
  const qc = useQueryClient();
  const order = useOrder(id);
  const [taken, setTaken] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [other, setOther] = useState<Record<number, PickBatch>>({});
  const [choosing, setChoosing] = useState<{ id: number; name: string; qty: number } | null>(null);
  if (order.error) return <ErrorState onRetry={() => order.refetch()} />;
  if (!order.data) return <Skeleton className="h-40 w-full" />;
  const d = order.data;
  const t = deadline ? timerText(deadline, now, tr) : null;
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
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-subtitle">{d.number}</div>
          <div>{d.customer}</div>
        </div>
        {t ? (
          <div className={`flex items-center gap-2 text-page-title tabular-nums ${t.late ? "text-danger" : ""}`} role="timer">
            <Timer size={24} strokeWidth={1.5} aria-hidden />
            {t.text}
          </div>
        ) : null}
      </div>
      {lines.length < d.lines.length ? (
        <Alert className="mt-3" tone="info" title={tr("picking.repickOnly", { count: lines.length })} />
      ) : null}
      <ul className="mt-4 flex flex-col">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start gap-3 border-t border-border py-3">
            <Checkbox label={tr("picking.taken")} checked={Boolean(taken[l.id])} onChange={(v) => setTaken((m) => ({ ...m, [l.id]: v }))} />
            <div className="flex-1">
              <div>
                <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
              </div>
              {other[l.id] ? (
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
              ) : (
                <div className="text-caption text-text-secondary">
                  {l.reserved
                    .map((r) =>
                      tr("picking.reservedRow", { batch: r.batch, date: day(r.expiryDate), zone: r.zone, qty: formatQuantity(r.qty) }),
                    )
                    .join("; ")}
                </div>
              )}
              {!other[l.id] ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  icon={Replace}
                  className="mt-1"
                  onClick={() => setChoosing({ id: l.id, name: l.productName, qty: l.qty })}
                >
                  {tr("picking.tookOther")}
                </Button>
              ) : null}
            </div>
            <div className="text-subtitle tabular-nums">{formatQuantity(l.qty)}</div>
          </li>
        ))}
      </ul>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-3" /> : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-caption text-text-secondary">
          {Object.keys(other).length > 0
            ? tr("picking.confirmHintOther", { count: formatQuantity(Object.keys(other).length) })
            : tr("picking.confirmHint")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <IssueButton orderId={id} />
          <Button variant="secondary" icon={Printer} onClick={() => openPickSheet([id])}>
            {tr("picking.printPickSheet")}
          </Button>
          <Button icon={CheckCircle2} disabled={!all} loading={pending} onClick={() => void finish()}>
            {tr("picking.finish")}
          </Button>
        </div>
      </div>
      <OtherBatchModal
        orderId={id}
        line={choosing}
        onPick={(b) => choosing && setOther((m) => ({ ...m, [choosing.id]: b }))}
        onClose={() => setChoosing(null)}
      />
    </Card>
  );
}

/** «Bugun yakunlanganlar» (SPEC 5.4): oʻzi bugun yigʻgan buyurtmalar — vaqt va vaqtida / kechikkan belgisi. */
function DoneToday({ enabled }: { enabled: boolean }) {
  const t = useTranslations("orders");
  const done = useQuery({
    queryKey: ["orders", "pick-done-today"],
    queryFn: () => unwrap(api.GET("/api/orders/pick-done-today")),
    enabled,
  });
  return (
    <div className="mt-6">
      <h2 className="mb-3 text-subtitle">{t("picking.doneToday")}</h2>
      {done.error ? (
        <ErrorState onRetry={() => done.refetch()} />
      ) : done.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : done.data.length === 0 ? (
        <p className="text-text-secondary">{t("picking.doneTodayEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {done.data.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 rounded-card border border-border p-3">
              <span className="min-w-0">
                <span className="font-mono">{o.number}</span>
                <span className="ml-2 text-text-secondary">{o.customer}</span>
                <span className="block text-caption text-text-secondary">
                  {t("picking.doneTodayMeta", {
                    lines: formatQuantity(o.lines),
                    qty: formatQuantity(o.totalQty),
                    time: formatDateTime(new Date(o.finishedAt)).slice(-5),
                  })}
                </span>
              </span>
              {o.onTime ? (
                <Badge tone="success" icon={CheckCircle2}>
                  {t("picking.onTime")}
                </Badge>
              ) : (
                <Badge tone="warning" icon={Timer}>
                  {t("picking.late")}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
