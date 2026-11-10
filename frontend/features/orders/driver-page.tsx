"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Calendar,
  Camera,
  CircleCheck,
  CircleX,
  Flag,
  History,
  PackageCheck,
  PackageMinus,
  Phone,
  Signature,
  Truck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { useBranches } from "@/features/employees/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { partialTotals } from "./partial";
import { SignatureModal } from "./signature-modal";
import { TRIP_STATUS } from "./shipments-model";

export type TripDetail = components["schemas"]["TripDetail"];

/** Haydovchi paneli → Reysim (SPEC 5.4): yuklash («Qabul qildim» joylar soni bilan) → «Yuklab boʻlindi — reysni boshlash». */
export function DriverPage() {
  const tr = useTranslations("orders");
  const me = useMe();
  const branches = useBranches();
  const qc = useQueryClient();
  const allowed = can(me.data, "trip.driver");
  const trip = useQuery({
    queryKey: ["trips", "mine"],
    queryFn: async (): Promise<TripDetail | null> => {
      const r = await api.GET("/api/trips/mine");
      if (r.response.status === 204) return null;
      return unwrap(Promise.resolve(r));
    },
    enabled: allowed,
  });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<"trip" | "history">("trip");

  if (me.data && !allowed) return <ForbiddenState description={tr("driver.forbidden")} />;

  async function load(t: TripDetail, stopId: number, places: number) {
    setPending(`load-${stopId}`);
    setError(null);
    try {
      await ensureCsrf();
      const d = await unwrap(
        api.POST("/api/trips/{id}/stops/{stopId}/load", {
          params: { path: { id: t.id, stopId } },
          body: { places },
        }),
      );
      qc.setQueryData(["trips", "mine"], d);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setPending(null);
    }
  }

  async function start(t: TripDetail) {
    setPending("start");
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/trips/{id}/start", { params: { path: { id: t.id } } }));
      toast({ tone: "success", title: tr("driver.started"), description: tr("driver.startedHint", { count: r.sales.length }) });
      await qc.invalidateQueries({ queryKey: ["trips", "mine"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  const err = describeError(error);
  const branchName = branches.data?.find((b) => b.id === me.data?.branchId)?.name;
  return (
    <div className="mx-auto w-full max-w-[680px]">
      <h1 className="text-page-title">{tr("driver.panelTitle")}</h1>
      {me.data ? <p className="mt-1 text-table text-text-secondary">{[me.data.fullName, branchName].filter(Boolean).join(" · ")}</p> : null}
      {/* Prototip: ikki teng segmentli yorliq */}
      <div role="tablist" aria-label={tr("driver.panelTitle")} className="mt-4 mb-4 grid grid-cols-2 gap-1 rounded-card bg-border/60 p-1">
        {(
          [
            ["trip", tr("driver.tabTrip")],
            ["history", tr("driver.tabHistory")],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "h-control-lg rounded-control text-body font-semibold transition-colors",
              tab === k ? "bg-surface text-primary-button shadow-sm" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      {tab === "history" ? (
        <TripHistory />
      ) : trip.error ? (
        <ErrorState onRetry={() => trip.refetch()} />
      ) : trip.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !trip.data ? (
        <Card>
          <EmptyState icon={Truck} title={tr("driver.emptyTitle")} description={tr("driver.emptyHint")} />
        </Card>
      ) : (
        <TripView
          t={trip.data}
          pending={pending}
          onLoad={(stopId, places) => load(trip.data as TripDetail, stopId, places)}
          onStart={() => void start(trip.data as TripDetail)}
        />
      )}
    </div>
  );
}

/** «Yakunlangan reyslar» (SPEC 5.4): haydovchining yakunlangan va bekor qilingan reyslari, oxirgi 100 ta. */
function TripHistory() {
  const tr = useTranslations("orders");
  const trips = useQuery({
    queryKey: ["trips", "mine", "history"],
    queryFn: () => unwrap(api.GET("/api/trips/mine/history")),
  });
  if (trips.error) return <ErrorState onRetry={() => trips.refetch()} />;
  if (trips.isPending) return <Skeleton className="h-24 w-full" />;
  if (trips.data.length === 0)
    return (
      <Card>
        <EmptyState icon={History} title={tr("driver.historyEmpty")} description={tr("driver.historyEmptyHint")} />
      </Card>
    );
  return (
    <ul className="flex flex-col gap-2">
      {trips.data.map((t) => {
        const st = TRIP_STATUS[t.status];
        return (
          <li key={t.id} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{t.number}</span>
              <Badge tone={st.tone} icon={st.icon}>
                {tr(`shipments.tripStatus.${t.status}`)}
              </Badge>
            </div>
            <div className="text-caption text-text-secondary">
              {tr("driver.historyMeta", {
                date: formatIsoDate(t.tripDate),
                vehicle: t.vehicle,
                orders: formatQuantity(t.orders),
                places: formatQuantity(t.places),
                amount: formatMoney(t.total),
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Prototip DriverPanel: reys kartasi → bekat kartalari → pastda yopishqoq asosiy tugma. */
function TripView(props: {
  t: TripDetail;
  pending: string | null;
  onLoad: (stopId: number, places: number) => Promise<boolean>;
  onStart: () => void;
}) {
  const tr = useTranslations("orders");
  const qc = useQueryClient();
  const { t } = props;
  const st = TRIP_STATUS[t.status];
  const planned = t.status === "PLANNED";
  const transit = t.status === "IN_TRANSIT";
  const loadedN = t.stops.filter((s) => s.loadedAt).length;
  const resN = t.stops.filter((s) => s.outcome).length;
  const cashHeld = sumMoney(t.stops.map((s) => s.cashCollected));
  const [loadForm, setLoadForm] = useState<{ stopId: number; cnt: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [undeliver, setUndeliver] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [partial, setPartial] = useState<TripStop | null>(null);
  const [deliverStop, setDeliverStop] = useState<TripStop | null>(null);
  const [cash, setCash] = useState("");
  const [signing, setSigning] = useState<TripStop | null>(null);

  async function run(key: string, fn: () => Promise<TripDetail | void>) {
    setPending(key);
    setError(null);
    try {
      await ensureCsrf();
      const d = await fn();
      if (d) qc.setQueryData(["trips", "mine"], d);
      else await qc.invalidateQueries({ queryKey: ["trips", "mine"] });
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setPending(null);
    }
  }

  const photo = (stopId: number, file: Blob, signature = false) =>
    run(signature ? `sign-${stopId}` : `photo-${stopId}`, async () => {
      await unwrap(
        api.POST("/api/trips/{id}/stops/{stopId}/photos", {
          params: { path: { id: t.id, stopId }, query: { signature } },
          body: { file: file as unknown as string },
          bodySerializer: () => {
            const fd = new FormData();
            fd.append("file", file, signature ? "imzo.png" : file instanceof File ? file.name : "rasm");
            return fd;
          },
        }),
      );
    });

  const deliver = async (stopId: number, amount?: string) => {
    const ok = await run(`deliver-${stopId}`, () =>
      unwrap(
        api.POST("/api/trips/{id}/stops/{stopId}/deliver", {
          params: { path: { id: t.id, stopId } },
          body: { cash: amount?.trim() || undefined },
        }),
      ),
    );
    if (ok) {
      setDeliverStop(null);
      setCash("");
    }
  };

  async function confirmUndeliver() {
    if (undeliver === null) return;
    const ok = await run(`undeliver-${undeliver}`, () =>
      unwrap(
        api.POST("/api/trips/{id}/stops/{stopId}/undeliver", {
          params: { path: { id: t.id, stopId: undeliver } },
          body: { reason: reason.trim() },
        }),
      ),
    );
    if (ok) {
      setUndeliver(null);
      setReason("");
    }
  }

  const finish = () =>
    run("finish", async () => {
      const r = await unwrap(api.POST("/api/trips/{id}/finish", { params: { path: { id: t.id } } }));
      toast({
        tone: "success",
        title: tr("driver.finished"),
        description: r.status === "DONE" ? tr("driver.allDelivered") : tr("driver.handOver"),
      });
    });

  function pickResult(s: TripStop, kind: "ok" | "part" | "fail") {
    if (kind !== "fail" && s.photos === 0) {
      toast({ tone: "danger", title: tr("driver.photoNeeded"), description: tr("driver.photoRequired") });
      return;
    }
    if (kind === "fail") setUndeliver(s.id);
    else if (kind === "part") setPartial(s);
    else if (s.paymentType === "CASH") {
      setCash("");
      setDeliverStop(s);
    } else void deliver(s.id);
  }

  const err = describeError(error);
  const info = planned ? tr("driver.infoLoad") : t.status === "RETURN_WAIT" ? tr("driver.infoWait") : null;
  const allLoaded = loadedN === t.stops.length;
  const allRes = resN === t.stops.length;
  return (
    <div className="flex flex-col gap-3.5">
      <section className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-body font-semibold">{t.number}</span>
          <Badge tone={st.tone} icon={st.icon}>
            {tr(`shipments.tripStatus.${t.status}`)}
          </Badge>
        </div>
        <span className="flex items-center gap-1.5 text-text-secondary">
          <Truck size={16} strokeWidth={1.5} aria-hidden />
          {t.vehicle}
        </span>
        <span className="flex items-center gap-1.5 text-text-secondary">
          <Calendar size={16} strokeWidth={1.5} aria-hidden />
          {tr("driver.tripStops", { date: formatIsoDate(t.tripDate), n: t.stops.length })}
        </span>
        {cashHeld > 0n ? (
          <span className="flex items-center gap-1.5 font-semibold text-warning">
            <Banknote size={16} strokeWidth={1.5} aria-hidden />
            {tr("driver.cashHeld", { amount: formatMoney(fromTiyin(cashHeld)) })}
          </span>
        ) : null}
      </section>
      {info ? <Alert tone="info" title={info} /> : null}
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      {t.stops.map((s) => {
        const res = s.outcome ? RESULT[s.outcome as keyof typeof RESULT] : null;
        const lf = loadForm?.stopId === s.id ? loadForm : null;
        const cnt = lf && lf.cnt !== "" ? Number(lf.cnt) : null;
        const diff = cnt !== null && cnt !== s.places;
        const mark = res ? res.mark : planned && s.loadedAt ? "border-l-success" : "border-l-border";
        return (
          <article
            key={s.id}
            aria-label={`${s.seq}. ${s.customer}`}
            className={cn("flex min-w-0 flex-col gap-2.5 rounded-card border border-l-4 border-border bg-surface px-4 py-3.5", mark)}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  "flex size-7 flex-none items-center justify-center rounded-full text-caption font-bold",
                  res ? res.num : "bg-background text-text-primary",
                )}
              >
                {s.seq}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-subtitle font-semibold text-pretty">{s.customer}</span>
                <span className="text-text-secondary text-pretty">{s.address ?? tr("driver.noAddress")}</span>
              </div>
              {res ? (
                <Badge tone={res.tone} icon={res.icon}>
                  {tr(res.label)}
                </Badge>
              ) : null}
            </div>
            {s.phone ? (
              <a
                href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}
                className="inline-flex min-h-12 items-center gap-2 self-start rounded-control border border-border px-3.5 font-semibold text-primary-button"
              >
                <Phone size={18} strokeWidth={1.5} aria-hidden />
                {s.phone}
              </a>
            ) : null}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-caption">
              <Cell label={tr("driver.order")}>
                <span className="font-mono">{s.orderNumber}</span>
              </Cell>
              <Cell label={tr("driver.waybill")}>
                <span className="font-mono">{s.waybillNumber ?? "—"}</span>
              </Cell>
              <Cell label={tr("driver.placesLabel")} big>
                {tr("driver.placesN", { n: formatQuantity(s.places) })}
              </Cell>
              <Cell label={tr("driver.sum")} big>
                {formatMoney(s.total)}
              </Cell>
              <Cell label={tr("driver.pay")}>{tr(`paymentType.${s.paymentType as "CASH" | "TRANSFER" | "ONLINE"}`)}</Cell>
              {s.paymentType === "CASH" ? (
                <Cell label={tr("driver.collect")} big warn>
                  {formatMoney(s.outcome ? (s.cashCollected ?? "0") : s.total)}
                </Cell>
              ) : null}
            </dl>
            {s.outcome ? (
              <span className="text-caption text-text-secondary text-pretty">
                {[
                  s.outcome === "UNDELIVERED" && s.outcomeReason ? s.outcomeReason : null,
                  s.outcome === "PARTIAL" && s.returnTotal
                    ? tr("driver.retInfo", { amount: formatMoney(s.returnTotal), number: s.returnNumber ?? "" })
                    : null,
                  s.cashCollected ? tr("driver.cashGot", { amount: formatMoney(s.cashCollected) }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}

            {planned && !s.loadedAt && !lf ? (
              <Button size="lg" icon={PackageCheck} onClick={() => setLoadForm({ stopId: s.id, cnt: "" })}>
                {tr("driver.accept")}
              </Button>
            ) : null}
            {lf ? (
              <div className="flex flex-col gap-2 rounded-card bg-background p-3">
                <TextField
                  label={tr("driver.countPlaces")}
                  value={lf.cnt}
                  onChange={(v) => setLoadForm({ stopId: s.id, cnt: v.replace(/\D/g, "").slice(0, 4) })}
                  inputMode="numeric"
                  autoFocus
                  error={diff ? tr("driver.loadDiff", { c: cnt ?? 0, e: s.places }) : undefined}
                />
                {diff ? <span className="text-caption text-text-secondary">{tr("driver.loadDiffHint")}</span> : null}
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Button
                    size="lg"
                    icon={PackageCheck}
                    disabled={cnt === null || diff}
                    loading={props.pending === `load-${s.id}`}
                    onClick={() =>
                      void props.onLoad(s.id, cnt ?? 0).then((ok) => {
                        if (ok) setLoadForm(null);
                      })
                    }
                  >
                    {tr("driver.accept")}
                  </Button>
                  <Button size="lg" variant="secondary" onClick={() => setLoadForm(null)}>
                    {tr("driver.cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
            {planned && s.loadedAt ? (
              <span className="flex items-center gap-1.5 font-semibold text-success">
                <CircleCheck size={16} strokeWidth={1.5} aria-hidden />
                {tr("driver.loadedOk", { c: formatQuantity(s.places) })}
              </span>
            ) : null}

            {transit && !s.outcome ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-control border border-border bg-surface px-3.5 font-semibold text-primary-button">
                    <Camera size={18} strokeWidth={1.5} aria-hidden />
                    {s.photos > 0 ? tr("driver.photos", { count: s.photos }) : tr("driver.takePhoto")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="sr-only"
                      aria-label={tr("driver.photoAria", { customer: s.customer })}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void photo(s.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button size="lg" variant="secondary" icon={Signature} onClick={() => setSigning(s)}>
                    {s.signed ? tr("driver.signed") : tr("driver.sign")}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["ok", RESULT.DELIVERED],
                      ["part", RESULT.PARTIAL],
                      ["fail", RESULT.UNDELIVERED],
                    ] as const
                  ).map(([k, r]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => pickResult(s, k)}
                      disabled={pending === `deliver-${s.id}`}
                      className={cn(
                        "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-card border p-1 text-caption font-semibold",
                        r.button,
                      )}
                    >
                      <r.icon size={18} strokeWidth={1.5} aria-hidden />
                      {tr(r.label)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </article>
        );
      })}
      {planned || transit ? (
        <div className="sticky bottom-0 z-[5] -mx-1 flex flex-col gap-1.5 border-t border-border bg-background px-1 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))]">
          <span className="text-center text-caption text-text-secondary">
            {planned ? tr("driver.loadedN", { a: loadedN, b: t.stops.length }) : tr("driver.resN", { a: resN, b: t.stops.length })}
          </span>
          {planned ? (
            <Button size="lg" icon={Truck} disabled={!allLoaded} loading={props.pending === "start"} onClick={props.onStart}>
              {tr("driver.startTrip")}
            </Button>
          ) : (
            <Button size="lg" icon={Flag} disabled={!allRes} loading={pending === "finish"} onClick={() => void finish()}>
              {tr("driver.finishTrip")}
            </Button>
          )}
        </div>
      ) : null}
      {signing ? (
        <SignatureModal
          key={signing.id}
          open
          customer={signing.customer}
          saving={pending === `sign-${signing.id}`}
          onClose={() => setSigning(null)}
          onSave={(png) => {
            if (!signing) return;
            void photo(signing.id, png, true).then((ok) => {
              if (ok) {
                setSigning(null);
                toast({ tone: "success", title: tr("driver.signSaved") });
              }
            });
          }}
        />
      ) : null}
      <Modal
        open={deliverStop !== null}
        onClose={() => setDeliverStop(null)}
        title={tr("driver.deliverTitle", { customer: deliverStop?.customer ?? "" })}
        primaryAction={{
          label: tr("driver.markDelivered"),
          onClick: () => deliverStop && void deliver(deliverStop.id, cash),
          loading: pending?.startsWith("deliver") ?? false,
        }}
      >
        <div className="flex flex-col gap-3 rounded-card bg-warning-bg p-3">
          <span className="text-warning">{tr("driver.cashExp", { amount: formatMoney(deliverStop?.total ?? "0") })}</span>
          <TextField label={tr("driver.cashReceived")} variant="amount" value={cash} onChange={setCash} autoFocus />
        </div>
      </Modal>
      <Modal
        open={undeliver !== null}
        onClose={() => setUndeliver(null)}
        title={tr("driver.undelivered")}
        tone="danger"
        primaryAction={{
          label: tr("driver.markUndelivered"),
          onClick: () => void confirmUndeliver(),
          loading: pending?.startsWith("undeliver") ?? false,
          disabled: !reason.trim(),
        }}
      >
        <p className="mb-3">{tr("driver.undeliveredText")}</p>
        <TextField label={tr("driver.reason")} value={reason} onChange={setReason} maxLength={300} />
      </Modal>
      {partial ? (
        <PartialDialog
          tripId={t.id}
          stop={partial}
          onClose={() => setPartial(null)}
          onDone={(d) => {
            qc.setQueryData(["trips", "mine"], d);
            setPartial(null);
          }}
        />
      ) : null}
    </div>
  );
}

const RESULT = {
  DELIVERED: {
    label: "driver.delivered",
    tone: "success",
    icon: CircleCheck,
    mark: "border-l-success",
    num: "bg-success-bg text-success",
    button: "border-success/30 bg-success-bg text-success",
  },
  PARTIAL: {
    label: "driver.partial",
    tone: "warning",
    icon: PackageMinus,
    mark: "border-l-warning",
    num: "bg-warning-bg text-warning",
    button: "border-warning/30 bg-warning-bg text-warning",
  },
  UNDELIVERED: {
    label: "driver.undelivered",
    tone: "danger",
    icon: CircleX,
    mark: "border-l-danger",
    num: "bg-danger-bg text-danger",
    button: "border-danger/30 bg-danger-bg text-danger",
  },
} as const;

function Cell(props: { label: string; children: React.ReactNode; big?: boolean; warn?: boolean }) {
  return (
    <div className={props.warn ? "text-warning" : "text-text-secondary"}>
      <dt>{props.label}</dt>
      <dd className={cn("font-semibold", props.warn ? "" : "text-text-primary", props.big && "text-body")}>{props.children}</dd>
    </div>
  );
}

/** Pul satrlarini («25000.00») tiyinda BigInt bilan qoʻshadi — float ishlatilmaydi. */
function sumMoney(values: (string | null | undefined)[]): bigint {
  let total = 0n;
  for (const v of values) {
    if (!v) continue;
    const neg = v.startsWith("-");
    const [i = "0", f = ""] = v.replace("-", "").split(".");
    const t = BigInt(i) * 100n + BigInt((f + "00").slice(0, 2));
    total += neg ? -t : t;
  }
  return total;
}

function fromTiyin(t: bigint): string {
  const neg = t < 0n;
  const a = neg ? -t : t;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

type TripStop = TripDetail["stops"][number];

function PartialDialog(props: { tripId: number; stop: TripStop; onClose: () => void; onDone: (d: TripDetail) => void }) {
  const tr = useTranslations("orders");
  const { stop } = props;
  const lines = useQuery({
    queryKey: ["trips", props.tripId, "stops", stop.id, "lines"],
    queryFn: () => unwrap(api.GET("/api/trips/{id}/stops/{stopId}/lines", { params: { path: { id: props.tripId, stopId: stop.id } } })),
  });
  const [back, setBack] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [cash, setCash] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sum = partialTotals(lines.data ?? [], back, stop.total);
  const err = describeError(error);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const d = await unwrap(
        api.POST("/api/trips/{id}/stops/{stopId}/partial", {
          params: { path: { id: props.tripId, stopId: stop.id } },
          body: {
            reason: reason.trim(),
            lines: (lines.data ?? []).map((l) => ({ saleLineId: l.id, qty: Number(back[l.id] || "0") })),
            cash: cash.trim() || undefined,
          },
        }),
      );
      toast({
        tone: "success",
        title: tr("driver.partialDone"),
        description: tr("driver.partialDoneHint", { amount: formatMoney(sum.returned) }),
      });
      props.onDone(d);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const blocked = sum.invalid || sum.units === 0 || sum.all || !reason.trim();
  return (
    <Modal
      open
      onClose={props.onClose}
      title={tr("driver.partialTitle", { customer: stop.customer })}
      size="lg"
      primaryAction={{ label: tr("driver.markPartial"), onClick: () => void submit(), loading: pending, disabled: blocked }}
    >
      {err.message ? <Alert tone="danger" title={err.message} className="mb-3" /> : null}
      <p className="mb-3 text-text-secondary">{tr("driver.partialIntro")}</p>
      {lines.error ? (
        <ErrorState onRetry={() => lines.refetch()} />
      ) : lines.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="mb-3 flex flex-col">
          {lines.data.map((l) => (
            <li key={l.id} className="flex flex-wrap items-end justify-between gap-2 border-t border-border py-2">
              <div className="min-w-0">
                <div>{l.product}</div>
                <div className="text-caption text-text-secondary">
                  {tr("driver.batch")} <span className="font-mono">{l.batch}</span> ·{" "}
                  {tr("driver.qtyPrice", { qty: formatQuantity(l.qty), price: formatMoney(l.price) })}
                  {l.marked ? tr("driver.marked") : ""}
                </div>
              </div>
              <div className="w-28">
                <TextField
                  label={tr("driver.returnedField")}
                  value={back[l.id] ?? ""}
                  onChange={(v) => setBack((m) => ({ ...m, [l.id]: v.replace(/\D/g, "") }))}
                  inputMode="numeric"
                  error={Number(back[l.id] || "0") > l.qty ? tr("driver.maxQty", { qty: formatQuantity(l.qty) }) : undefined}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-3 text-caption">
        {tr("driver.returnedSum")} <span className="font-mono">{formatMoney(sum.returned)}</span> {tr("currency")} ·{" "}
        {tr("driver.customerPays")} <span className="font-mono">{formatMoney(sum.net)}</span> {tr("currency")}
      </div>
      {sum.all ? (
        <Alert tone="warning" title={tr("driver.allBack")} className="mb-3">
          {tr("driver.allBackHint")}
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3">
        <TextField label={tr("driver.reason")} value={reason} onChange={setReason} maxLength={300} />
        {stop.paymentType === "CASH" ? (
          <TextField label={tr("driver.cashReceived")} variant="amount" value={cash} onChange={setCash} />
        ) : null}
      </div>
    </Modal>
  );
}
