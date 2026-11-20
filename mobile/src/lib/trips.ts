import { api } from "./api";
import type { TripDetail, TripSummary } from "./trip-view";

// Haydovchi reysi (backend: /api/trips/mine…, ruxsat trip.driver). Faol reys yoʻq — 204 → null.
export async function myTrip(): Promise<TripDetail | null> {
  return (await api<TripDetail | undefined>("/api/trips/mine")) ?? null;
}

export function myHistory(): Promise<TripSummary[]> {
  return api<TripSummary[]>("/api/trips/mine/history");
}

export function acceptLoad(tripId: number, stopId: number, places: number): Promise<TripDetail> {
  return api<TripDetail>(`/api/trips/${tripId}/stops/${stopId}/load`, { method: "POST", body: { places } });
}

export function startTrip(tripId: number): Promise<{ sales: string[] }> {
  return api<{ sales: string[] }>(`/api/trips/${tripId}/start`, { method: "POST" });
}
