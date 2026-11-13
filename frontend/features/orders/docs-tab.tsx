"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useLiveConnected } from "@/lib/live";
import { placesText } from "./shipments-model";

function todayUz(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  return formatIsoDate(p);
}

/**
 * Ombor mudiri paneli → «Hujjatlashtirish» (prototip SupervisorPanel `docs`): yetkazishga tayyor buyurtmalardan
 * reys tuzish (mashina, haydovchi, sana — sigʻimsiz, E6) va «Oʻzi olib ketadi» buyurtmalariga nakladnoy berish.
 * Reys faqat shu yerda tuziladi (E5, prototip T9-4a2); Joʻnatish sahifasi — koʻrish va topshirish.
 */
export function DocsTab({ branchId }: { branchId: number | null }) {
  const tr = useTranslations("orders");
  const live = useLiveConnected();
  const me = useMe();
  const qc = useQueryClient();
  const ready = useQuery({
    queryKey: ["trips", "ready", branchId],
    queryFn: () => unwrap(api.GET("/api/trips/ready", { params: { query: { branchId: branchId ?? undefined } } })),
    refetchInterval: live ? 60_000 : 20_000,
  });
  const [picked, setPicked] = useState<number[]>([]);
  const deliveries = useMemo(() => (ready.data ?? []).filter((o) => o.delivery === "DELIVERY"), [ready.data]);
  const pickups = useMemo(() => (ready.data ?? []).filter((o) => o.delivery === "PICKUP"), [ready.data]);
  const tripBranch = deliveries.find((o) => picked.includes(o.id))?.branchId ?? branchId ?? me.data?.branchId ?? null;
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [driver, setDriver] = useState<string | null>(null);
  const [date, setDate] = useState(todayUz);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pickupPending, setPickupPending] = useState<number | null>(null);
  const options = useQuery({
    queryKey: ["trips", "options", tripBranch],
    queryFn: () => unwrap(api.GET("/api/trips/options", { params: { query: { branchId: tripBranch ?? 0 } } })),
    enabled: tripBranch !== null,
  });

  const places = deliveries.filter((o) => picked.includes(o.id)).reduce((s, o) => s + o.places, 0);
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

  const err = error instanceof Error && error.message === "date" ? { message: tr("shipments.dateError") } : describeError(error);
  if (ready.error) return <ErrorState error={ready.error} onRetry={() => ready.refetch()} />;
  if (ready.isPending) return <Skeleton className="h-40 w-full" />;
  return (
    <>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
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
                  <Checkbox
                    label={tr("shipments.toTrip")}
                    checked={picked.includes(o.id)}
                    disabled={tripBranch !== null && picked.length > 0 && o.branchId !== tripBranch}
                    onChange={(on) => setPicked((p) => (on ? [...p, o.id] : p.filter((x) => x !== o.id)))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono">{o.number}</span>
                      <span className="tabular-nums">{tr("sum", { amount: formatMoney(o.total) })}</span>
                    </div>
                    <div>{o.customer}</div>
                    <div className="text-caption text-text-secondary">
                      {[o.region, o.address ?? tr("shipments.noAddress")].filter(Boolean).join(", ")} ·{" "}
                      {o.deliveryDate ? `${formatIsoDate(o.deliveryDate)} · ` : ""}
                      {tr("shipments.places", { n: formatQuantity(o.places) })}
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
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={PackageCheck}
                      loading={pickupPending === o.id}
                      onClick={() => void pickup(o.id)}
                    >
                      {tr("shipments.giveWaybill")}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
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
                  meta: x.hasRefrigerator ? tr("shipments.refrigerator") : undefined,
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
              <TextField
                variant="date"
                label={tr("shipments.tripDate")}
                value={date}
                onChange={setDate}
                placeholder={tr("drawer.datePlaceholder")}
              />
              <div className="text-subtitle tabular-nums" aria-live="polite">
                {tr("shipments.selected", { count: formatQuantity(picked.length), places: placesText(places, tr) })}
              </div>
              <Button
                icon={Truck}
                disabled={picked.length === 0 || !vehicle || !driver}
                loading={pending}
                onClick={() => void createTrip()}
              >
                {tr("shipments.plan")}
              </Button>
            </div>
          </Card>
        </section>
      </div>
    </>
  );
}
