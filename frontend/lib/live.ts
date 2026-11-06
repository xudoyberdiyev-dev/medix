"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Real vaqt signallari (SPEC 10, SSE): bitta varaqda bitta `EventSource` — `/api/notifications/stream`.
 * Hodisalar: «notifications» (oʻz bildirishnomalari), «orders», «trips», «receipts» (shu filialda hujjat oʻzgardi).
 * Signalda maʼlumot yoʻq — sahifa oʻz soʻrovini qayta bajaradi. Ulanish uzilsa brauzer oʻzi qayta ulanadi;
 * qayta ulanganda («ready») barcha obunachilar chaqiriladi — uzilish paytida oʻtkazib yuborilganlar ham koʻrinsin.
 */
export const STREAM_URL = "/api/notifications/stream";
export type LiveEvent = "notifications" | "orders" | "trips" | "receipts" | "transfers";

/** SSE ulangan boʻlsa soʻrov faqat zaxira; ulanmagan boʻlsa — sahifaning odatdagi oraligʻi. */
export const LIVE_POLL_MS = 300_000;

type Handler = () => void;

const handlers = new Map<LiveEvent, Set<Handler>>();
const statusListeners = new Set<() => void>();
let source: EventSource | null = null;
let connected = false;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
/** Sahifa almashganda TopBar qayta yaratiladi — ulanish darhol yopilmaydi, yangi sahifa shu ulanishni oladi. */
export const CLOSE_DELAY_MS = 3_000;

function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  statusListeners.forEach((l) => l());
}

function fire(event: LiveEvent) {
  handlers.get(event)?.forEach((h) => h());
}

function open() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (source || typeof EventSource === "undefined") return;
  const es = new EventSource(STREAM_URL, { withCredentials: true });
  source = es;
  es.addEventListener("ready", () => {
    setConnected(true);
    handlers.forEach((set) => set.forEach((h) => h()));
  });
  for (const ev of ["notifications", "orders", "trips", "receipts", "transfers"] as const) {
    es.addEventListener(ev, () => fire(ev));
  }
  es.onerror = () => setConnected(false);
}

function idle(): boolean {
  for (const set of handlers.values()) if (set.size > 0) return false;
  return true;
}

function closeIfIdle() {
  if (!idle() || closeTimer) return;
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (!idle()) return;
    source?.close();
    source = null;
    setConnected(false);
  }, CLOSE_DELAY_MS);
}

/** Hodisaga obuna; qaytaradi — obunani bekor qilish. Oxirgi obunachi ketganda ulanish yopiladi. */
export function subscribeLive(event: LiveEvent, handler: Handler): () => void {
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(handler);
  open();
  return () => {
    set.delete(handler);
    closeIfIdle();
  };
}

/** Testlar uchun: holatni tozalash. */
export function resetLive() {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
  handlers.clear();
  source?.close();
  source = null;
  connected = false;
}

function subscribeStatus(l: () => void) {
  statusListeners.add(l);
  return () => void statusListeners.delete(l);
}

/**
 * Bir yoki bir nechta hodisaga obuna (masalan, `useLive(["orders"], () => q.refetch())`).
 * Qaytaradi: SSE ulanganmi — soʻrov oraligʻini kattalashtirish uchun (`refetchInterval: live ? LIVE_POLL_MS : 10_000`).
 */
export function useLive(events: readonly LiveEvent[], onEvent: () => void, enabled = true): boolean {
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  }, [onEvent]);
  const key = events.join(",");
  useEffect(() => {
    if (!enabled) return;
    const handler = () => cb.current();
    const offs = (key.split(",") as LiveEvent[]).map((e) => subscribeLive(e, handler));
    return () => offs.forEach((off) => off());
  }, [key, enabled]);
  const live = useSyncExternalStore(
    subscribeStatus,
    () => connected,
    () => false,
  );
  return enabled && live;
}

/** SSE ulanganmi (obuna boʻlmasdan) — sahifa soʻrov oraligʻini kattalashtirishi uchun. */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(
    subscribeStatus,
    () => connected,
    () => false,
  );
}

/**
 * Hodisa → yangilanadigan roʻyxatlar (faqat roʻyxat/panel soʻrovlari; ochiq kartochka va tahrir oynalari tegilmaydi —
 * kiritilayotgan maʼlumot yoʻqolmasin). TanStack Query faqat ekrandagi soʻrovlarni qayta oladi.
 */
export const LIVE_INVALIDATES: Record<Exclude<LiveEvent, "notifications">, readonly (readonly string[])[]> = {
  orders: [
    ["orders", "list"],
    ["orders", "monitor"],
    ["orders", "pick-queue"],
    ["orders", "returns"],
    ["marking", "queue"],
    ["trips", "ready"],
  ],
  trips: [
    ["trips", "list"],
    ["trips", "ready"],
    ["trips", "mine"],
    ["trips", "cash"],
    ["orders", "monitor"],
  ],
  receipts: [["receipts", "list"]],
  transfers: [
    ["warehouse-transfers", "list"],
    ["zone-transfers", "list"],
  ],
};
