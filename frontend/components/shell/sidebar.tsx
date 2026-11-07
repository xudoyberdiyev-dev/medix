"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useLogout, useMe } from "@/features/auth/session";
import { navigationFor } from "./nav";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sidebar (design/system: Sidebar) — fon brand-900, faol: oq matn + chapda 3px sidebar-active.
 * Kenglik: ≥1280 px — 240 px; 768–1279 px — 64 px (faqat ikonka, nom — `title`); <768 px — yashirin,
 * menyu yuqori paneldagi tugma orqali chapdan ochiladi (`MobileNav`). Telefon: Yigʻuvchi, Markirovkachi, Haydovchi (SPEC 3).
 */
export function Sidebar() {
  return (
    <aside className="hidden w-sidebar-collapsed shrink-0 flex-col bg-brand-900 text-sidebar-text md:flex xl:w-sidebar print:hidden">
      <SidebarContent variant="rail" />
    </aside>
  );
}

/** `rail` — chap ustun (768–1279 px da ixcham); `sheet` — telefondagi ochiladigan menyu (har doim toʻliq). */
export function SidebarContent({ variant, onNavigate }: { variant: "rail" | "sheet"; onNavigate?: () => void }) {
  const rail = variant === "rail";
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();
  const t = useTranslations();
  return (
    <>
      <div className={cn("flex h-topbar shrink-0 items-center gap-3 px-5", rail && "max-xl:justify-center max-xl:px-0")}>
        <span className="flex size-8 items-center justify-center rounded-control bg-primary-button font-semibold text-white">M</span>
        <span className={cn("text-subtitle text-white", rail && "max-xl:hidden")}>MEDIX</span>
      </div>
      <nav aria-label={t("shell.mainMenu")} className={cn("flex-1 overflow-y-auto px-3 pb-4", rail && "max-xl:px-2")}>
        {navigationFor(me.data?.permissions).map((group, gi) => (
          <div key={group.key ?? gi} className="mt-4 first:mt-2">
            {group.key ? (
              <div className={cn("px-3 pb-1 text-caption font-medium", rail && "max-xl:sr-only")}>{t(`navGroups.${group.key}`)}</div>
            ) : null}
            <ul>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                const label = t(`nav.${item.key}`);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={rail ? label : undefined}
                      onClick={onNavigate}
                      className={cn(
                        "relative flex items-center gap-3 rounded-control px-3 transition-colors duration-150 ease-out focus-visible:outline-sidebar-active",
                        rail ? "h-control-md max-xl:justify-center max-xl:px-0" : "h-12",
                        active ? "bg-sidebar-item-active-bg font-medium text-white" : "hover:bg-sidebar-item-active-bg hover:text-white",
                      )}
                    >
                      {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-sidebar-active" /> : null}
                      <Icon size={20} strokeWidth={1.5} aria-hidden />
                      <span className={cn(rail && "max-xl:sr-only")}>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {me.data ? (
        <div
          className={cn(
            "flex shrink-0 items-center gap-3 border-t border-sidebar-item-active-bg px-4 py-3",
            rail && "max-xl:flex-col max-xl:gap-2 max-xl:px-2",
          )}
        >
          <Link
            href="/profile"
            title={t("shell.profile")}
            onClick={onNavigate}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-control focus-visible:outline-sidebar-active",
              rail && "max-xl:flex-none",
            )}
          >
            <Avatar name={me.data.fullName} decorative />
            <span className={cn("min-w-0 flex-1", rail && "max-xl:sr-only")}>
              <span className="block truncate font-medium text-white">{me.data.fullName}</span>
              <span className="block truncate text-caption">{me.data.role.name}</span>
            </span>
          </Link>
          <button
            type="button"
            aria-label={t("shell.logout")}
            title={t("shell.logout")}
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => router.replace("/login") })}
            className="flex size-control-md items-center justify-center rounded-control hover:bg-sidebar-item-active-bg hover:text-white focus-visible:outline-sidebar-active"
          >
            <LogOut size={20} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  );
}
