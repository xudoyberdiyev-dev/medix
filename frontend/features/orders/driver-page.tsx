"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, PackageCheck, Truck } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
              {s.loadedAt ? (
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
      ) : (
        <p className="mt-4 text-text-secondary">Reys yoʻlda — manzillar boʻyicha yetkazing.</p>
      )}
    </Card>
  );
}
