"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/session";
import { cn } from "@/lib/cn";
import { type HubKey, hubTabsFor } from "./nav";

export { HUBS, type HubKey, hubTabsFor } from "./nav";

/** Sahifalararo yorliqlar (havola) — sarlavha ustida, prototipdagi chiziqli yorliqlar uslubida. */
export function HubTabs({ hub, className }: { hub: HubKey; className?: string }) {
  const t = useTranslations("shell.hubTabs");
  const pathname = usePathname();
  const me = useMe();
  const tabs = hubTabsFor(hub, me.data?.permissions);
  if (tabs.length < 2) return null;
  return (
    <nav
      aria-label={t(hub)}
      className={cn("mb-4 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] print:hidden", className)}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-3 font-medium whitespace-nowrap transition-colors duration-150 ease-out",
              active
                ? "border-primary text-text-primary"
                : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
