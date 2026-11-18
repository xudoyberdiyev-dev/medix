"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Globe, Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { LOCALE_NAMES, LOCALES, writeLocaleCookie } from "@/i18n/config";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { BrandMark } from "./auth-shell";
import { LoginShowcase } from "./login-showcase";

export type LoginInfo = { supportPhone?: string | null; supportHours?: string | null; roles: number };

/** Kirish sahifasi maʼlumoti (ommaviy): yordam telefoni, ish vaqti, rollar soni. Xato — sahifa usiz ishlaydi. */
export function useLoginInfo() {
  return useQuery({
    queryKey: ["auth", "login-info"],
    queryFn: () => unwrap(api.GET("/api/auth/login-info")),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** «Yordam: …» qatori — faqat toʻldirilgan qismlar. */
export function helpLine(
  t: (key: "help" | "helpPhone" | "helpBoth", v: Record<string, string>) => string,
  info: Pick<LoginInfo, "supportPhone" | "supportHours"> | undefined,
): string | null {
  const phone = info?.supportPhone?.trim();
  const hours = info?.supportHours?.trim();
  if (phone && hours) return t("helpBoth", { phone, hours });
  if (phone) return t("helpPhone", { phone });
  if (hours) return t("help", { hours });
  return null;
}

const THEME_KEY = "medix-login-theme";
type Theme = "light" | "dark";

function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    // saqlash ruxsat etilmagan — tizim sozlamasi
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Yorugʻ/qorongʻi rejim: `theme-dark` sinfi <html> ga (dialoglar ham qamraladi), sahifadan chiqilganda olib tashlanadi. */
function useLoginTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const id = window.setTimeout(() => setTheme(readTheme()), 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-dark", theme === "dark");
    return () => root.classList.remove("theme-dark");
  }, [theme]);
  return [
    theme,
    () =>
      setTheme((cur) => {
        const next = cur === "dark" ? "light" : "dark";
        try {
          window.localStorage.setItem(THEME_KEY, next);
        } catch {
          // eʼtiborsiz
        }
        return next;
      }),
  ];
}

const topButton =
  "flex h-[44px] items-center gap-[8px] rounded-[12px] border border-border bg-surface px-[14px] text-body text-text-primary transition-colors duration-150 ease-out hover:bg-table-header";

/** Til tanlash — ochiladigan roʻyxat (Oʻzbekcha / Ўзбекча / Русский); til cookie'ga yoziladi. */
export function LocaleMenu() {
  const t = useTranslations("login");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("languages")}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className={topButton}
      >
        <Icon icon={Globe} className="text-link" />
        {LOCALE_NAMES[locale as keyof typeof LOCALE_NAMES] ?? locale}
        <Icon icon={ChevronDown} className="text-text-secondary" />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={t("languages")}
          className="absolute right-0 z-10 mt-[6px] w-[180px] overflow-hidden rounded-[12px] border border-border bg-surface py-[4px] shadow-overlay"
        >
          {LOCALES.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (l === locale) return;
                  writeLocaleCookie(l);
                  startTransition(() => router.refresh());
                }}
                className="flex w-full items-center justify-between px-[14px] py-[9px] text-left text-body text-text-primary hover:bg-table-header"
              >
                {LOCALE_NAMES[l]}
                {l === locale ? <Icon icon={Check} className="text-link" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Kirish sahifasi (O20, egasi tanlagan A maket; prototip LoginScreen dan farq qiladi): ≥1024 px — chapda yumaloq panel
 * (logotip, illyustratsiya, almashuvchi modul kartasi), oʻngda til/rejim, forma va pastda yordam qatori; tor ekranda faqat forma.
 */
export function LoginLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("login");
  const info = useLoginInfo();
  const [theme, toggleTheme] = useLoginTheme();
  const help = helpLine(t, info.data);
  return (
    <main className="flex h-dvh gap-[20px] bg-surface p-0 text-text-primary lg:p-[20px]">
      <LoginShowcase roles={info.data?.roles ?? null} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-[16px] py-[16px] sm:px-[40px] lg:py-[8px]">
        <div className="flex items-center justify-between gap-[10px] lg:justify-end">
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div className="flex gap-[10px]">
            <LocaleMenu />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? t("themeLight") : t("themeDark")}
              title={theme === "dark" ? t("themeLight") : t("themeDark")}
              className={cn(topButton, "w-[44px] justify-center px-0")}
            >
              <Icon icon={theme === "dark" ? Moon : Sun} />
            </button>
          </div>
        </div>
        <div className="mx-auto my-auto flex w-[470px] max-w-full flex-col py-[32px]">{children}</div>
        {help ? <p className="text-center text-caption text-text-secondary">{help}</p> : null}
      </div>
    </main>
  );
}
