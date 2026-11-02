"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CircleCheck, CircleX, Flag, PackageCheck, PackageMinus, Truck } from "lucide-react";
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
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney, formatQuantity } from "@/lib/format";
import { partialTotals } from "./partial";
import { TRIP_STATUS } from "./shipments-page";

export type TripDetail = components["schemas"]["TripDetail"];

/** Haydovchi paneli → Reysim (SPEC 5.4): yuklash («Qabul qildim» joylar soni bilan) → «Yuklab boʻlindi — reysni boshlash». */
export function DriverPage() {
  const me = useMe();
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
  const [places, setPlaces] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (me.data && !allowed) return <ForbiddenState description="Reys paneli faqat haydovchilar uchun." />;

  async function load(t: TripDetail, stopId: number) {
    setPending(`load-${stopId}`);
    setError(null);
    try {
      await ensureCsrf();
      const d = await unwrap(
        api.POST("/api/trips/{id}/stops/{stopId}/load", {
          params: { path: { id: t.id, stopId } },
          body: { places: Number(places[stopId] ?? "0") },
        }),
      );
      qc.setQueryData(["trips", "mine"], d);
    } catch (e) {
      setError(e);
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
      toast({ tone: "success", title: "Reys boshlandi", description: `${r.sales.length} ta sotuv va hisob-faktura yozildi` });
      await qc.invalidateQueries({ queryKey: ["trips", "mine"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  const err = describeError(error);
  return (
    <>
      <h1 className="mb-4 text-page-title">Reysim</h1>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      {trip.error ? (
        <ErrorState onRetry={() => trip.refetch()} />
      ) : trip.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !trip.data ? (
        <Card>
          <EmptyState icon={Truck} title="Faol reys yoʻq" description="Ombor mudiri reys tuzganda shu yerda paydo boʻladi." />
        </Card>
      ) : (
        <TripView
          t={trip.data}
          places={places}
          setPlaces={(id, v) => setPlaces((m) => ({ ...m, [id]: v }))}
          pending={pending}
          onLoad={(stopId) => void load(trip.data as TripDetail, stopId)}
          onStart={() => void start(trip.data as TripDetail)}
        />
      )}
    </>
  );
}

function TripView(props: {
  t: TripDetail;
  places: Record<number, string>;
  setPlaces: (id: number, v: string) => void;
  pending: string | null;
  onLoad: (stopId: number) => void;
  onStart: () => void;
}) {
  const { t } = props;
  const st = TRIP_STATUS[t.status];
  const planned = t.status === "PLANNED";
  const left = t.stops.filter((s) => !s.loadedAt).length;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-subtitle">{t.number}</span>
            <Badge tone={st.tone} icon={st.icon}>
              {st.label}
            </Badge>
          </div>
          <div className="text-caption text-text-secondary">
            {formatIsoDate(t.tripDate)} · {t.vehicle} · {formatQuantity(t.places)} joy · {formatMoney(t.total)} soʻm
          </div>
        </div>
      </div>
      <ul className="mt-4 flex flex-col">
        {t.stops.map((s) => (
          <li key={s.id} className="border-t border-border py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div>
                  {s.seq}. {s.customer}
                </div>
                <div className="text-caption text-text-secondary">
                  {s.address ?? "Manzil koʻrsatilmagan"} · <span className="font-mono">{s.waybillNumber ?? s.orderNumber}</span>
                </div>
                <div className="text-caption text-text-secondary">
                  {formatQuantity(s.places)} joy · {formatMoney(s.total)} soʻm
                </div>
              </div>
              {s.outcome === "DELIVERED" ? (
                <Badge tone="success" icon={CircleCheck}>
                  Yetkazildi
                </Badge>
              ) : s.outcome === "PARTIAL" ? (
                <Badge tone="warning" icon={PackageMinus}>
                  Qisman · <span className="font-mono">{s.returnNumber}</span>
                </Badge>
              ) : s.outcome === "UNDELIVERED" ? (
                <Badge tone="danger" icon={CircleX}>
                  Yetkazilmadi
                </Badge>
              ) : s.loadedAt ? (
                <Badge tone="success" icon={CircleCheck}>
                  Qabul qilindi
                </Badge>
              ) : null}
            </div>
            {planned && !s.loadedAt ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="w-32">
                  <TextField
                    label="Joylar soni"
                    value={props.places[s.id] ?? ""}
                    onChange={(v) => props.setPlaces(s.id, v.replace(/\D/g, ""))}
                    inputMode="numeric"
                  />
                </div>
                <Button
                  variant="secondary"
                  icon={PackageCheck}
                  disabled={!props.places[s.id]}
                  loading={props.pending === `load-${s.id}`}
                  onClick={() => props.onLoad(s.id)}
                >
                  Qabul qildim
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {planned ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-caption text-text-secondary">
            {left > 0 ? `Qabul qilinmagan: ${formatQuantity(left)} ta buyurtma` : "Hammasi qabul qilindi"}
          </span>
          <Button icon={Truck} disabled={left > 0} loading={props.pending === "start"} onClick={props.onStart}>
            Yuklab boʻlindi — reysni boshlash
          </Button>
        </div>
      ) : t.status === "IN_TRANSIT" ? (
        <TransitActions t={t} />
      ) : (
        <p className="mt-4 text-text-secondary">Reys yakunlandi — qaytgan tovar va naqd pulni topshiring.</p>
      )}
    </Card>
  );
}

/** «Yoʻlda»: har manzilda rasm → «Yetkazildi» (naqd boʻlsa summa) yoki «Yetkazilmadi» (sabab); oxirida «Reysni yakunlash». */
function TransitActions({ t }: { t: TripDetail }) {
  const qc = useQueryClient();
  const [cash, setCash] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [undeliver, setUndeliver] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [partial, setPartial] = useState<TripStop | null>(null);
  const open = t.stops.filter((s) => !s.outcome);

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

  const photo = (stopId: number, file: File) =>
    run(`photo-${stopId}`, async () => {
      await unwrap(
        api.POST("/api/trips/{id}/stops/{stopId}/photos", {
          params: { path: { id: t.id, stopId } },
          body: { file: file as unknown as string },
          bodySerializer: () => {
            const fd = new FormData();
            fd.append("file", file);
            return fd;
          },
        }),
      );
    });

  const deliver = (stopId: number) =>
    run(`deliver-${stopId}`, () => {
      // «amount» maydoni qiymati — kanonik satr («25000.00»)
      const raw = cash[stopId]?.trim();
      return unwrap(
        api.POST("/api/trips/{id}/stops/{stopId}/deliver", {
          params: { path: { id: t.id, stopId } },
          body: { cash: raw || undefined },
        }),
      );
    });

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
        title: "Reys yakunlandi",
        description: r.status === "DONE" ? "Hammasi yetkazildi" : "Qaytgan tovar va naqd pulni topshiring",
      });
    });

  const err = describeError(error);
  return (
    <div className="mt-4 flex flex-col gap-3">
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      {open.map((s) => (
        <div key={s.id} className="rounded-card border border-border p-3">
          <div className="mb-2">
            {s.seq}. {s.customer} {s.phone ? <span className="text-text-secondary">· {s.phone}</span> : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="inline-flex h-control-md cursor-pointer items-center gap-2 rounded-control border border-border bg-surface px-3">
              <Camera size={16} strokeWidth={1.5} aria-hidden />
              {s.photos > 0 ? `Rasm: ${s.photos}` : "Rasm olish"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                aria-label={`Rasm: ${s.customer}`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void photo(s.id, f);
                  e.target.value = "";
                }}
              />
            </label>
            {s.paymentType === "CASH" ? (
              <div className="w-40">
                <TextField
                  label="Naqd olindi"
                  variant="amount"
                  value={cash[s.id] ?? ""}
                  onChange={(v) => setCash((m) => ({ ...m, [s.id]: v }))}
                />
              </div>
            ) : null}
            <Button
              variant="secondary"
              icon={CircleCheck}
              disabled={s.photos === 0}
              loading={pending === `deliver-${s.id}`}
              onClick={() => void deliver(s.id)}
            >
              Yetkazildi
            </Button>
            <Button variant="tertiary" icon={PackageMinus} disabled={s.photos === 0} onClick={() => setPartial(s)}>
              Qisman
            </Button>
            <Button variant="tertiary" icon={CircleX} onClick={() => setUndeliver(s.id)}>
              Yetkazilmadi
            </Button>
          </div>
          {s.photos === 0 ? (
            <div className="mt-1 text-caption text-text-secondary">«Yetkazildi» va «Qisman» uchun kamida 1 rasm kerak.</div>
          ) : null}
        </div>
      ))}
      <div className="flex justify-end">
        <Button icon={Flag} disabled={open.length > 0} loading={pending === "finish"} onClick={() => void finish()}>
          Reysni yakunlash
        </Button>
      </div>
      <Modal
        open={undeliver !== null}
        onClose={() => setUndeliver(null)}
        title="Yetkazilmadi"
        tone="danger"
        primaryAction={{
          label: "Yetkazilmadi deb belgilash",
          onClick: () => void confirmUndeliver(),
          loading: pending?.startsWith("undeliver") ?? false,
          disabled: !reason.trim(),
        }}
      >
        <p className="mb-3">Sotuv va mijoz qarzi bekor boʻladi, tovar omborga qaytadi (Karantin).</p>
        <TextField label="Sabab" value={reason} onChange={setReason} maxLength={300} />
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

type TripStop = TripDetail["stops"][number];

function PartialDialog(props: { tripId: number; stop: TripStop; onClose: () => void; onDone: (d: TripDetail) => void }) {
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
      toast({ tone: "success", title: "Qisman yetkazildi", description: `Qaytgan tovar: ${formatMoney(sum.returned)} soʻm` });
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
      title={`Qisman yetkazish · ${stop.customer}`}
      size="lg"
      primaryAction={{ label: "Qisman yetkazildi deb belgilash", onClick: () => void submit(), loading: pending, disabled: blocked }}
    >
      {err.message ? <Alert tone="danger" title={err.message} className="mb-3" /> : null}
      <p className="mb-3 text-text-secondary">
        Mijoz olmagan miqdorni kiriting. Qaytgan qism asl sotuv narxida qaytarish (QM) boʻlib yoziladi, mijoz qarzi kamayadi, tovar omborga
        qaytadi (Karantin).
      </p>
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
                  Partiya <span className="font-mono">{l.batch}</span> · {formatQuantity(l.qty)} dona × {formatMoney(l.price)} soʻm
                  {l.marked ? " · markirovkali" : ""}
                </div>
              </div>
              <div className="w-28">
                <TextField
                  label="Qaytdi"
                  value={back[l.id] ?? ""}
                  onChange={(v) => setBack((m) => ({ ...m, [l.id]: v.replace(/\D/g, "") }))}
                  inputMode="numeric"
                  error={Number(back[l.id] || "0") > l.qty ? `${formatQuantity(l.qty)} dan koʻp emas` : undefined}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-3 text-caption">
        Qaytdi: <span className="font-mono">{formatMoney(sum.returned)}</span> soʻm · Mijoz toʻlaydi:{" "}
        <span className="font-mono">{formatMoney(sum.net)}</span> soʻm
      </div>
      {sum.all ? (
        <Alert tone="warning" title="Hamma tovar qaytmoqda" className="mb-3">
          «Qisman» emas, «Yetkazilmadi» ni sabab bilan belgilang.
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3">
        <TextField label="Sabab" value={reason} onChange={setReason} maxLength={300} />
        {stop.paymentType === "CASH" ? <TextField label="Naqd olindi" variant="amount" value={cash} onChange={setCash} /> : null}
      </div>
    </Modal>
  );
}
