"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Globe, Moon, Phone, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { LOCALE_NAMES, LOCALES, writeLocaleCookie } from "@/i18n/config";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme";
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

/** Pastki yordam qatori (O22): «telefon · ish vaqti» — faqat toʻldirilgan qismlar. */
export function helpLine(info: Pick<LoginInfo, "supportPhone" | "supportHours"> | undefined): string | null {
  const parts = [info?.supportPhone?.trim(), info?.supportHours?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const topButton =
  "flex h-[40px] items-center gap-[8px] rounded-control border border-border bg-surface px-[12px] text-body text-text-primary transition-colors duration-150 ease-out hover:bg-table-header";

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
        <Icon icon={Globe} size={18} className="text-text-secondary" />
        {LOCALE_NAMES[locale as keyof typeof LOCALE_NAMES] ?? locale}
        <Icon icon={ChevronDown} className="text-text-secondary" />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={t("languages")}
          className="absolute right-0 z-10 mt-[6px] w-[180px] overflow-hidden rounded-card border border-border bg-surface py-[4px] shadow-overlay"
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
 * Kirish sahifasi (O22 — egasi tasdiqlagan yakuniy dizayn `docs/notes/login-100plus-yakuniy.dc.html`): ≥1024 px — chapda
 * primary-soft panel (logotip, modul sahnasi, almashuvchi karta), oʻngda til/rejim, forma (max 400 px) va pastda yordam
 * telefoni + Maxfiylik/Xavfsizlik; tor ekranda faqat forma.
 */
export function LoginLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("login");
  const info = useLoginInfo();
  const { resolved: theme, toggle: toggleTheme } = useTheme();
  const [doc, setDoc] = useState<"privacy" | "security" | null>(null);
  const help = helpLine(info.data);
  const footLink = "rounded-control text-table text-text-secondary transition-colors duration-150 ease-out hover:text-text-primary";
  return (
    <main className="flex min-h-dvh gap-[16px] bg-surface p-0 text-text-primary lg:p-[16px] lg:[@media(min-height:640px)]:h-dvh lg:[@media(min-height:640px)]:overflow-hidden">
      <LoginShowcase roles={info.data?.roles ?? null} />
      <div className="scrollbar-none flex min-h-0 min-w-0 flex-[1_1_460px] flex-col overflow-y-auto px-[16px] pt-[16px] pb-[20px] sm:px-[40px]">
        <div className="flex items-center justify-between gap-[8px] lg:justify-end">
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div className="flex gap-[8px]">
            <LocaleMenu />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? t("themeLight") : t("themeDark")}
              title={theme === "dark" ? t("themeLight") : t("themeDark")}
              className={cn(topButton, "w-[40px] justify-center px-0")}
            >
              <Icon icon={theme === "dark" ? Moon : Sun} size={18} className="text-text-secondary" />
            </button>
          </div>
        </div>
        <div className="mx-auto my-auto flex w-full max-w-[400px] flex-col py-[32px]">{children}</div>
        <div className="flex flex-wrap items-center justify-center gap-[16px] text-table text-text-secondary">
          {help ? (
            <span className="flex items-center gap-[6px]">
              <Icon icon={Phone} size={14} />
              {help}
            </span>
          ) : null}
          <button type="button" onClick={() => setDoc("privacy")} className={footLink}>
            {t("privacy")}
          </button>
          <button type="button" onClick={() => setDoc("security")} className={footLink}>
            {t("security")}
          </button>
        </div>
      </div>
      <Modal
        open={doc !== null}
        onClose={() => setDoc(null)}
        title={doc === "security" ? t("security") : t("privacy")}
        size="sm"
        hideSecondary
        primaryAction={{ label: t("close"), onClick: () => setDoc(null) }}
      >
        {doc === "security" ? (
          <ul className="flex list-disc flex-col gap-[8px] pl-[18px] text-body text-text-primary">
            {(["t1", "t2", "t3", "t4"] as const).map((k) => (
              <li key={k}>{t(`securityTip.${k}`)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-pretty text-text-primary">{t("privacyText")}</p>
        )}
      </Modal>
    </main>
  );
}
