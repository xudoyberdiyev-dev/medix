"use client";

import { useTranslations } from "next-intl";
import { ClipboardList, Clock, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/selection-controls";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { useMe } from "@/features/auth/session";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { MESSAGES_USE, useTasks, useThreads, useUnread, type TaskScope, type TaskStatus, type ThreadSummary } from "./api";
import { Conversation, TaskBadge } from "./conversation";
import { threadAvatarName, threadTitle } from "./labels";
import { NewMessage } from "./new-message";

type View = "chats" | "tasks";

/** O12 «Xabarlar»: chapda suhbatlar (yoki topshiriqlar), oʻngda suhbat. Telefonda — bittadan. Holat URL'da (?thread=, ?view=tasks). */
export function MessagesPage() {
  const t = useTranslations("chat");
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const threadId = params.get("thread") ? Number(params.get("thread")) : null;
  const view: View = params.get("view") === "tasks" ? "tasks" : "chats";
  const [composing, setComposing] = useState(false);
  const allowed = me.data?.permissions.includes(MESSAGES_USE) ?? false;
  const unread = useUnread(allowed);

  function go(next: { thread?: number | null; view?: View }) {
    const sp = new URLSearchParams(params.toString());
    if (next.thread !== undefined) {
      if (next.thread == null) sp.delete("thread");
      else sp.set("thread", String(next.thread));
    }
    if (next.view !== undefined) {
      if (next.view === "chats") sp.delete("view");
      else sp.set("view", next.view);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (me.data && !allowed) return <ForbiddenState />;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-r border-border bg-surface md:w-96 md:shrink-0",
          threadId != null && "max-md:hidden",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <h1 className="text-section-title">{t("title")}</h1>
          <Button variant="secondary" icon={MessageSquarePlus} onClick={() => setComposing(true)}>
            {t("newMessage")}
          </Button>
        </div>
        <div className="px-4">
          <Tabs
            aria-label={t("title")}
            value={view}
            onChange={(k) => go({ view: k as View })}
            items={[
              { key: "chats", label: t("chats"), icon: MessagesSquare, count: unread.data?.messages || undefined },
              { key: "tasks", label: t("tasks"), icon: ClipboardList, count: unread.data?.openTasks || undefined },
            ]}
          />
        </div>
        {view === "chats" ? (
          <ThreadList activeId={threadId} onOpen={(id) => go({ thread: id })} onCompose={() => setComposing(true)} />
        ) : (
          <TaskList activeThread={threadId} onOpen={(id) => go({ thread: id })} />
        )}
      </aside>
      <div className={cn("flex min-w-0 flex-1 flex-col", threadId == null && "max-md:hidden")}>
        {threadId != null ? (
          <Conversation key={threadId} threadId={threadId} onBack={() => go({ thread: null })} />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-background">
            <EmptyState icon={MessagesSquare} title={t("pickThread")} description={t("pickThreadHint")} />
          </div>
        )}
      </div>
      <NewMessage
        open={composing}
        onClose={() => setComposing(false)}
        onCreated={(id) => {
          setComposing(false);
          go({ thread: id, view: "chats" });
        }}
      />
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return formatDate(d) === formatDate(new Date()) ? formatTime(d) : formatDate(d);
}

function ThreadList({ activeId, onOpen, onCompose }: { activeId: number | null; onOpen: (id: number) => void; onCompose: () => void }) {
  const t = useTranslations("chat");
  const [q, setQ] = useState("");
  const list = useThreads(q);
  const items = list.data?.items ?? [];
  return (
    <>
      <div className="px-4 py-3">
        <TextField variant="search" label={t("search")} value={q} onChange={setQ} placeholder={t("searchPlaceholder")} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <div className="flex flex-col gap-2 px-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          q.trim() ? (
            <NoResultsState onClearFilters={() => setQ("")} />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title={t("emptyTitle")}
              description={t("emptyHint")}
              action={
                <Button variant="secondary" icon={MessageSquarePlus} onClick={onCompose}>
                  {t("newMessage")}
                </Button>
              }
            />
          )
        ) : (
          <ul>
            {items.map((th) => (
              <ThreadRow key={th.id} th={th} active={th.id === activeId} onOpen={() => onOpen(th.id)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ThreadRow({ th, active, onOpen }: { th: ThreadSummary; active: boolean; onOpen: () => void }) {
  const t = useTranslations("chat");
  const title = threadTitle(th, t);
  const preview = th.lastText == null ? t("deleted") : `${th.lastKind === "TASK" ? `${t("task")}: ` : ""}${th.lastText}`;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active || undefined}
        className={cn(
          "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-background",
          active && "bg-primary-soft hover:bg-primary-soft",
        )}
      >
        <Avatar name={threadAvatarName(th, t)} decorative />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate", th.unread > 0 && "font-medium")}>{title}</span>
            <time dateTime={th.lastMessageAt} className="shrink-0 text-caption text-text-secondary">
              {when(th.lastMessageAt)}
            </time>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-table", th.unread > 0 ? "text-text-primary" : "text-text-secondary")}>
              {th.kind === "GROUP" && th.lastSenderName ? `${th.lastSenderName}: ` : ""}
              {preview}
            </span>
            {th.unread > 0 ? (
              <span
                className="min-w-5 shrink-0 rounded-full bg-primary-button px-1.5 text-center text-caption leading-5 text-white"
                aria-label={t("unreadCount", { n: th.unread })}
              >
                {th.unread > 99 ? "99+" : th.unread}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

const STATUSES: TaskStatus[] = ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"];

function TaskList({ activeThread, onOpen }: { activeThread: number | null; onOpen: (threadId: number) => void }) {
  const t = useTranslations("chat");
  const [scope, setScope] = useState<TaskScope>("MINE");
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [overdue, setOverdue] = useState(false);
  const list = useTasks(scope, status, overdue);
  const items = list.data ?? [];
  const filtered = status != null || overdue;
  return (
    <>
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex gap-1 rounded-control bg-background p-1" role="group" aria-label={t("tasks")}>
          {(["MINE", "GIVEN"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={cn(
                "flex-1 rounded-control px-3 py-1.5 text-table",
                scope === s ? "bg-surface font-medium shadow-overlay" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t(s === "MINE" ? "tasksMine" : "tasksGiven")}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <Select
            className="flex-1"
            size="sm"
            label={t("statusFilter")}
            value={status}
            onChange={(v) => setStatus(v as TaskStatus | null)}
            options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
            placeholder={t("allStatuses")}
          />
          <Checkbox className="pb-1.5" label={t("overdueOnly")} checked={overdue} onChange={setOverdue} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <div className="flex flex-col gap-2 px-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          filtered ? (
            <NoResultsState onClearFilters={() => (setStatus(null), setOverdue(false))} />
          ) : (
            <EmptyState icon={ClipboardList} title={t("noTasks")} description={t(scope === "MINE" ? "noTasksMine" : "noTasksGiven")} />
          )
        ) : (
          <ul>
            {items.map((task) => (
              <li key={task.messageId}>
                <button
                  type="button"
                  onClick={() => onOpen(task.threadId)}
                  aria-current={task.threadId === activeThread || undefined}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left hover:bg-background",
                    task.threadId === activeThread && "bg-primary-soft hover:bg-primary-soft",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium break-words">{task.title}</span>
                    <TaskBadge status={task.status} />
                  </span>
                  <span className="text-table text-text-secondary">
                    {scope === "MINE"
                      ? t("from", { name: task.senderName })
                      : t("toNames", {
                          names: task.assignees
                            .slice(0, 3)
                            .map((a) => a.fullName)
                            .join(", "),
                          rest: Math.max(0, task.assignees.length - 3),
                        })}
                  </span>
                  {task.dueAt ? (
                    <span className={cn("flex items-center gap-1 text-caption", task.overdue ? "text-danger" : "text-text-secondary")}>
                      <Clock size={14} strokeWidth={1.5} aria-hidden />
                      {t("dueAt", { date: formatDateTime(new Date(task.dueAt)) })}
                      {task.overdue ? ` · ${t("overdue")}` : ""}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
