"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { LIVE_POLL_MS, useLive } from "@/lib/live";

/** O12: ichki xabarlar va topshiriqlar. Real vaqt — SSE «messages» hodisasi; ulanmasa — 10 s soʻrov. */
export type ThreadSummary = components["schemas"]["ThreadSummary"];
export type ThreadDetail = components["schemas"]["ThreadDetail"];
export type MessageItem = components["schemas"]["MessageItem"];
export type Person = components["schemas"]["Person"];
export type Recipients = components["schemas"]["Recipients"];
export type TaskItem = components["schemas"]["TaskItem"];
export type Assignee = components["schemas"]["Assignee"];
export type MessageFile = components["schemas"]["MessageFile"];
export type FileInfo = components["schemas"]["FileInfo"];
export type TaskStatus = Assignee["status"];
export type Audience = ThreadSummary["audience"];
export type TaskScope = "MINE" | "GIVEN";
export type SendBody = components["schemas"]["SendRequest"];
export type NewThreadBody = components["schemas"]["NewThreadRequest"];

export const MESSAGES_USE = "messages.use";
export const MESSAGES_BROADCAST = "messages.broadcast";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 10;
export const EDIT_WINDOW_MS = 15 * 60_000;
const FALLBACK_POLL_MS = 10_000;

const KEY = ["messages"] as const;

/** SSE «messages» kelganda barcha xabar soʻrovlari yangilanadi. Qaytaradi: soʻrov oraligʻi. */
export function useMessagesLive(enabled = true): number {
  const qc = useQueryClient();
  const live = useLive(["messages"], () => void qc.invalidateQueries({ queryKey: KEY }), enabled);
  return live ? LIVE_POLL_MS : FALLBACK_POLL_MS;
}

export function useUnread(enabled: boolean) {
  const interval = useMessagesLive(enabled);
  return useQuery({
    queryKey: [...KEY, "unread"],
    queryFn: () => unwrap(api.GET("/api/messages/unread")),
    enabled,
    refetchInterval: interval,
  });
}

export function useThreads(q: string) {
  const interval = useMessagesLive();
  return useQuery({
    queryKey: [...KEY, "threads", q],
    queryFn: () => unwrap(api.GET("/api/messages/threads", { params: { query: { q: q.trim() || undefined } } })),
    placeholderData: keepPreviousData,
    refetchInterval: interval,
  });
}

export function useThread(id: number | null) {
  const interval = useMessagesLive(id != null);
  return useQuery({
    queryKey: [...KEY, "thread", id],
    queryFn: () => unwrap(api.GET("/api/messages/threads/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id != null,
    refetchInterval: interval,
  });
}

export async function olderMessages(id: number, before: number): Promise<ThreadDetail> {
  return unwrap(api.GET("/api/messages/threads/{id}", { params: { path: { id }, query: { before } } }));
}

export function useRecipients(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "recipients"],
    queryFn: () => unwrap(api.GET("/api/messages/recipients")),
    enabled,
    staleTime: 60_000,
  });
}

export function useTasks(scope: TaskScope, status: TaskStatus | null, overdue: boolean) {
  const interval = useMessagesLive();
  return useQuery({
    queryKey: [...KEY, "tasks", scope, status, overdue],
    queryFn: () => unwrap(api.GET("/api/messages/tasks", { params: { query: { scope, status: status ?? undefined, overdue } } })),
    placeholderData: keepPreviousData,
    refetchInterval: interval,
  });
}

export function useReads(messageId: number | null) {
  return useQuery({
    queryKey: [...KEY, "reads", messageId],
    queryFn: () => unwrap(api.GET("/api/messages/{messageId}/reads", { params: { path: { messageId: messageId ?? 0 } } })),
    enabled: messageId != null,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useStartThread() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (body: NewThreadBody) => {
      await ensureCsrf();
      return unwrap(api.POST("/api/messages/threads", { body }));
    },
    onSuccess: done,
  });
}

export function useSend(threadId: number) {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (body: SendBody) => {
      await ensureCsrf();
      return unwrap(api.POST("/api/messages/threads/{id}/messages", { params: { path: { id: threadId } }, body }));
    },
    onSuccess: done,
  });
}

export async function markRead(threadId: number, upToMessageId: number) {
  await ensureCsrf();
  await api.POST("/api/messages/threads/{id}/read", { params: { path: { id: threadId } }, body: { upToMessageId } });
}

export function useEditMessage() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: number; body: string }) => {
      await ensureCsrf();
      return unwrap(api.PATCH("/api/messages/{messageId}", { params: { path: { messageId: v.id } }, body: { body: v.body } }));
    },
    onSuccess: done,
  });
}

export function useDeleteMessage() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (id: number) => {
      await ensureCsrf();
      return unwrap(api.DELETE("/api/messages/{messageId}", { params: { path: { messageId: id } } }));
    },
    onSuccess: done,
  });
}

export function useTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: number; status: TaskStatus }) => {
      await ensureCsrf();
      return unwrap(api.POST("/api/messages/{messageId}/status", { params: { path: { messageId: v.id } }, body: { status: v.status } }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Faylni tekshirish (serverdagi bilan bir xil): boʻsh emas, ≤ 20 MB. */
export function fileProblem(file: { size: number }): "empty" | "size" | null {
  if (file.size === 0) return "empty";
  if (file.size > MAX_FILE_BYTES) return "size";
  return null;
}

export async function uploadMessageFile(file: File): Promise<MessageFile> {
  await ensureCsrf();
  return unwrap(
    api.POST("/api/messages/files", {
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const fd = new FormData();
        fd.append("file", file);
        return fd;
      },
    }),
  );
}

export const fileUrl = (id: number, inline = false) => `/api/messages/files/${id}${inline ? "?inline=true" : ""}`;

/** Guruh topshirigʻi umumiy holati (server bilan bir xil): hammasi bekor → bekor; qolgani bajarilgan → bajarildi; aks holda eng orqadagi. */
export function overallStatus(list: readonly { status: TaskStatus }[]): TaskStatus {
  const live = list.map((a) => a.status).filter((s) => s !== "CANCELLED");
  if (live.length === 0) return "CANCELLED";
  if (live.includes("NEW")) return live.every((s) => s === "NEW") ? "NEW" : "IN_PROGRESS";
  return live.includes("IN_PROGRESS") ? "IN_PROGRESS" : "DONE";
}

/** Muddati oʻtgan: muddat bor, oʻtgan va hali bajarilmagan. */
export function isOverdue(dueAt: string | null | undefined, status: TaskStatus, now: number): boolean {
  return Boolean(dueAt) && Date.parse(dueAt as string) < now && (status === "NEW" || status === "IN_PROGRESS");
}

/** Hajm: «1,2 MB», «340 KB». */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Yangi xabar ovozi — qisqa ikki ohang (WebAudio; fayl kerak emas). Brauzer ruxsat bermasa — jim. */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.2);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    // ovoz ixtiyoriy
  }
}
