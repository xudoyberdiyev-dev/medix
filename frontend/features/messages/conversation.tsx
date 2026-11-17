"use client";

import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Loader,
  Pencil,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import {
  fileUrl,
  formatSize,
  isOverdue,
  markRead,
  olderMessages,
  overallStatus,
  useDeleteMessage,
  useEditMessage,
  useReads,
  useSend,
  useTaskStatus,
  useThread,
  type FileInfo,
  type MessageItem,
  type TaskStatus,
} from "./api";
import { Composer } from "./composer";
import { threadAvatarName, threadTitle } from "./labels";

export const STATUS_META: Record<TaskStatus, { tone: Tone; icon: LucideIcon }> = {
  NEW: { tone: "info", icon: CircleDashed },
  IN_PROGRESS: { tone: "warning", icon: Loader },
  DONE: { tone: "success", icon: CircleCheck },
  CANCELLED: { tone: "neutral", icon: CircleX },
};

export function TaskBadge({ status }: { status: TaskStatus }) {
  const t = useTranslations("chat.status");
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {t(status)}
    </Badge>
  );
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
}

/** Suhbat: sarlavha, xabarlar (pufakchalar, fayllar, topshiriq kartasi), yozish maydoni. Ochilganda — oʻqildi. */
export function Conversation({ threadId, onBack }: { threadId: number; onBack: () => void }) {
  const t = useTranslations("chat");
  const me = useMe();
  const q = useThread(threadId);
  const send = useSend(threadId);
  const [older, setOlder] = useState<MessageItem[]>([]);
  const [hasOlder, setHasOlder] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [preview, setPreview] = useState<FileInfo | null>(null);
  const [readsOf, setReadsOf] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const myId = me.data?.id;

  const messages = useMemo(() => {
    const recent = q.data?.messages ?? [];
    const first = recent[0]?.id ?? Number.MAX_SAFE_INTEGER;
    return [...older.filter((m) => m.id < first), ...recent];
  }, [older, q.data]);
  const lastId = q.data?.messages.at(-1)?.id;
  const unread = q.data?.thread.unread ?? 0;

  useEffect(() => {
    if (lastId != null && unread > 0) void markRead(threadId, lastId).catch(() => undefined);
  }, [threadId, lastId, unread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId, threadId]);

  async function loadOlder() {
    const first = messages[0]?.id;
    if (first == null) return;
    setLoadingOlder(true);
    try {
      const page = await olderMessages(threadId, first);
      setOlder((prev) => [...page.messages, ...prev]);
      setHasOlder(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }

  if (q.isPending) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-2/3" />
      </div>
    );
  }
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const th = q.data.thread;
  const title = threadTitle(th, t);
  const group = th.kind === "GROUP";
  const more = hasOlder ?? q.data.hasMore;

  return (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Button variant="icon" icon={ArrowLeft} aria-label={t("back")} className="md:hidden" onClick={onBack} />
        <Avatar name={threadAvatarName(th, t)} decorative />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-subtitle">{title}</h2>
          {group ? (
            <p className="flex items-center gap-1 text-caption text-text-secondary">
              <Users size={14} strokeWidth={1.5} aria-hidden />
              {t("participants", { n: th.participantCount })}
            </p>
          ) : (
            <p className="truncate text-caption text-text-secondary">
              {[th.others[0]?.roleName, th.others[0]?.branchName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-4 md:px-6" data-testid="message-list">
        {more ? (
          <div className="mb-3 flex justify-center">
            <Button variant="tertiary" size="sm" loading={loadingOlder} onClick={() => void loadOlder()}>
              {t("loadOlder")}
            </Button>
          </div>
        ) : null}
        {messages.length === 0 ? <p className="py-8 text-center text-text-secondary">{t("emptyThread")}</p> : null}
        <ol className="flex flex-col gap-2">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || formatDate(new Date(prev.createdAt)) !== formatDate(new Date(m.createdAt));
            return (
              <li key={m.id} className="flex flex-col">
                {newDay ? (
                  <span className="my-2 self-center rounded-full bg-surface px-3 py-0.5 text-caption text-text-secondary">
                    {formatDate(new Date(m.createdAt))}
                  </span>
                ) : null}
                <Bubble
                  m={m}
                  mine={m.senderId === myId}
                  showSender={group && m.senderId !== myId && prev?.senderId !== m.senderId}
                  group={group}
                  myId={myId}
                  onPreview={setPreview}
                  onReads={setReadsOf}
                />
              </li>
            );
          })}
        </ol>
        <div ref={bottomRef} />
      </div>
      <Composer
        key={threadId}
        pending={send.isPending}
        onSend={(body) =>
          send.mutateAsync(body).catch((e: unknown) => {
            toast({ tone: "danger", title: errorText(e, t("sendFailed")) });
            throw e;
          })
        }
      />
      <ImagePreview file={preview} onClose={() => setPreview(null)} />
      <ReadsModal messageId={readsOf} onClose={() => setReadsOf(null)} />
    </section>
  );
}

function Bubble({
  m,
  mine,
  showSender,
  group,
  myId,
  onPreview,
  onReads,
}: {
  m: MessageItem;
  mine: boolean;
  showSender: boolean;
  group: boolean;
  myId: number | undefined;
  onPreview: (f: FileInfo) => void;
  onReads: (id: number) => void;
}) {
  const t = useTranslations("chat");
  const edit = useEditMessage();
  const del = useDeleteMessage();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleted = Boolean(m.deletedAt);
  const allRead = m.recipientCount > 0 && m.readCount >= m.recipientCount;

  return (
    <div className={cn("flex max-w-[min(36rem,88%)] flex-col gap-1", mine ? "self-end items-end" : "self-start items-start")}>
      {showSender ? <span className="px-1 text-caption text-text-secondary">{m.senderName}</span> : null}
      <div
        className={cn(
          "group relative flex flex-col gap-2 rounded-card border px-3 py-2",
          mine ? "border-primary-soft bg-primary-soft" : "border-border bg-surface",
          deleted && "border-dashed bg-transparent text-text-secondary italic",
        )}
      >
        {deleted ? (
          <span className="flex items-center gap-1">
            <Trash2 size={14} strokeWidth={1.5} aria-hidden />
            {t("deleted")}
          </span>
        ) : (
          <>
            {m.kind === "TASK" ? <TaskCard m={m} mine={mine} myId={myId} /> : null}
            {editing ? (
              <div className="flex flex-col gap-2">
                <label className="sr-only" htmlFor={`edit-${m.id}`}>
                  {t("edit")}
                </label>
                <textarea
                  id={`edit-${m.id}`}
                  value={draft}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-20 w-72 max-w-full rounded-control border border-border bg-surface px-3 py-2 text-body"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                    {t("cancelEdit")}
                  </Button>
                  <Button
                    size="sm"
                    loading={edit.isPending}
                    onClick={() =>
                      edit.mutate(
                        { id: m.id, body: draft },
                        {
                          onSuccess: () => setEditing(false),
                          onError: (e) => toast({ tone: "danger", title: errorText(e, t("saveFailed")) }),
                        },
                      )
                    }
                  >
                    {t("saveEdit")}
                  </Button>
                </div>
              </div>
            ) : m.body ? (
              <p className={cn("break-words whitespace-pre-wrap", m.kind === "TASK" && "text-text-secondary")}>{m.body}</p>
            ) : null}
            {m.files.length > 0 ? <Files files={m.files} onPreview={onPreview} /> : null}
          </>
        )}
        <span className="flex items-center justify-end gap-1 text-caption text-text-secondary">
          {m.editedAt && !deleted ? <span>{t("edited")}</span> : null}
          <time dateTime={m.createdAt} title={formatDateTime(new Date(m.createdAt))}>
            {formatTime(new Date(m.createdAt))}
          </time>
          {mine && !deleted ? (
            group ? (
              <button
                type="button"
                onClick={() => onReads(m.id)}
                className={cn("flex items-center gap-0.5 rounded-control px-1 hover:bg-surface", allRead && "text-primary")}
                aria-label={t("readBy", { n: m.readCount, total: m.recipientCount })}
              >
                {allRead ? <CheckCheck size={14} strokeWidth={1.5} aria-hidden /> : <Check size={14} strokeWidth={1.5} aria-hidden />}
                {m.readCount}/{m.recipientCount}
              </button>
            ) : (
              <span className={cn(allRead && "text-primary")} aria-label={allRead ? t("read") : t("sent")} role="img">
                {allRead ? <CheckCheck size={14} strokeWidth={1.5} aria-hidden /> : <Check size={14} strokeWidth={1.5} aria-hidden />}
              </span>
            )
          ) : null}
        </span>
        {m.editable && !editing ? (
          <div className="absolute -top-3 right-2 hidden gap-1 rounded-control border border-border bg-surface p-0.5 shadow-overlay group-focus-within:flex group-hover:flex">
            <Button
              variant="icon"
              size="sm"
              icon={Pencil}
              aria-label={t("edit")}
              onClick={() => (setDraft(m.body ?? ""), setEditing(true))}
            />
            {m.kind === "MESSAGE" ? (
              <Button variant="icon" size="sm" icon={Trash2} aria-label={t("delete")} onClick={() => setConfirmDelete(true)} />
            ) : null}
          </div>
        ) : null}
      </div>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("deleteTitle")}
        size="sm"
        tone="danger"
        primaryAction={{
          label: t("delete"),
          loading: del.isPending,
          onClick: () =>
            del.mutate(m.id, {
              onSuccess: () => setConfirmDelete(false),
              onError: (e) => toast({ tone: "danger", title: errorText(e, t("saveFailed")) }),
            }),
        }}
        secondaryAction={{ label: t("back"), onClick: () => setConfirmDelete(false) }}
      >
        <p>{t("deleteHint")}</p>
      </Modal>
    </div>
  );
}

