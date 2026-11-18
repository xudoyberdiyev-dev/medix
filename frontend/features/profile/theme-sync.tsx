"use client";

import { useEffect, useRef } from "react";
import { hasStoredThemePref, isThemePref, setThemePref, useTheme, type ThemePref } from "@/lib/theme";
import { useProfile, useSaveTheme } from "./api";

/**
 * O24 — mavzu tanlovi profil bilan sinxron: yangi qurilmada (brauzerda tanlov yoʻq) profildagi mavzu qoʻllanadi;
 * shu brauzerda tanlansa — profilga saqlanadi (boshqa qurilmalarda ham shunday ochiladi).
 */
export function ThemeSync() {
  const profile = useProfile();
  const { pref } = useTheme();
  const sent = useRef<ThemePref | null>(null);
  const save = useSaveTheme();
  const server = profile.data?.theme;
  const { mutate } = save;
  useEffect(() => {
    if (!isThemePref(server) || pref === server) return;
    if (!hasStoredThemePref()) {
      setThemePref(server);
      return;
    }
    if (sent.current === pref) return;
    sent.current = pref;
    mutate(pref);
  }, [server, pref, mutate]);
  return null;
}
