"use client";

import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { useMe } from "@/features/auth/session";
import { fromCents, toCents } from "@/features/cash/api";
import { formatIsoDate, PAYMENT_TYPES } from "@/features/counterparties/api";
import { api, ApiError, unwrap } from "@/lib/api/client";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { parseIds } from "./pick-sheet";
import { PrintShell as Shell, Signatures } from "./print-shell";

const payLabel = (v: string) => PAYMENT_TYPES.find((p) => p.value === v)?.label ?? v;

/** Yoʻl varaqasi (/print/trip?id=5): reys, mashina, haydovchi, toʻxtashlar tartibi, nakladnoylar, imzo joylari. */
export function TripSheetPage() {
  const params = useSearchParams();
  const id = parseIds(params.get("id"))[0] ?? null;
  const me = useMe();
  const trip = useQuery({
    queryKey: ["trips", "one", id],
    queryFn: () => unwrap(api.GET("/api/trips/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });

  if (id === null) {
    return (
      <Shell>
        <EmptyState
          icon={Truck}
          title="Reys tanlanmagan"
          description="Joʻnatish sahifasida reys qatoridagi «Yoʻl varaqasini chop etish»ni bosing."
        />
      </Shell>
    );
  }
  if (trip.error) {
    return (
      <Shell>
        {trip.error instanceof ApiError && trip.error.isForbidden ? (
          <ForbiddenState description="Yoʻl varaqasi faqat joʻnatish ruxsati borlar uchun." />
        ) : (
          <ErrorState onRetry={() => trip.refetch()} />
        )}
      </Shell>
    );
  }
  if (!trip.data) {
    return (
      <Shell>
        <Skeleton className="h-64 w-full" />
      </Shell>
    );
  }

  const t = trip.data;
  const stops = [...t.stops].sort((a, b) => a.seq - b.seq);
  const cash = fromCents(stops.filter((s) => s.paymentType === "CASH").reduce((sum, s) => sum + toCents(s.total), 0n));

  return (
    <Shell ready>
      <header className="flex items-start justify-between gap-4 border-b border-text-primary pb-3">
        <div>
          <div className="text-caption text-text-secondary">MEDIX</div>
          <h1 className="text-page-title">
            Yoʻl varaqasi <span className="font-mono">{t.number}</span>
          </h1>
          <div className="text-text-secondary">
            {formatIsoDate(t.tripDate)} · {t.vehicle} · Haydovchi: {t.driver}
          </div>
        </div>
        <div className="text-right text-caption text-text-secondary">
          <div>Chop etildi: {formatDateTime(new Date())}</div>
          <div>Kim: {me.data?.fullName ?? "—"}</div>
          <div className="tabular-nums">
            {formatQuantity(stops.length)} buyurtma · {formatQuantity(t.places)} joy
          </div>
        </div>
      </header>

      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-text-primary text-caption text-text-secondary">
            <th className="py-1 pr-2 font-medium">№</th>
            <th className="py-1 pr-2 font-medium">Buyurtma / NK</th>
            <th className="py-1 pr-2 font-medium">Mijoz, manzil</th>
            <th className="py-1 pr-2 text-right font-medium">Joy</th>
            <th className="py-1 pr-2 font-medium">Toʻlov</th>
            <th className="py-1 pr-2 text-right font-medium">Summa, soʻm</th>
            <th className="w-28 py-1 font-medium">Qabul qildi</th>
          </tr>
        </thead>
        <tbody>
          {stops.map((s) => (
            <tr key={s.id} className="break-inside-avoid border-b border-border align-top">
              <td className="py-1.5 pr-2 tabular-nums">{s.seq}</td>
              <td className="py-1.5 pr-2 font-mono">
                <div>{s.orderNumber}</div>
                <div className="text-caption text-text-secondary">{s.waybillNumber ?? "—"}</div>
              </td>
              <td className="py-1.5 pr-2">
                <div>{s.customer}</div>
                <div className="text-caption text-text-secondary">{[s.address, s.phone].filter(Boolean).join(" · ") || "—"}</div>
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{formatQuantity(s.places)}</td>
              <td className="py-1.5 pr-2">{payLabel(s.paymentType)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(s.total)}</td>
              <td className="py-1.5" />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="py-1.5 pr-2" colSpan={3}>
              Jami
            </td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{formatQuantity(t.places)}</td>
            <td className="py-1.5 pr-2" />
            <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(t.total)}</td>
            <td />
          </tr>
          <tr className="text-text-secondary">
            <td className="py-1 pr-2" colSpan={5}>
              Shundan naqd (haydovchi olib keladi)
            </td>
            <td className="py-1 pr-2 text-right tabular-nums">{formatMoney(cash)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {t.note ? <p className="mt-3">Izoh: {t.note}</p> : null}

      <Signatures roles={["Tovarni berdi (Ombor mudiri)", "Tovarni qabul qildi (Haydovchi)", "Pulni qabul qildi (Kassir)"]} />
    </Shell>
  );
}