function Files({ files, onPreview }: { files: FileInfo[]; onPreview: (f: FileInfo) => void }) {
  const t = useTranslations("chat");
  const images = files.filter((f) => f.image);
  const docs = files.filter((f) => !f.image);
  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPreview(f)}
              aria-label={t("openImage", { name: f.fileName })}
              className="overflow-hidden rounded-control border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- himoyalangan API fayli (cookie bilan), optimallashtirish kerak emas */}
              <img src={fileUrl(f.id, true)} alt={f.fileName} className="h-32 w-auto max-w-56 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
      {docs.map((f) => (
        <a
          key={f.id}
          href={fileUrl(f.id)}
          download={f.fileName}
          className="flex items-center gap-2 rounded-control border border-border bg-surface px-2 py-1.5 hover:border-text-disabled"
        >
          <FileText size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-table">{f.fileName}</span>
            <span className="text-caption text-text-secondary">{formatSize(f.sizeBytes)}</span>
          </span>
          <Download size={16} strokeWidth={1.5} aria-label={t("download")} />
        </a>
      ))}
    </div>
  );
}

function TaskCard({ m, mine, myId }: { m: MessageItem; mine: boolean; myId: number | undefined }) {
  const t = useTranslations("chat");
  const status = useTaskStatus();
  const [now] = useState(() => Date.now());
  const my = m.assignees.find((a) => a.employeeId === myId);
  const overall = overallStatus(m.assignees);
  const shown = my?.status ?? overall;
  const overdue = isOverdue(m.dueAt, shown, now);
  const set = (s: TaskStatus) =>
    status.mutate({ id: m.id, status: s }, { onError: (e) => toast({ tone: "danger", title: errorText(e, t("saveFailed")) }) });

  return (
    <div className="flex min-w-60 flex-col gap-2" data-testid="task-card">
      <div className="flex items-start gap-2">
        <ClipboardList size={18} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-caption text-text-secondary">{t("task")}</p>
          <p className="font-medium break-words">{m.taskTitle}</p>
        </div>
        <TaskBadge status={shown} />
      </div>
      {m.dueAt ? (
        <p className={cn("flex items-center gap-1 text-table", overdue ? "text-danger" : "text-text-secondary")}>
          <Clock size={14} strokeWidth={1.5} aria-hidden />
          {t("dueAt", { date: formatDateTime(new Date(m.dueAt)) })}
          {overdue ? <span className="font-medium"> · {t("overdue")}</span> : null}
        </p>
      ) : null}
      {m.assignees.length > 1 || mine ? (
        <ul className="flex flex-col gap-1 rounded-control bg-background p-2" aria-label={t("assignees")}>
          {m.assignees.map((a) => (
            <li key={a.employeeId} className="flex items-center justify-between gap-2 text-table">
              <span className="truncate">{a.fullName}</span>
              <TaskBadge status={a.status} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {my?.status === "NEW" ? (
          <Button variant="secondary" size="sm" icon={Loader} loading={status.isPending} onClick={() => set("IN_PROGRESS")}>
            {t("start")}
          </Button>
        ) : null}
        {my && (my.status === "NEW" || my.status === "IN_PROGRESS") ? (
          <Button variant="secondary" size="sm" icon={CircleCheck} loading={status.isPending} onClick={() => set("DONE")}>
            {t("markDone")}
          </Button>
        ) : null}
        {mine && m.assignees.some((a) => a.status === "DONE" || a.status === "CANCELLED") ? (
          <Button variant="secondary" size="sm" icon={RotateCcw} loading={status.isPending} onClick={() => set("NEW")}>
            {t("reopen")}
          </Button>
        ) : null}
        {mine && m.assignees.some((a) => a.status !== "CANCELLED") ? (
          <Button variant="tertiary" size="sm" icon={CircleX} loading={status.isPending} onClick={() => set("CANCELLED")}>
            {t("cancelTask")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ImagePreview({ file, onClose }: { file: FileInfo | null; onClose: () => void }) {
  const t = useTranslations("chat");
  return (
    <Modal
      open={file != null}
      onClose={onClose}
      title={file?.fileName ?? ""}
      size="lg"
      primaryAction={{ label: t("download"), onClick: () => file && window.open(fileUrl(file.id), "_blank", "noopener") }}
      secondaryAction={{ label: t("close"), onClick: onClose }}
    >
      {file ? (
        // eslint-disable-next-line @next/next/no-img-element -- himoyalangan API fayli
        <img src={fileUrl(file.id, true)} alt={file.fileName} className="mx-auto max-h-[70vh] w-auto object-contain" />
      ) : null}
    </Modal>
  );
}

function ReadsModal({ messageId, onClose }: { messageId: number | null; onClose: () => void }) {
  const t = useTranslations("chat");
  const q = useReads(messageId);
  return (
    <Modal
      open={messageId != null}
      onClose={onClose}
      title={t("readsTitle")}
      size="sm"
      primaryAction={{ label: t("close"), onClick: onClose }}
    >
      {q.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <ul className="flex flex-col gap-2">
          {q.data.map((r) => (
            <li key={r.employeeId} className="flex items-center justify-between gap-2">
              <span>{r.fullName}</span>
              {r.read ? (
                <Badge tone="success" icon={CheckCheck}>
                  {t("read")}
                </Badge>
              ) : (
                <Badge tone="neutral" icon={Check}>
                  {t("notRead")}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
