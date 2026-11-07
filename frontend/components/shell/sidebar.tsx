"use client";

import { ChevronDown, ChevronRight, ChevronsUpDown, Languages, LogOut, PanelLeftClose, PanelLeftOpen, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useLogout, useMe } from "@/features/auth/session";
import { LOCALE_NAMES, LOCALES, writeLocaleCookie, type Locale } from "@/i18n/config";
import { useSidebarStore } from "@/lib/stores/sidebar";
import { LANG_CODE } from "./language-chip";
import { navigationFor } from "./nav";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sidebar (prototip `Medix ERP`): fon brand-900; guruhlar yigʻiladi (chevron), faol band — sidebar-active rangli ikonka va chap chiziq.
 * Kenglik: ≥1280 px — 240 px (yoki «Sidebarʼni yigʻish» bilan 64 px); 768–1279 px — 64 px (faqat ikonka, nom — `title`);
 * <768 px — yashirin, menyu yuqori paneldagi tugma orqali chapdan ochiladi (`MobileNav`). Pastda — foydalanuvchi menyusi.
 */
export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  return (
    <aside
      className={cn(
        "hidden w-sidebar-collapsed shrink-0 flex-col bg-brand-900 text-sidebar-text md:flex print:hidden",
        !collapsed && "xl:w-sidebar",
      )}
    >
      <SidebarContent variant="rail" />
    </aside>
  );
}

