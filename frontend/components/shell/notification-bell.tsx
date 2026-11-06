"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

const KEY = ["notifications"] as const;

/** SSE ulangan boʻlsa — soʻrov faqat zaxira (5 daqiqa), ulanmagan boʻlsa — har daqiqada. */
export const POLL_LIVE_MS = 300_000;
export const POLL_FALLBACK_MS = 60_000;
export const STREAM_URL = "/api/notifications/stream";

/**
 * Bildirishnomalar real vaqtda (SPEC 10, SSE): «notifications» hodisasi kelsa roʻyxat qayta olinadi.
 * Ulanish uzilsa brauzer oʻzi qayta ulanadi; shu orada har daqiqalik soʻrov ishlaydi. Qaytaradi: ulanganmi.
 */
export function useNotificationStream(enabled: boolean, onChanged: () => void): boolean {
  const [live, setLive] = useState(false);
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  }, [onChanged]);
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const es = new EventSource(STREAM_URL, { withCredentials: true });
    const onReady = () => {
      setLive(true);
      // Uzilish paytida kelganlari ham koʻrinsin.
      changed.current();
    };
    const onNotify = () => changed.current();
    es.addEventListener("ready", onReady);
    es.addEventListener("notifications", onNotify);
    es.onerror = () => setLive(false);
    return () => {
      es.removeEventListener("ready", onReady);
      es.removeEventListener("notifications", onNotify);
      es.close();
      setLive(false);
    };
  }, [enabled]);
  return live;
}

/** Bildirishnomalar (TopBar): oʻqilmaganlar soni, oxirgi 50 ta, oʻqildi belgisi. Real vaqtda (SSE) yangilanadi. */
export function NotificationBell() {
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const live = useNotificationStream(Boolean(me.data), () => void qc.invalidateQueries({ queryKey: KEY }));
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(api.GET("/api/notifications")),
    enabled: Boolean(me.data),
    refetchInterval: live ? POLL_LIVE_MS : POLL_FALLBACK_MS,
  });
  const read = useMutation({
    mutationFn: async (id: number | "all") => {
      await ensureCsrf();
      if (id === "all") await api.POST("/api/notifications/read-all");
      else await api.POST("/api/notifications/{id}/read", { params: { path: { id } } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const unread = list.data?.unread ?? 0;
  const items = list.data?.items ?? [];
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Bildirishnomalar: ${unread} ta oʻqilmagan` : "Bildirishnomalar"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-control-md items-center justify-center rounded-control hover:bg-background"
      >
        <Bell size={20} strokeWidth={1.5} aria-hidden />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 min-w-4 rounded-full bg-danger px-1 text-center text-caption leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-96 rounded-card border border-border bg-surface shadow-overlay">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-subtitle">Bildirishnomalar</span>
            {unread > 0 ? (
              <button type="button" className="text-primary hover:underline" onClick={() => read.mutate("all")}>
                Hammasini oʻqildi deb belgilash
              </button>
            ) : null}
          </div>
          {list.error ? (
            <p className="px-4 py-6 text-center text-text-secondary">Bildirishnomalarni yuklab boʻlmadi. Birozdan keyin qayta oching.</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-text-secondary">
              <BellOff size={20} strokeWidth={1.5} aria-hidden />
              <span>Hozircha bildirishnoma yoʻq</span>
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className={cn("border-b border-border last:border-b-0", !n.readAt && "bg-background")}>
                  <Link
                    href={n.link ?? "#"}
                    onClick={() => (!n.readAt && read.mutate(n.id), setOpen(false))}
                    className="flex flex-col gap-1 px-4 py-3 hover:bg-background"
                  >
                    <span className={cn(!n.readAt && "font-medium")}>{n.title}</span>
                    {n.body ? <span className="text-caption text-text-secondary">{n.body}</span> : null}
                    <span className="text-caption text-text-disabled">{formatDateTime(new Date(n.createdAt))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
