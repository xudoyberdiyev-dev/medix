// Reys ekranlari uchun sof hisob-kitob (birlik testlari bilan). Tiplar — OpenAPI'dan.
import type { components } from "./api-schema";
import { toTiyin } from "./format.ts";

export type TripDetail = components["schemas"]["TripDetail"];
export type TripStop = components["schemas"]["TripStop"];
export type TripSummary = components["schemas"]["TripSummary"];

/** Faol (olib tashlanmagan) bekatlar tartib boʻyicha. */
export function stops(trip: TripDetail): TripStop[] {
  return [...trip.stops].sort((a, b) => a.seq - b.seq);
}

export type LoadState = "loaded" | "current" | "waiting";

/** Yuklash: qabul qilinganlar, joriy (birinchi qabul qilinmagan), qolganlari kutilmoqda. */
export function loadStates(trip: TripDetail): { stop: TripStop; state: LoadState }[] {
  let currentTaken = false;
  return stops(trip).map((stop) => {
    if (stop.loadedAt) return { stop, state: "loaded" as const };
    if (!currentTaken) {
      currentTaken = true;
      return { stop, state: "current" as const };
    }
    return { stop, state: "waiting" as const };
  });
}

export function loadedCount(trip: TripDetail): number {
  return trip.stops.filter((s) => s.loadedAt).length;
}

export function allLoaded(trip: TripDetail): boolean {
  return trip.stops.length > 0 && trip.stops.every((s) => s.loadedAt);
}

/** Natijasi belgilangan bekatlar (yetkazildi / qisman / yetkazilmadi). */
export function markedCount(trip: TripDetail): number {
  return trip.stops.filter((s) => s.outcome).length;
}

/** Keyingi manzil — natijasi belgilanmagan birinchi bekat. */
export function nextStop(trip: TripDetail): TripStop | null {
  return stops(trip).find((s) => !s.outcome) ?? null;
}

/** Haydovchi qoʻlidagi naqd (olingan summalar), tiyinda. */
export function cashInHand(trip: TripDetail): bigint {
  return trip.stops.reduce((sum, s) => sum + toTiyin(s.cashCollected), 0n);
}

/** Hali olinadigan naqd: natijasi yoʻq naqd toʻlovli bekatlar summasi, tiyinda. */
export function cashToCollect(trip: TripDetail): bigint {
  return trip.stops.filter((s) => !s.outcome && s.paymentType === "CASH").reduce((sum, s) => sum + toTiyin(s.total), 0n);
}

/** Bekatda olinadigan summa: naqd boʻlsa — buyurtma summasi, aks holda — 0. */
export function stopToCollect(stop: TripStop): bigint {
  return stop.paymentType === "CASH" ? toTiyin(stop.total) : 0n;
}

/** Qoʻngʻiroq uchun telefon: faqat raqamlar va boshidagi «+». */
export function telUri(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

/** Xarita: manzil boʻyicha navigatsiya (Google/Yandex — telefon tanlaydi). */
export function mapUri(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  return `geo:0,0?q=${encodeURIComponent(address.trim())}`;
}

/** Reys yakuni: naqd toʻlovli yetkazilgan/qisman bekatlardan olinishi kerak (qisman — qaytgan qism ayirilgan). */
export function cashDue(trip: TripDetail): bigint {
  return trip.stops
    .filter((s) => s.paymentType === "CASH" && (s.outcome === "DELIVERED" || s.outcome === "PARTIAL"))
    .reduce((sum, s) => sum + toTiyin(s.total) - (s.outcome === "PARTIAL" ? toTiyin(s.returnTotal) : 0n), 0n);
}

export function outcomeCounts(trip: TripDetail): { delivered: number; partial: number; undelivered: number } {
  const c = { delivered: 0, partial: 0, undelivered: 0 };
  for (const s of trip.stops) {
    if (s.outcome === "DELIVERED") c.delivered++;
    if (s.outcome === "PARTIAL") c.partial++;
    if (s.outcome === "UNDELIVERED") c.undelivered++;
  }
  return c;
}