/** `rail` — chap ustun (768–1279 px da yoki yigʻilganda ixcham); `sheet` — telefondagi ochiladigan menyu (har doim toʻliq). */
export function SidebarContent({ variant, onNavigate }: { variant: "rail" | "sheet"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();
  const t = useTranslations();
  const locale = useLocale();
  const { collapsed, setCollapsed, open, toggleGroup } = useSidebarStore();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);
  const rail = variant === "rail";
  // Ixcham koʻrinish: 768–1279 px da har doim, ≥1280 da — yigʻilganda
  const mini = rail && collapsed;
  const compact = (always: string, belowXl: string) => (rail ? (mini ? always : belowXl) : "");
  const setLocale = (l: Locale) => {
    if (l === locale) return;
    writeLocaleCookie(l);
    setMenu(false);
    router.refresh();
  };
  return (
    <>
      <div
        className={cn(
          "flex h-topbar shrink-0 items-center gap-3 px-5",
          compact("justify-center px-0", "max-xl:justify-center max-xl:px-0"),
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary-button font-semibold text-white">
          M
        </span>
        <span className={cn("flex min-w-0 flex-col", compact("hidden", "max-xl:hidden"))}>
          <span className="text-subtitle leading-5 text-white">MEDIX</span>
        </span>
      </div>
      <nav aria-label={t("shell.mainMenu")} className={cn("flex-1 overflow-y-auto px-3 pb-4", compact("px-2", "max-xl:px-2"))}>
        {navigationFor(me.data?.permissions).map((group, gi) => {
          const hasActive = group.items.some((i) => isActive(pathname, i.href));
          const key = group.key;
          const isOpen = !key || (open[key] ?? hasActive);
          return (
            <div key={key ?? gi} className="mt-1 flex flex-col gap-0.5 first:mt-2">
              {key ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(key, isOpen)}
                  className={cn(
                    "mt-2 flex h-7 w-full items-center justify-between rounded-control px-2.5 text-[11px] font-medium tracking-[0.04em] text-sidebar-text/75 transition-colors hover:text-sidebar-text",
                    compact("sr-only", "max-xl:sr-only"),
                  )}
                >
                  <span className="truncate">{t(`navGroups.${key}`)}</span>
                  {isOpen ? (
                    <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
                  )}
                </button>
              ) : null}
              <ul className={cn("flex flex-col gap-0.5", !isOpen && (rail ? (mini ? "" : "xl:hidden") : "hidden"))}>
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
                          "relative flex items-center gap-2.5 rounded-card px-2.5 text-[13.5px] transition-colors duration-150 ease-out focus-visible:outline-sidebar-active",
                          rail ? cn("h-[34px]", compact("justify-center px-0", "max-xl:justify-center max-xl:px-0")) : "h-12",
                          active ? "bg-sidebar-active/10 font-medium text-white" : "hover:bg-white/5 hover:text-white",
                        )}
                      >
                        {active ? (
                          <span aria-hidden className="absolute inset-y-2 -left-2.5 w-[3px] rounded-r-[3px] bg-sidebar-active" />
                        ) : null}
                        <Icon
                          size={18}
                          strokeWidth={1.5}
                          aria-hidden
                          className={cn("shrink-0", active ? "text-sidebar-active" : "text-sidebar-text/85")}
                        />
                        <span className={cn("truncate", compact("sr-only", "max-xl:sr-only"))}>{label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      {me.data ? (
        <div ref={menuRef} className="relative flex shrink-0 flex-col gap-0.5 border-t border-white/5 px-2.5 pt-2 pb-2.5">
          {menu ? (
            <div
              role="menu"
              aria-label={t("shell.userMenu")}
              className="absolute bottom-full left-2.5 z-60 mb-1 w-[220px] rounded-modal border border-border bg-surface p-1 text-text-primary shadow-overlay"
            >
              <div className="mb-1 border-b border-border px-2.5 pt-2 pb-2.5">
                <div className="truncate text-[13px] font-medium">{me.data.fullName}</div>
                <div className="truncate text-caption text-text-secondary">{me.data.login}</div>
              </div>
              <Link
                role="menuitem"
                href="/profile"
                onClick={() => (setMenu(false), onNavigate?.())}
                className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-[13px] hover:bg-table-header"
              >
                <User size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                {t("shell.profile")}
              </Link>
              <div className="flex h-8 w-full items-center gap-2 px-2 text-[13px]">
                <Languages size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                <span className="flex-1">{t("shell.language")}</span>
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="menuitemradio"
                    aria-checked={l === locale}
                    title={LOCALE_NAMES[l]}
                    onClick={() => setLocale(l)}
                    className={cn(
                      "h-6 rounded-sm px-1.5 text-caption",
                      l === locale ? "bg-primary-soft font-medium text-primary-button" : "text-text-secondary hover:bg-table-header",
                    )}
                  >
                    {LANG_CODE[l]}
                  </button>
                ))}
              </div>
              <div className="my-1 h-px bg-border" />
              <button
                role="menuitem"
                type="button"
                disabled={logout.isPending}
                onClick={() => logout.mutate(undefined, { onSettled: () => router.replace("/login") })}
                className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-danger hover:bg-danger-bg"
              >
                <LogOut size={16} strokeWidth={1.5} aria-hidden />
                {t("shell.logout")}
              </button>
            </div>
          ) : null}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={t("shell.userMenu")}
            onClick={() => setMenu((m) => !m)}
            className={cn(
              "flex h-12 w-full items-center gap-2.5 rounded-card px-2 text-left transition-colors hover:bg-white/5 focus-visible:outline-sidebar-active",
              compact("justify-center px-0", "max-xl:justify-center max-xl:px-0"),
            )}
          >
            <Avatar name={me.data.fullName} decorative />
            <span className={cn("flex min-w-0 flex-1 flex-col", compact("hidden", "max-xl:hidden"))}>
              <span className="truncate text-[13px] leading-[17px] text-white">{me.data.fullName}</span>
              <span className="truncate text-caption text-sidebar-text/75">{me.data.role.name}</span>
            </span>
            <ChevronsUpDown
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className={cn("text-sidebar-text/75", compact("hidden", "max-xl:hidden"))}
            />
          </button>
          {rail ? (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? t("shell.expand") : t("shell.collapse")}
              className={cn(
                "hidden h-[30px] w-full items-center gap-2.5 rounded-card px-2.5 text-caption text-sidebar-text/75 transition-colors hover:bg-white/5 hover:text-white xl:flex",
                mini && "justify-center px-0",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen size={16} strokeWidth={1.5} aria-hidden />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.5} aria-hidden />
              )}
              <span className={cn("truncate", mini && "sr-only")}>{collapsed ? t("shell.expand") : t("shell.collapse")}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
