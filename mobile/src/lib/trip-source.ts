import { applyQueue } from "./queue-core";
import { flush, isNetworkError, pending, readJson, writeJson } from "./queue";
import { myTrip } from "./trips";
import type { TripDetail } from "./trip-view";

// Reys maʼlumoti manbai (M5): avval navbatni yuboradi, keyin serverdan oladi va telefonda saqlaydi;
// internet yoʻq boʻlsa — oxirgi saqlangan reys. Har ikki holatda navbatdagi amallar ustiga qoʻyiladi.
const CACHE = "reys.json";
let offline = false;

export function isOffline(): boolean {
  return offline;
}

export async function loadTrip(): Promise<TripDetail | null> {
  await flush();
  let trip: TripDetail | null;
  try {
    trip = await myTrip();
    offline = false;
    await writeJson(CACHE, trip);
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    offline = true;
    trip = await readJson<TripDetail | null>(CACHE, null);
    if (!trip) throw e;
  }
  return trip ? applyQueue(trip, await pending()) : null;
}
