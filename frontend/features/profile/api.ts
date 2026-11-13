"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf, ME_QUERY_KEY } from "@/features/auth/session";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Profile = components["schemas"]["Profile"];

const KEY = ["profile"] as const;

export function useProfile() {
  return useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/profile")) });
}

export type ProfileForm = {
  last: string;
  first: string;
  mid: string;
  login: string;
  phone: string;
  email: string;
  position: string;
  birth: string;
};
export type ProfileErrorKey = "last" | "first" | "login" | "phone" | "email" | "birth";

/** Profil maʼlumotlaridan tahrirlash shakli (eski yozuvlarda — F.I.Sh. qismlari toʻliq ismdan). */
export function profileForm(p: Profile): ProfileForm {
  const parts = p.fullName.trim().split(/\s+/);
  return {
    last: p.lastName ?? (parts.length > 1 ? parts.slice(1).join(" ") : ""),
    first: p.firstName ?? parts[0] ?? "",
    mid: p.middleName ?? "",
    login: p.login,
    phone: p.phone ?? "",
    email: p.email ?? "",
    position: p.position ?? "",
    birth: formatIsoDate(p.birthDate),
  };
}

const LOGIN_RE = /^[A-Za-z0-9._-]{3,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS = /^\+998\d{9}$/;

/** Shakl tekshiruvi (server ham tekshiradi). `today` — ISO (YYYY-MM-DD), tugʻilgan sana undan oldin boʻlsin. */
export function checkProfile(f: ProfileForm, today: string): ProfileErrorKey[] {
  const e: ProfileErrorKey[] = [];
  if (!f.last.trim()) e.push("last");
  if (!f.first.trim()) e.push("first");
  if (!LOGIN_RE.test(f.login.trim())) e.push("login");
  const phone = f.phone.replace(/[\s()-]/g, "");
  if (phone && phone !== "+998" && !PHONE_DIGITS.test(phone)) e.push("phone");
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.push("email");
  const birth = parseUzDate(f.birth);
  if (birth === null || (birth && birth >= today)) e.push("birth");
  return e;
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: ProfileForm) => {
      await ensureCsrf();
      const phone = f.phone.replace(/[\s()-]/g, "");
      return unwrap(
        api.PUT("/api/profile", {
          body: {
            login: f.login.trim().toLowerCase(),
            lastName: f.last.trim(),
            firstName: f.first.trim(),
            middleName: f.mid.trim() || undefined,
            phone: phone && phone !== "+998" ? f.phone.trim() : undefined,
            email: f.email.trim() || undefined,
            position: f.position.trim() || undefined,
            birthDate: parseUzDate(f.birth) ?? undefined,
          },
        }),
      );
    },
    onSuccess: (p) => {
      qc.setQueryData(KEY, p);
      // Topbar, sidebar va xodimlar roʻyxatidagi ism darhol yangilansin
      void qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useSetPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { currentPassword: string; pin: string }) => {
      await ensureCsrf();
      await unwrap(api.PUT("/api/profile/pin", { body }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * PIN shakli tekshiruvi (server ham tekshiradi): 4–6 raqam, 1111 / 1234 / 4321 kabi oson emas, takrori mos.
 * Xato boʻlsa — `profile.pin.errors.<kalit>`.
 */
export type PinErrorKey = "format" | "easy" | "mismatch";

export function validatePin(pin: string, repeat: string): { pin?: PinErrorKey; repeat?: PinErrorKey } {
  if (!/^\d{4,6}$/.test(pin)) return { pin: "format" };
  const digits = [...pin].map(Number);
  const same = digits.every((d) => d === digits[0]);
  const up = digits.every((d, i) => i === 0 || d - digits[i - 1] === 1);
  const down = digits.every((d, i) => i === 0 || d - digits[i - 1] === -1);
  if (same || up || down) return { pin: "easy" };
  if (pin !== repeat) return { repeat: "mismatch" };
  return {};
}

export type SessionInfo = components["schemas"]["SessionInfo"];
export type MyAction = components["schemas"]["AuditRow"];

const SESSIONS = ["profile", "sessions"] as const;

/** Faol sessiyalarim (joriysi birinchi). */
export function useMySessions() {
  return useQuery({ queryKey: SESSIONS, queryFn: () => unwrap(api.GET("/api/profile/sessions")) });
}

export function useEndOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      return unwrap(api.POST("/api/profile/sessions/end-others"));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SESSIONS });
      void qc.invalidateQueries({ queryKey: ["profile", "actions"] });
    },
  });
}

/** Mening harakatlarim — oxirgi 10 ta (audit jurnalidan, kirishlarsiz). */
export function useMyActions() {
  return useQuery({ queryKey: ["profile", "actions"], queryFn: () => unwrap(api.GET("/api/audit/mine")) });
}

export interface DeviceInfo {
  browser: string | null;
  os: string | null;
  mobile: boolean;
}

/** User-Agent → brauzer va tizim (qisqa). Nomaʼlum boʻlsa — null. */
export function describeDevice(ua: string | null | undefined): DeviceInfo {
  if (!ua) return { browser: null, os: null, mobile: false };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /YaBrowser/.test(ua)
        ? "Yandex"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  return { browser, os, mobile: /Mobile|iPhone|Android/.test(ua) };
}
