"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, PackageCheck, Printer, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";

export type ReadyOrder = components["schemas"]["ReadyOrder"];
export type TripSummary = components["schemas"]["TripSummary"];
export type TripStatus = TripSummary["status"];

export const TRIP_STATUS: Record<TripStatus, { label: string; tone: "info" | "warning" | "success" | "neutral"; icon: typeof Truck }> = {
  PLANNED: { label: "Rejalashtirilgan", tone: "info", icon: CalendarClock },
  IN_TRANSIT: { label: "Yoʻlda", tone: "info", icon: Truck },
  RETURN_WAIT: { label: "Qaytish kutilmoqda", tone: "warning", icon: Truck },
  DONE: { label: "Yakunlangan", tone: "success", icon: PackageCheck },
  CANCELLED: { label: "Bekor qilingan", tone: "neutral", icon: Ban },
};

/** Sigʻim: tanlangan joylar + mashinaning band joylari ≤ sigʻim (server bilan bir xil). */
export function capacityState(selected: number, busy: number, capacity: number | null | undefined): { text: string; over: boolean } {
  if (!capacity) return { text: `${formatQuantity(selected)} joy · sigʻim belgilanmagan`, over: false };
  const used = selected + busy;
  return { text: `${formatQuantity(used)} / ${formatQuantity(capacity)} joy`, over: used > capacity };
}

function todayUz(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  return formatIsoDate(p);
}

