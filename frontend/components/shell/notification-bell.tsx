"use client";

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { LIVE_POLL_MS, useLive } from "@/lib/live";

const KEY = ["notifications"] as const;

/** Bildirishnomalar (TopBar): oʻqilmaganlar soni, oxirgi 50 ta, oʻqildi belgisi. Real vaqtda (SSE) yangilanadi. */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const live = useLive(["notifications"], () => void qc.invalidateQueries({ queryKey: KEY }), Boolean(me.data));
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(api.GET("/api/notifications")),
    enabled: Boolean(me.data),
    refetchInterval: live ? LIVE_POLL_MS : 60_000,
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
        aria-label={unread > 0 ? t("unread", { count: unread }) : t("title")}
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
            <span className="text-subtitle">{t("title")}</span>
            {unread > 0 ? (
              <button type="button" className="text-primary hover:underline" onClick={() => read.mutate("all")}>
                {t("markAll")}
              </button>
            ) : null}
          </div>
          {list.error ? (
            <p className="px-4 py-6 text-center text-text-secondary">{t("loadError")}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-text-secondary">
              <BellOff size={20} strokeWidth={1.5} aria-hidden />
              <span>{t("empty")}</span>
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
