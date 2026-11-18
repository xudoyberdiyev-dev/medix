"use client";

import { useTranslations } from "next-intl";
import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { MESSAGES_USE, playChime, useUnread } from "@/features/messages/api";

/**
 * O12: «Xabarlar» (TopBar) — oʻqilmagan xabarlar va ochiq topshiriqlar soni. Yangi xabar kelganda (son oshsa) qisqa ovoz
 * va qalqib chiquvchi oyna; «Xabarlar» sahifasida ochiq turgan boʻlsa — faqat ovoz yoʻq (suhbat oʻzi yangilanadi).
 */
export function MessagesButton() {
  const t = useTranslations("chat");
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = me.data?.permissions.includes(MESSAGES_USE) ?? false;
  const unread = useUnread(allowed);
  const prev = useRef<{ messages: number; openTasks: number } | null>(null);
  const onPage = pathname.startsWith("/messages");

  const messages = unread.data?.messages ?? 0;
  const tasks = unread.data?.openTasks ?? 0;

  useEffect(() => {
    if (!unread.data) return;
    const before = prev.current;
    prev.current = { messages, openTasks: tasks };
    if (!before) return;
    const newTask = tasks > before.openTasks;
    if (messages > before.messages || newTask) {
      playChime();
      if (!onPage) {
        toast({
          tone: "info",
          title: newTask ? t("toastTask") : t("toastMessage"),
          description: t("toastUnread", { n: messages }),
          action: { label: t("open"), onClick: () => router.push(newTask ? "/messages?view=tasks" : "/messages") },
        });
      }
    }
  }, [unread.data, messages, tasks, onPage, router, t]);

  if (!allowed) return null;
  const total = messages + tasks;
  return (
    <Link
      href="/messages"
      aria-label={total > 0 ? t("buttonUnread", { messages, tasks }) : t("title")}
      title={t("title")}
      className="relative flex size-control-md items-center justify-center rounded-control hover:bg-background"
    >
      <MessagesSquare size={20} strokeWidth={1.5} aria-hidden />
      {messages > 0 ? (
        <span className="absolute top-1 right-1 min-w-4 rounded-full bg-danger px-1 text-center text-caption leading-4 text-on-solid">
          {messages > 99 ? "99+" : messages}
        </span>
      ) : tasks > 0 ? (
        <span className="absolute top-1 right-1 min-w-4 rounded-full bg-warning px-1 text-center text-caption leading-4 text-on-solid">
          {tasks > 99 ? "99+" : tasks}
        </span>
      ) : null}
    </Link>
  );
}
