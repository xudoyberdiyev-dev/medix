"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type pages from "@/messages/uz-Latn/pages.json";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { useMe } from "@/features/auth/session";
import { BranchSwitcher } from "./branch-switcher";
import { LanguageChip } from "./language-chip";
import { LiveSync } from "./live-sync";
import { MobileNav } from "./mobile-nav";
import { isNavActive, navigation } from "./nav";
import { NotificationBell } from "./notification-bell";
import { SearchButton } from "./search-button";

export type PageTitleKey = keyof typeof pages;

/** Sarlavha: `titleKey` — `pages` lugʻatidan (tarjima qilinadi), `title` — tayyor satr. */
type TitleProps = { titleKey: PageTitleKey; title?: never } | { title: string; titleKey?: never };

/** Joriy sahifaning menyu guruhi (`navGroups` kaliti) — sarlavha oldidagi «Guruh / Sahifa» uchun. */
export function navGroupFor(pathname: string) {
  return navigation.find((g) => g.key && g.items.some((i) => isNavActive(pathname, i)))?.key;
}

/** Yuqori panel (prototip): «Guruh / Sahifa», filial chipi (kod bilan), qidiruv (oʻrtada), bildirishnomalar, til, avatar. */
export function TopBar(props: TitleProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const title = props.titleKey ? t(`pages.${props.titleKey}`) : props.title;
  const group = navGroupFor(pathname);
  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-surface px-4 md:gap-4 md:px-6 print:hidden">
      <MobileNav />
      <div className="flex min-w-0 items-center gap-2 text-body">
        {group ? (
          <>
            <span className="shrink-0 text-text-secondary max-md:hidden">{t(`navGroups.${group}`)}</span>
            <span aria-hidden className="text-text-disabled max-md:hidden">
              /
            </span>
          </>
        ) : null}
        <span className="truncate font-medium">{title}</span>
      </div>
      <BranchSwitcher />
      <div className="flex flex-1 justify-end md:justify-center">
        <SearchButton />
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-3">
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
