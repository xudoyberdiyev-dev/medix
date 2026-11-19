"use client";

import { useSyncExternalStore } from "react";

/**
 * O25: yigʻishdan oldingi ombor fakturasida seriya/muddat FEFO boʻyicha koʻrsatilsinmi.
 * «ask» — har safar soʻraladi (standart); «yes»/«no» — «Har safar soʻralmasin» bilan eslab qolingan tanlov.
 * Foydalanuvchi boʻyicha, brauzer xotirasida; Profil → «Fakturada partiya» da qayta yoqiladi.
 */
export type FefoPref = "ask" | "yes" | "no";

const EVENT = "yuzplus:fefo-invoice";

export function fefoPrefKey(userId: number): string {
  return `yuzplus.fefoInvoice.${userId}`;
}

export function parseFefoPref(v: string | null): FefoPref {
  return v === "yes" || v === "no" ? v : "ask";
}

export function getFefoPref(userId: number | undefined): FefoPref {
  if (userId == null) return "ask";
  try {
    return parseFefoPref(window.localStorage.getItem(fefoPrefKey(userId)));
  } catch {
    return "ask";
  }
}

export function setFefoPref(userId: number | undefined, pref: FefoPref): void {
  if (userId == null) return;
  try {
    if (pref === "ask") window.localStorage.removeItem(fefoPrefKey(userId));
    else window.localStorage.setItem(fefoPrefKey(userId), pref);
  } catch {
    // xotira yoʻq — har safar soʻraladi
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useFefoPref(userId: number | undefined): FefoPref {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => getFefoPref(userId),
    () => "ask",
  );
}

/** Fakturani yuklab olish manzili: FEFO faqat ombor turlarida va tanlangan boʻlsa. */
export function withFefo(url: string, fefo: boolean): string {
  if (!fefo) return url;
  return `${url}${url.includes("?") ? "&" : "?"}fefo=true`;
}
