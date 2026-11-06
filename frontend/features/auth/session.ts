"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { CSRF_COOKIE, CSRF_HEADER, readCookie } from "@/lib/api/csrf";
import type { components } from "@/lib/api/schema";

export type Me = components["schemas"]["MeResponse"];

export const ME_QUERY_KEY = ["auth", "me"] as const;

/** XSRF-TOKEN cookie'sini o'rnatadi (login va boshqa POST'lardan oldin bir marta). */
export async function ensureCsrf(): Promise<void> {
  if (typeof document !== "undefined" && readCookie(document.cookie, CSRF_COOKIE)) return;
  await unwrap(api.GET("/api/auth/csrf"));
}

/** Logout Spring Security filtri — OpenAPI'da yo'q, shuning uchun oddiy fetch. */

/** Joriy foydalanuvchi. 401 — sessiya yo'q (xato sifatida qaytadi, qayta urinilmaydi). */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => unwrap(api.GET("/api/auth/me")),
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { login: string; password: string }) => {
      await ensureCsrf();
      return unwrap(api.POST("/api/auth/login", { body }));
    },
    onSuccess: (me) => qc.setQueryData(ME_QUERY_KEY, me),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      await ensureCsrf();
      await unwrap(api.POST("/api/auth/password", { body }));
    },
    // Keshni darhol yangilaymiz: aks holda AuthGate eski `mustChangePassword` ni koʻrib, /password ga qaytaradi.
    onSuccess: () => {
      qc.setQueryData<Me>(ME_QUERY_KEY, (me) => (me ? { ...me, mustChangePassword: false } : me));
      return qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: csrfHeader(),
      });
      if (!res.ok && res.status !== 401) throw new Error("logout");
    },
    onSettled: () => qc.clear(),
  });
}

function csrfHeader(): Record<string, string> {
  const token = readCookie(document.cookie, CSRF_COOKIE);
  return token ? { [CSRF_HEADER]: token } : {};
}

/** Login sahifasidan keyin qaytish uchun xavfsiz ichki yo'l (ochiq yo'naltirishdan himoya). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/";
  return next;
}