/** Hujjatlashtirish (SPEC 5.2 №7): reys tuzish — mashina, haydovchi, sigʻim; nakladnoy; «Oʻzi olib ketadi». */
export function ShipmentsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const allowed = can(me.data, "shipments.view");
  const canTrip = can(me.data, "shipments.trip");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const scopeBranch = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const ready = useQuery({
    queryKey: ["trips", "ready", scopeBranch],
    queryFn: () => unwrap(api.GET("/api/trips/ready", { params: { query: { branchId: scopeBranch ?? undefined } } })),
    enabled: allowed,
    refetchInterval: 20_000,
  });
  const trips = useQuery({
    queryKey: ["trips", "list", scopeBranch],
    queryFn: () => unwrap(api.GET("/api/trips", { params: { query: { branchId: scopeBranch ?? undefined, active: true } } })),
    enabled: allowed,
  });
  const [picked, setPicked] = useState<number[]>([]);
  const deliveries = useMemo(() => (ready.data ?? []).filter((o) => o.delivery === "DELIVERY"), [ready.data]);
  const pickups = useMemo(() => (ready.data ?? []).filter((o) => o.delivery === "PICKUP"), [ready.data]);
  const tripBranch = deliveries.find((o) => picked.includes(o.id))?.branchId ?? scopeBranch ?? me.data?.branchId ?? null;
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [driver, setDriver] = useState<string | null>(null);
  const [date, setDate] = useState(todayUz);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [cancelling, setCancelling] = useState<TripSummary | null>(null);
  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState<unknown>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [pickupPending, setPickupPending] = useState<number | null>(null);
  const waiting = useQuery({
    queryKey: ["orders", "list", "pickup-loading", scopeBranch],
    queryFn: () =>
      unwrap(api.GET("/api/orders", { params: { query: { status: "LOADING", branchId: scopeBranch ?? undefined, size: 200 } } })),
    enabled: allowed,
    select: (p) => p.items.filter((o) => o.deliveryType === "PICKUP"),
  });
  const [handoverPending, setHandoverPending] = useState<number | null>(null);
  const options = useQuery({
    queryKey: ["trips", "options", tripBranch],
    queryFn: () => unwrap(api.GET("/api/trips/options", { params: { query: { branchId: tripBranch ?? 0 } } })),
    enabled: canTrip && tripBranch !== null,
  });

  if (me.data && !allowed) return <ForbiddenState description="Joʻnatish sahifasi Ombor mudiri, Filial rahbari va Direktor uchun." />;

  const places = deliveries.filter((o) => picked.includes(o.id)).reduce((s, o) => s + o.places, 0);
  const v = options.data?.vehicles.find((x) => String(x.id) === vehicle);
  const cap = capacityState(places, v?.busyPlaces ?? 0, v?.capacityBoxes);
  const isoDate = parseUzDate(date);

  async function createTrip() {
    setError(null);
    if (!isoDate) {
      setError(new Error("date"));
      return;
    }
    setPending(true);
    try {
      await ensureCsrf();
      const t = await unwrap(
        api.POST("/api/trips", {
          body: { vehicleId: Number(vehicle), driverId: Number(driver), tripDate: isoDate, orderIds: picked },
        }),
      );
      toast({
        tone: "success",
        title: `Reys ${t.number} rejalashtirildi`,
        description: `${t.stops.length} ta buyurtma · nakladnoylar raqamlandi`,
      });
      setPicked([]);
      setVehicle(null);
      setDriver(null);
      await qc.invalidateQueries({ queryKey: ["trips"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  async function pickup(id: number) {
    setPickupPending(id);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/trips/pickup", { body: { orderId: id } }));
      toast({ tone: "success", title: "Nakladnoy tayyor", description: `${r.waybillNumber} · mijoz olib ketishi mumkin` });
      await qc.invalidateQueries({ queryKey: ["trips"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(e);
    } finally {
      setPickupPending(null);
    }
  }

  async function handover(id: number) {
    setHandoverPending(id);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/trips/pickup/{orderId}/handover", { params: { path: { orderId: id } } }));
      toast({ tone: "success", title: "Mijoz olib ketdi", description: `Sotuv ${r.sale} va hisob-faktura yozildi` });
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(e);
    } finally {
      setHandoverPending(null);
    }
  }

  async function cancelTrip() {
    if (!cancelling) return;
    setCancelPending(true);
    setCancelError(null);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/trips/{id}/cancel", { params: { path: { id: cancelling.id } }, body: { reason: reason.trim() } }));
      setCancelling(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["trips"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setCancelError(e);
    } finally {
      setCancelPending(false);
    }
  }

  const err =
    error instanceof Error && error.message === "date"
      ? { message: "Reys sanasini KK.OO.YYYY koʻrinishida kiriting." }
      : describeError(error);
  const cancelErr = describeError(cancelError);
  return (
    <>
      <h1 className="mb-4 text-page-title">Joʻnatish</h1>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      {ready.error ? (
        <ErrorState onRetry={() => ready.refetch()} />
      ) : ready.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_2fr]">
          <section aria-label="Joʻnatishga tayyor">
            <h2 className="mb-3 text-subtitle">Joʻnatishga tayyor — yetkazib berish</h2>
            {deliveries.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Truck}
                  title="Tayyor buyurtma yoʻq"
                  description="Hisobdan oʻtkazilgan buyurtmalar shu yerda paydo boʻladi."
                />
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {deliveries.map((o) => (
                  <li key={o.id} className="flex items-start gap-3 rounded-card border border-border bg-surface p-3">
                    {canTrip ? (
                      <Checkbox
                        label="Reysga"
                        checked={picked.includes(o.id)}
                        disabled={tripBranch !== null && picked.length > 0 && o.branchId !== tripBranch}
                        onChange={(on) => setPicked((p) => (on ? [...p, o.id] : p.filter((x) => x !== o.id)))}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono">{o.number}</span>
                        <span className="tabular-nums">{formatMoney(o.total)} soʻm</span>
                      </div>
                      <div>{o.customer}</div>
                      <div className="text-caption text-text-secondary">
                        {o.address ?? "Manzil koʻrsatilmagan"} · {formatQuantity(o.places)} joy
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pickups.length > 0 ? (
              <>
                <h2 className="mt-6 mb-3 text-subtitle">Oʻzi olib ketadi</h2>
                <ul className="flex flex-col gap-2">
                  {pickups.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3"
                    >
                      <div>
                        <span className="font-mono">{o.number}</span> · {o.customer} · {formatQuantity(o.places)} joy
                      </div>
                      {canTrip ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={PackageCheck}
                          loading={pickupPending === o.id}
                          onClick={() => void pickup(o.id)}
                        >
                          Nakladnoy berish
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {(waiting.data ?? []).length > 0 ? (
              <>
                <h2 className="mt-6 mb-3 text-subtitle">Olib ketishni kutmoqda</h2>
                <ul className="flex flex-col gap-2">
                  {(waiting.data ?? []).map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3"
                    >
                      <div>
                        <span className="font-mono">{o.number}</span> · {o.customer} · {formatMoney(o.total)} soʻm
                      </div>
                      {can(me.data, "shipments.ship") ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={PackageCheck}
                          loading={handoverPending === o.id}
                          onClick={() => void handover(o.id)}
                        >
                          Mijoz olib ketdi
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
          {canTrip ? (
            <section aria-label="Reys tuzish">
              <Card>
                <h2 className="mb-3 text-subtitle">Reys tuzish</h2>
                <div className="flex flex-col gap-3">
                  <Select
                    label="Mashina"
                    value={vehicle}
                    onChange={setVehicle}
                    options={(options.data?.vehicles ?? []).map((x) => ({
                      value: String(x.id),
                      label: `${x.plateNumber} · ${x.model}`,
                      meta: x.capacityBoxes ? `${formatQuantity(x.capacityBoxes)} joy` : undefined,
                    }))}
                  />
                  <Select
                    label="Haydovchi"
                    value={driver}
                    onChange={setDriver}
                    options={(options.data?.drivers ?? []).map((d) => ({
                      value: String(d.id),
                      label: d.fullName,
                      sub: d.phone ?? undefined,
                      meta: d.activeTrip ? `Band: ${d.activeTrip}` : undefined,
                      metaWarning: Boolean(d.activeTrip),
                      disabled: Boolean(d.activeTrip),
                    }))}
                  />
                  <TextField label="Reys sanasi" value={date} onChange={setDate} placeholder="KK.OO.YYYY" />
                  <div className={`text-subtitle tabular-nums ${cap.over ? "text-danger" : ""}`} aria-live="polite">
                    {formatQuantity(picked.length)} ta buyurtma · {cap.text}
                  </div>
                  {cap.over ? (
                    <Alert tone="danger" title="Mashina sigʻimi yetmaydi">
                      Buyurtmalarni kamaytiring yoki boshqa mashina tanlang.
                    </Alert>
                  ) : null}
                  <Button
                    icon={Truck}
                    disabled={picked.length === 0 || !vehicle || !driver || cap.over}
                    loading={pending}
                    onClick={() => void createTrip()}
                  >
                    Reysni rejalashtirish
                  </Button>
                </div>
              </Card>
            </section>
          ) : null}
        </div>
      )}
      <section aria-label="Faol reyslar" className="mt-8">
        <h2 className="mb-3 text-subtitle">Faol reyslar</h2>
        {trips.error ? (
          <ErrorState onRetry={() => trips.refetch()} />
        ) : trips.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : trips.data.length === 0 ? (
          <p className="text-text-secondary">Faol reys yoʻq.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {trips.data.map((t) => {
              const st = TRIP_STATUS[t.status];
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{t.number}</span>
                      <Badge tone={st.tone} icon={st.icon}>
                        {st.label}
                      </Badge>
                    </div>
                    <div className="text-caption text-text-secondary">
                      {formatIsoDate(t.tripDate)} · {t.vehicle} · {t.driver} · {formatQuantity(t.orders)} ta buyurtma ·{" "}
                      {formatQuantity(t.places)} joy · {formatMoney(t.total)} soʻm
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Printer}
                      onClick={() => window.open(`/print/trip?id=${t.id}`, "_blank", "noopener")}
                    >
                      Yoʻl varaqasi
                    </Button>
                    {canTrip && t.status === "PLANNED" ? (
                      <Button size="sm" variant="tertiary" icon={Ban} onClick={() => setCancelling(t)}>
                        Reysni bekor qilish
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Reysni bekor qilish"
        tone="danger"
        primaryAction={{ label: "Reysni bekor qilish", onClick: () => void cancelTrip(), loading: cancelPending, disabled: !reason.trim() }}
      >
        <p className="mb-3">{cancelling?.number}: buyurtmalar «Hujjatlashtirilmoqda»ga qaytadi, nakladnoy raqamlari saqlanadi.</p>
        <TextField label="Sabab" value={reason} onChange={setReason} maxLength={300} error={cancelErr.fields.reason} />
        {cancelErr.message ? <Alert tone="danger" title={cancelErr.message} className="mt-3" /> : null}
      </Modal>
    </>
  );
}
