"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Play, Printer, Replace, Timer, TriangleAlert, Undo2 } from "lucide-react";
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
import { formatQuantity } from "@/lib/format";
import { useOrder } from "./api";
import { IssueButton } from "./issues";
import { MyToday } from "./my-today";
import { batchLabel, OtherBatchModal, type PickBatch } from "./other-batch-modal";
import { day } from "./orders-page";

/** Qolgan vaqt: musbat — «12:05», manfiy — «Kechikdi: N daqiqa» (SPEC 5.2). */
export function timerText(deadline: Date, now: Date): { text: string; late: boolean } {
  const ms = deadline.getTime() - now.getTime();
  if (ms < 0) return { text: `Kechikdi: ${Math.ceil(-ms / 60000)} daqiqa`, late: true };
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
  const me = useMe();
  const qc = useQueryClient();
  const now = useNow();
  const allowed = can(me.data, "picking.do");
  const queue = useQuery({
    queryKey: ["orders", "pick-queue"],
    queryFn: () => unwrap(api.GET("/api/orders/pick-queue")),
    enabled: allowed,
    refetchInterval: 15_000,
  });
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const mine = (queue.data ?? []).find((o) => o.status === "PICKING" && o.pickerId === me.data?.id) ?? null;

  if (me.data && !allowed) return <ForbiddenState description="Yigʻish paneli faqat yigʻuvchilar uchun." />;

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
      <h1 className="mb-4 text-page-title">Yigʻish</h1>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      {queue.error ? (
        <ErrorState onRetry={() => queue.refetch()} />
      ) : queue.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-[2fr_1fr] gap-6">
          <section>
            <h2 className="mb-3 text-subtitle">Mening yigʻishim</h2>
            {mine ? (
              <ActivePick id={mine.id} deadline={mine.deadline ? new Date(mine.deadline) : null} now={now} />
            ) : (
              <Card>
                <EmptyState
                  icon={ClipboardList}
                  title="Faol yigʻish yoʻq"
                  description="Navbatdan buyurtma tanlab, «Yigʻishni boshlash»ni bosing."
                />
              </Card>
            )}
          </section>
          <section>
            <MyToday kind="pickers" />
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-subtitle">Navbat</h2>
              <Button variant="secondary" size="sm" icon={Printer} disabled={selected.length === 0} onClick={() => openPickSheet(selected)}>
                Varaqni chop etish{selected.length > 0 ? ` (${selected.length})` : ""}
              </Button>
            </div>
            <ul className="flex flex-col gap-3">
              {(queue.data ?? []).filter((o) => o.id !== mine?.id).length === 0 ? (
                <li className="text-text-secondary">Navbat boʻsh.</li>
              ) : null}
              {(queue.data ?? [])
                .filter((o) => o.id !== mine?.id)
                .map((o) => (
                  <li key={o.id} className="rounded-card border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Checkbox
                          aria-label={`${o.number} — terish varagʻiga`}
                          checked={selected.includes(o.id)}
                          onChange={(v) => setSelected((ids) => (v ? [...ids, o.id] : ids.filter((x) => x !== o.id)))}
                        />
                        <span className="font-mono">{o.number}</span>
                      </span>
                      {o.marked ? <Badge tone="info">Markirovka</Badge> : null}
                    </div>
                    <div className="mt-1">{o.customer}</div>
                    <div className="mt-1 text-caption text-text-secondary">
                      {formatQuantity(o.lines)} xil · {formatQuantity(o.totalQty)} dona · vaqt {o.pickMinutes ?? "—"} daqiqa
                    </div>
                    <div className="mt-2">
                      {o.status === "PICKING" ? (
                        <Badge tone="warning">Band: {o.picker}</Badge>
                      ) : (
                        <Button size="sm" icon={Play} disabled={Boolean(mine)} loading={pending === o.id} onClick={() => void start(o.id)}>
                          Yigʻishni boshlash
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
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
  const t = deadline ? timerText(deadline, now) : null;
  const all = d.lines.every((l) => taken[l.id]);
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
      toast({ tone: "success", title: "Yigʻish yakunlandi", description: `${r.number} · tovar Joʻnatish zonasida` });
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
      <ul className="mt-4 flex flex-col">
        {d.lines.map((l) => (
          <li key={l.id} className="flex items-start gap-3 border-t border-border py-3">
            <Checkbox label="Olindi" checked={Boolean(taken[l.id])} onChange={(v) => setTaken((m) => ({ ...m, [l.id]: v }))} />
            <div className="flex-1">
              <div>
                <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
              </div>
              {other[l.id] ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="warning" icon={TriangleAlert}>
                    Boshqa partiya: {batchLabel(other[l.id])}
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
                    Koʻrsatilganiga qaytarish
                  </Button>
                </div>
              ) : (
                <div className="text-caption text-text-secondary">
                  {l.reserved.map((r) => `${r.batch} · ${day(r.expiryDate)} · ${r.zone} — ${formatQuantity(r.qty)} dona`).join("; ")}
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
                  Boshqa partiyadan oldim
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
          Partiya tasdigʻi: «Ha, shundan oldim» — koʻrsatilgan partiyalardan
          {Object.keys(other).length > 0 ? `; ${formatQuantity(Object.keys(other).length)} qator — boshqa partiyadan` : ""}.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <IssueButton orderId={id} />
          <Button variant="secondary" icon={Printer} onClick={() => openPickSheet([id])}>
            Terish varagʻini chop etish
          </Button>
          <Button icon={CheckCircle2} disabled={!all} loading={pending} onClick={() => void finish()}>
            Yigʻishni yakunlash
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
