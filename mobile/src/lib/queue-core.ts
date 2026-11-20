// Oflayn navbat (M5) — sof qism: amal turlari va navbatni reysga «ustiga qoʻyish» (internet yoʻqda ekran darhol yangilansin).
import type { TripDetail } from "./trip-view.ts";

export type QueuedAction =
  | { kind: "photo"; tripId: number; stopId: number; uri: string; signature: boolean }
  | { kind: "deliver"; tripId: number; stopId: number; cash: string | null }
  | { kind: "undeliver"; tripId: number; stopId: number; reason: string }
  | { kind: "partial"; tripId: number; stopId: number; reason: string; lines: { saleLineId: number; qty: number }[]; cash: string | null };

export type Queued = QueuedAction & { id: string; at: string };

/** Navbatdagi amallar serverga yetib bormagan boʻlsa ham reys ekranida koʻrinsin. */
export function applyQueue(trip: TripDetail, queue: Queued[]): TripDetail {
  const mine = queue.filter((q) => q.tripId === trip.id);
  if (mine.length === 0) return trip;
  const stops = trip.stops.map((s) => {
    let stop = { ...s };
    for (const q of mine) {
      if (q.stopId !== s.id) continue;
      if (q.kind === "photo") stop = q.signature ? { ...stop, signed: true } : { ...stop, photos: stop.photos + 1 };
      if (q.kind === "deliver") stop = { ...stop, outcome: "DELIVERED", cashCollected: q.cash ?? undefined };
      if (q.kind === "undeliver") stop = { ...stop, outcome: "UNDELIVERED", outcomeReason: q.reason };
      if (q.kind === "partial") stop = { ...stop, outcome: "PARTIAL", outcomeReason: q.reason, cashCollected: q.cash ?? undefined };
    }
    return stop;
  });
  return { ...trip, stops };
}

/** Bajarilgan amallarni navbatdan olib tashlash (birinchi kelgan — birinchi ketadi). */
export function dropFirst(queue: Queued[], id: string): Queued[] {
  return queue.filter((q) => q.id !== id);
}
