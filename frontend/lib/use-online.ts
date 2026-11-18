"use client";

import { useSyncExternalStore } from "react";

/** Brauzer internetga ulanganmi (`navigator.onLine`); server renderda — `true`. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Tarmoq xatosimi (fetch umuman yetib bormadi) — server javobi (4xx/5xx) emas. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
}
