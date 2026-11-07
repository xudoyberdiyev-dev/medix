"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, ListPlus, PackageCheck, Printer, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { useLiveConnected } from "@/lib/live";
import { TripEditModal } from "./trip-edit-modal";
import type { OrdersT } from "./i18n";

export type ReadyOrder = components["schemas"]["ReadyOrder"];
export type TripSummary = components["schemas"]["TripSummary"];
export type TripStatus = TripSummary["status"];

/** Reys holati koʻrinishi; nomi — lugʻatda (`orders.shipments.tripStatus.*`). */
export const TRIP_STATUS: Record<TripStatus, { tone: "info" | "warning" | "success" | "neutral"; icon: typeof Truck }> = {
  PLANNED: { tone: "info", icon: CalendarClock },
  IN_TRANSIT: { tone: "info", icon: Truck },
  RETURN_WAIT: { tone: "warning", icon: Truck },
  DONE: { tone: "success", icon: PackageCheck },
  CANCELLED: { tone: "neutral", icon: Ban },
};

/** Sigʻim: tanlangan joylar + mashinaning band joylari ≤ sigʻim (server bilan bir xil). */
export function capacityState(
  selected: number,
  busy: number,
  capacity: number | null | undefined,
  t: OrdersT,
): { text: string; over: boolean } {
  if (!capacity) return { text: t("shipments.capacityNone", { n: formatQuantity(selected) }), over: false };
  const used = selected + busy;
  return { text: t("shipments.capacity", { used: formatQuantity(used), capacity: formatQuantity(capacity) }), over: used > capacity };
}

function todayUz(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  return formatIsoDate(p);
}

