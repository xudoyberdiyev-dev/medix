"use client";

import { useTranslations } from "next-intl";
import type pages from "@/messages/uz-Latn/pages.json";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { useMe } from "@/features/auth/session";
import { BranchSwitcher } from "./branch-switcher";
import { LanguageChip } from "./language-chip";
import { LiveSync } from "./live-sync";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { SearchButton } from "./search-button";

export type PageTitleKey = keyof typeof pages;

/** Sarlavha: `titleKey` — `pages` lugʻatidan (tarjima qilinadi), `title` — tayyor satr. */
type TitleProps = { titleKey: PageTitleKey; title?: never } | { title: string; titleKey?: never };

/** Yuqori panel (prototip): sahifa nomi, filial chipi (kod bilan), qidiruv, bildirishnomalar, til, avatar. */
export function TopBar(props: TitleProps) {
  const t = useTranslations("pages");
  const title = props.titleKey ? t(props.titleKey) : props.title;
  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-surface px-4 md:gap-4 md:px-6 print:hidden">
      <MobileNav />
      <div className="min-w-0 truncate text-body font-medium">{title}</div>
      <BranchSwitcher />
      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-3">
        <SearchButton />
        <LiveSync />
        <NotificationBell />
        <LanguageChip />
        <UserAvatar />
      </div>
    </header>
  );
}

/** Avatar (prototip: yuqori oʻng burchak) — Profil sahifasiga. */
function UserAvatar() {
  const me = useMe();
  const t = useTranslations("shell");
  if (!me.data) return null;
  return (
    <Link href="/profile" title={t("profile")} className="rounded-full max-md:hidden">
      <Avatar name={me.data.fullName} decorative />
    </Link>
  );
}

/** Sahifa sarlavhasi (`<h1>`) — `pages` lugʻatidan. */
export function PageHeading({ titleKey, className }: { titleKey: PageTitleKey; className?: string }) {
  const t = useTranslations("pages");
  return <h1 className={className}>{t(titleKey)}</h1>;
}
