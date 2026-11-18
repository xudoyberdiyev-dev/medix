"use client";

import { useSyncExternalStore } from "react";

/**
 * U14: skanerlashda ovoz va tebranish (toʻgʻri — qisqa baland ovoz + qisqa tebranish; xato — past uzun ovoz + ikki marta tebranish).
 * Qurilma sozlamasi (Profil → «Skanerlash ovozi»): brauzer xotirasida, standart — yoqilgan.
 */
export const SCAN_FEEDBACK_KEY = "yuzplus.scanFeedback";
const EVENT = "yuzplus:scan-feedback";

export function scanFeedbackEnabled(): boolean {
  try {
    return window.localStorage.getItem(SCAN_FEEDBACK_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setScanFeedback(on: boolean): void {
  try {
    window.localStorage.setItem(SCAN_FEEDBACK_KEY, on ? "on" : "off");
  } catch {
    // xotira yoʻq — faqat shu sahifada
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useScanFeedbackPref(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    scanFeedbackEnabled,
    () => true,
  );
}

/** Tebranish naqshi: toʻgʻri — 40 ms, xato — 80-60-80 ms. */
export function vibrationPattern(ok: boolean): number | number[] {
  return ok ? 40 : [80, 60, 80];
}

export function scanFeedback(ok: boolean): void {
  if (!scanFeedbackEnabled()) return;
  try {
    navigator.vibrate?.(vibrationPattern(ok));
  } catch {
    // tebranish ixtiyoriy
  }
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1200 : 220;
    osc.type = ok ? "sine" : "square";
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.6));
    osc.onended = () => void ctx.close();
  } catch {
    // ovoz ixtiyoriy
  }
}
