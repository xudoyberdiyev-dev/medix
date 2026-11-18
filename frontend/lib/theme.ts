"use client";

import { useCallback, useSyncExternalStore } from "react";
import { LEGACY_THEME_KEY as LEGACY_KEY, THEME_KEY } from "./theme-init";

/**
 * O24 — yorugʻ / qorongʻi / tizim boʻyicha mavzu. Tanlov `localStorage` da; `<html>` ga `theme-dark` sinfi va
 * `data-theme` qoʻyiladi. Yuklanishda «oq chaqnash» boʻlmasligi uchun `THEME_INIT_SCRIPT` <head> da gidratatsiyadan oldin ishlaydi.
 */
export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export { THEME_KEY };
const EVENT = "yuzplus-theme-change";

export function isThemePref(v: unknown): v is ThemePref {
  return v === "light" || v === "dark" || v === "system";
}

export function readThemePref(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (isThemePref(v)) return v;
  } catch {
    // saqlash ruxsat etilmagan — tizim boʻyicha
  }
  return "system";
}

/** Shu brauzerda aniq tanlov bormi (yoʻq boʻlsa — profil (server) tanlovi qoʻllanadi, O24). */
export function hasStoredThemePref(): boolean {
  try {
    return isThemePref(window.localStorage.getItem(THEME_KEY));
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

function systemDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref, systemDark());
  const root = document.documentElement;
  root.classList.toggle("theme-dark", resolved === "dark");
  root.dataset.theme = resolved;
  return resolved;
}

export function setThemePref(pref: ThemePref) {
  try {
    window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    // eʼtiborsiz — joriy oynada baribir qoʻllanadi
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const onSystem = () => {
    if (readThemePref() === "system") applyTheme("system");
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) {
      applyTheme(readThemePref());
      cb();
    }
  };
  mq?.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, cb);
  return () => {
    mq?.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, cb);
  };
}

const snapshot = () => `${readThemePref()}:${systemDark() ? "dark" : "light"}`;
const serverSnapshot = () => "system:light";

/** Joriy tanlov va amaldagi mavzu; `toggle` — yorugʻ ↔ qorongʻi (topbar va kirish sahifasi tugmasi). */
export function useTheme() {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [prefRaw, sys] = snap.split(":");
  const pref: ThemePref = isThemePref(prefRaw) ? prefRaw : "system";
  const resolved = resolveTheme(pref, sys === "dark");
  const toggle = useCallback(() => setThemePref(resolved === "dark" ? "light" : "dark"), [resolved]);
  return { pref, resolved, setPref: setThemePref, toggle };
}
