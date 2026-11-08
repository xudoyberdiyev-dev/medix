"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { placesText, type ReadyOrder } from "./shipments-page";

/**
 * Rejalashtirilgan reys tarkibi: buyurtma qoʻshish (Joʻnatishga tayyor, shu filial) va olib tashlash (haydovchi hali
 * qabul qilmagan; sabab majburiy). Oxirgi buyurtmani olib tashlash oʻrniga reys bekor qilinadi (server ham tekshiradi).
 */
export function TripEditModal({ tripId, ready, onClose }: { tripId: number | null; ready: ReadyOrder[]; onClose: () => void }) {
  const tr = useTranslations("orders");
  const qc = useQueryClient();
  const trip = useQuery({
    queryKey: ["trips", "detail", tripId],
    queryFn: () => unwrap(api.GET("/api/trips/{id}", { params: { path: { id: tripId ?? 0 } } })),
    enabled: tripId !== null,
  });
  const branchId = trip.data?.branchId ?? null;
  const [picked, setPicked] = useState<number[]>([]);
  const [removing, setRemoving] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const candidates = ready.filter((o) => o.delivery === "DELIVERY" && o.branchId === branchId);
  const places = candidates.filter((o) => picked.includes(o.id)).reduce((s, o) => s + o.places, 0);
  const stops = trip.data?.stops ?? [];

  function close() {
    setPicked([]);
    setRemoving(null);
    setReason("");
    setError(null);
    onClose();
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["trips"] });
    await qc.invalidateQueries({ queryKey: ["orders"] });
  }

  async function add() {
    if (tripId === null || picked.length === 0) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const t = await unwrap(api.POST("/api/trips/{id}/orders", { params: { path: { id: tripId } }, body: { orderIds: picked } }));
      toast({
        tone: "success",
        title: tr("tripEdit.added", { number: t.number, count: formatQuantity(picked.length) }),
        description: tr("tripEdit.addedHint"),
      });
      setPicked([]);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  async function remove(orderId: number) {
    if (tripId === null) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      await unwrap(
        api.POST("/api/trips/{id}/orders/{orderId}/remove", {
          params: { path: { id: tripId, orderId } },
          body: { reason: reason.trim() },
        }),
      );
      toast({
        tone: "success",
        title: tr("tripEdit.removed"),
        description: tr("tripEdit.removedHint"),
      });
      setRemoving(null);
      setReason("");
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  return (
    <Modal
      open={tripId !== null}
      onClose={close}
      size="lg"
      title={trip.data ? tr("tripEdit.titleNumber", { number: trip.data.number }) : tr("tripEdit.title")}
      primaryAction={{
        label: tr("tripEdit.add"),
        onClick: () => void add(),
        loading: pending && removing === null,
        disabled: picked.length === 0 || pending,
      }}
    >
      {trip.error ? (
        <ErrorState onRetry={() => trip.refetch()} />
      ) : trip.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          {err.message ? <Alert tone="danger" title={err.message} /> : null}
          <section aria-label={tr("tripEdit.inTripAria")}>
            <h3 className="mb-2 text-subtitle">{tr("tripEdit.inTrip", { count: formatQuantity(stops.length) })}</h3>
            <ul className="flex flex-col gap-2">
              {stops.map((s) => (
                <li key={s.id} className="rounded-card border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono">{s.orderNumber}</span> · {s.customer} ·{" "}
                      {tr("shipments.places", { n: formatQuantity(s.places) })}
                    </div>
                    {s.loadedAt ? (
                      <Badge tone="success" icon={Check}>
                        {tr("tripEdit.driverAccepted")}
                      </Badge>
                    ) : stops.length > 1 && removing !== s.orderId ? (
                      <Button size="sm" variant="tertiary" icon={Minus} onClick={() => setRemoving(s.orderId)}>
                        {tr("tripEdit.remove")}
                      </Button>
                    ) : null}
                  </div>
                  {removing === s.orderId ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <TextField
                        label={tr("tripEdit.reason")}
                        value={reason}
                        onChange={setReason}
                        maxLength={300}
                        error={err.fields.reason}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={pending}
                          disabled={!reason.trim()}
                          onClick={() => void remove(s.orderId)}
                        >
                          {tr("tripEdit.removeFromTrip")}
                        </Button>
                        <Button size="sm" variant="tertiary" onClick={() => setRemoving(null)}>
                          {tr("tripEdit.back")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {stops.length === 1 ? <p className="mt-2 text-caption text-text-secondary">{tr("tripEdit.lastOne")}</p> : null}
          </section>
          <section aria-label={tr("tripEdit.canAdd")}>
            <h3 className="mb-2 text-subtitle">{tr("tripEdit.canAdd")}</h3>
            {candidates.length === 0 ? (
              <p className="text-text-secondary">{tr("tripEdit.noCandidates")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {candidates.map((o) => (
                  <li key={o.id} className="flex items-start gap-3 rounded-card border border-border p-3">
                    <Checkbox
                      label={tr("tripEdit.toTrip")}
                      checked={picked.includes(o.id)}
                      onChange={(on) => setPicked((p) => (on ? [...p, o.id] : p.filter((x) => x !== o.id)))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono">{o.number}</span>
                        <span className="tabular-nums">{tr("sum", { amount: formatMoney(o.total) })}</span>
                      </div>
                      <div className="text-caption text-text-secondary">
                        {o.customer} · {tr("shipments.places", { n: formatQuantity(o.places) })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-subtitle tabular-nums" aria-live="polite">
              {trip.data?.vehicle} · {placesText(places + (trip.data?.places ?? 0), tr)}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