/** Hujjatlashtirish (SPEC 5.2 №7): reys tuzish — mashina, haydovchi, sigʻim; nakladnoy; «Oʻzi olib ketadi». */
export function ShipmentsPage() {
  const tr = useTranslations("orders");
  const live = useLiveConnected();
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
    refetchInterval: live ? 60_000 : 20_000,
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
  const [editing, setEditing] = useState<number | null>(null);
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

  if (me.data && !allowed) return <ForbiddenState description={tr("shipments.forbidden")} />;

  const places = deliveries.filter((o) => picked.includes(o.id)).reduce((s, o) => s + o.places, 0);
  const v = options.data?.vehicles.find((x) => String(x.id) === vehicle);
  const cap = capacityState(places, v?.busyPlaces ?? 0, v?.capacityBoxes, tr);
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
        title: tr("shipments.tripPlanned", { number: t.number }),
        description: tr("shipments.tripPlannedHint", { count: t.stops.length }),
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
      toast({
        tone: "success",
        title: tr("shipments.waybillReady"),
        description: tr("shipments.waybillReadyHint", { number: r.waybillNumber }),
      });
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
      toast({ tone: "success", title: tr("shipments.pickedUp"), description: tr("shipments.pickedUpHint", { sale: r.sale }) });
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

  const err = error instanceof Error && error.message === "date" ? { message: tr("shipments.dateError") } : describeError(error);
  const cancelErr = describeError(cancelError);
  return (
    <>
      <h1 className="mb-4 text-page-title">{tr("shipments.title")}</h1>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      {ready.error ? (
        <ErrorState onRetry={() => ready.refetch()} />
      ) : ready.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_2fr]">
          <section aria-label={tr("shipments.readyAria")}>
            <h2 className="mb-3 text-subtitle">{tr("shipments.readyTitle")}</h2>
            {deliveries.length === 0 ? (
              <Card>
                <EmptyState icon={Truck} title={tr("shipments.emptyTitle")} description={tr("shipments.emptyHint")} />
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {deliveries.map((o) => (
                  <li key={o.id} className="flex items-start gap-3 rounded-card border border-border bg-surface p-3">
                    {canTrip ? (
                      <Checkbox
                        label={tr("shipments.toTrip")}
                        checked={picked.includes(o.id)}
                        disabled={tripBranch !== null && picked.length > 0 && o.branchId !== tripBranch}
                        onChange={(on) => setPicked((p) => (on ? [...p, o.id] : p.filter((x) => x !== o.id)))}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono">{o.number}</span>
                        <span className="tabular-nums">{tr("sum", { amount: formatMoney(o.total) })}</span>
                      </div>
                      <div>{o.customer}</div>
                      <div className="text-caption text-text-secondary">
                        {o.address ?? tr("shipments.noAddress")} · {tr("shipments.places", { n: formatQuantity(o.places) })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pickups.length > 0 ? (
              <>
                <h2 className="mt-6 mb-3 text-subtitle">{tr("shipments.pickup")}</h2>
                <ul className="flex flex-col gap-2">
                  {pickups.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3"
                    >
                      <div>
                        <span className="font-mono">{o.number}</span> · {o.customer} ·{" "}
                        {tr("shipments.places", { n: formatQuantity(o.places) })}
                      </div>
                      {canTrip ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={PackageCheck}
                          loading={pickupPending === o.id}
                          onClick={() => void pickup(o.id)}
                        >
                          {tr("shipments.giveWaybill")}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {(waiting.data ?? []).length > 0 ? (
              <>
                <h2 className="mt-6 mb-3 text-subtitle">{tr("shipments.waiting")}</h2>
                <ul className="flex flex-col gap-2">
                  {(waiting.data ?? []).map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3"
                    >
                      <div>
                        <span className="font-mono">{o.number}</span> · {o.customer} · {tr("sum", { amount: formatMoney(o.total) })}
                      </div>
                      {can(me.data, "shipments.ship") ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={PackageCheck}
                          loading={handoverPending === o.id}
                          onClick={() => void handover(o.id)}
                        >
                          {tr("shipments.handover")}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
          {canTrip ? (
            <section aria-label={tr("shipments.build")}>
              <Card>
                <h2 className="mb-3 text-subtitle">{tr("shipments.build")}</h2>
                <div className="flex flex-col gap-3">
                  <Select
                    label={tr("shipments.vehicle")}
                    value={vehicle}
                    onChange={setVehicle}
                    options={(options.data?.vehicles ?? []).map((x) => ({
                      value: String(x.id),
                      label: `${x.plateNumber} · ${x.model}`,
                      meta: x.capacityBoxes ? tr("shipments.places", { n: formatQuantity(x.capacityBoxes) }) : undefined,
                    }))}
                  />
                  <Select
                    label={tr("shipments.driver")}
                    value={driver}
                    onChange={setDriver}
                    options={(options.data?.drivers ?? []).map((d) => ({
                      value: String(d.id),
                      label: d.fullName,
                      sub: d.phone ?? undefined,
                      meta: d.activeTrip ? tr("shipments.busy", { trip: d.activeTrip }) : undefined,
                      metaWarning: Boolean(d.activeTrip),
                      disabled: Boolean(d.activeTrip),
                    }))}
                  />
                  <TextField label={tr("shipments.tripDate")} value={date} onChange={setDate} placeholder={tr("drawer.datePlaceholder")} />
                  <div className={`text-subtitle tabular-nums ${cap.over ? "text-danger" : ""}`} aria-live="polite">
                    {tr("shipments.selected", { count: formatQuantity(picked.length), capacity: cap.text })}
                  </div>
                  {cap.over ? (
                    <Alert tone="danger" title={tr("shipments.overTitle")}>
                      {tr("shipments.overHint")}
                    </Alert>
                  ) : null}
                  <Button
                    icon={Truck}
                    disabled={picked.length === 0 || !vehicle || !driver || cap.over}
                    loading={pending}
                    onClick={() => void createTrip()}
                  >
                    {tr("shipments.plan")}
                  </Button>
                </div>
              </Card>
            </section>
          ) : null}
        </div>
      )}
      <section aria-label={tr("shipments.active")} className="mt-8">
        <h2 className="mb-3 text-subtitle">{tr("shipments.active")}</h2>
        {trips.error ? (
          <ErrorState onRetry={() => trips.refetch()} />
        ) : trips.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : trips.data.length === 0 ? (
          <p className="text-text-secondary">{tr("shipments.noActive")}</p>
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
                        {tr(`shipments.tripStatus.${t.status}`)}
                      </Badge>
                    </div>
                    <div className="text-caption text-text-secondary">
                      {tr("shipments.tripMeta", {
                        date: formatIsoDate(t.tripDate),
                        vehicle: t.vehicle,
                        driver: t.driver,
                        orders: formatQuantity(t.orders),
                        places: formatQuantity(t.places),
                        amount: formatMoney(t.total),
                      })}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Printer}
                      onClick={() => window.open(`/api/trips/${t.id}/sheet/pdf`, "_blank", "noopener")}
                    >
                      {tr("shipments.printSheet")}
                    </Button>
                    {canTrip && t.status === "PLANNED" ? (
                      <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setEditing(t.id)}>
                        {tr("shipments.editTrip")}
                      </Button>
                    ) : null}
                    {canTrip && t.status === "PLANNED" ? (
                      <Button size="sm" variant="tertiary" icon={Ban} onClick={() => setCancelling(t)}>
                        {tr("shipments.cancelTrip")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <TripEditModal tripId={editing} ready={ready.data ?? []} onClose={() => setEditing(null)} />
      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={tr("shipments.cancelTrip")}
        tone="danger"
        primaryAction={{
          label: tr("shipments.cancelTrip"),
          onClick: () => void cancelTrip(),
          loading: cancelPending,
          disabled: !reason.trim(),
        }}
      >
        <p className="mb-3">{tr("shipments.cancelText", { number: cancelling?.number ?? "" })}</p>
        <TextField label={tr("shipments.reason")} value={reason} onChange={setReason} maxLength={300} error={cancelErr.fields.reason} />
        {cancelErr.message ? <Alert tone="danger" title={cancelErr.message} className="mt-3" /> : null}
      </Modal>
    </>
  );
}
