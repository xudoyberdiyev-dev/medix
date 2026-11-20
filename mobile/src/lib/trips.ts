import { api } from "./api";
import type { components } from "./api-schema";
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

export type SaleLine = components["schemas"]["SaleLine"];

/** Yetkazish rasmi (kamida 1 ta majburiy) yoki mijoz imzosi (signature=true). JPEG, ≤ 5 MB. */
export function uploadPhoto(tripId: number, stopId: number, uri: string, signature = false): Promise<{ id: number }> {
  const form = new FormData();
  // React Native FormData fayl: { uri, name, type }
  form.append("file", { uri, name: signature ? "imzo.png" : "rasm.jpg", type: signature ? "image/png" : "image/jpeg" } as unknown as Blob);
  return api<{ id: number }>(`/api/trips/${tripId}/stops/${stopId}/photos${signature ? "?signature=true" : ""}`, { method: "POST", body: form });
}

export function deliver(tripId: number, stopId: number, cash: string | null): Promise<TripDetail> {
  return api<TripDetail>(`/api/trips/${tripId}/stops/${stopId}/deliver`, { method: "POST", body: { cash } });
}

export function undeliver(tripId: number, stopId: number, reason: string): Promise<TripDetail> {
  return api<TripDetail>(`/api/trips/${tripId}/stops/${stopId}/undeliver`, { method: "POST", body: { reason } });
}

export function stopLines(tripId: number, stopId: number): Promise<SaleLine[]> {
  return api<SaleLine[]>(`/api/trips/${tripId}/stops/${stopId}/lines`);
}

export function partial(tripId: number, stopId: number, reason: string, lines: { saleLineId: number; qty: number }[], cash: string | null): Promise<TripDetail> {
  return api<TripDetail>(`/api/trips/${tripId}/stops/${stopId}/partial`, { method: "POST", body: { reason, lines, cash } });
}

/** «Reysni yakunlash»: qaytgan tovar yoki naqd boʻlsa — RETURN_WAIT, aks holda DONE. */
export function finishTrip(tripId: number): Promise<{ status: TripDetail["status"] }> {
  return api<{ status: TripDetail["status"] }>(`/api/trips/${tripId}/finish`, { method: "POST" });
}
