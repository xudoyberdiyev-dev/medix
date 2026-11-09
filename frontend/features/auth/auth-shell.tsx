"use client";

import { Building2, PackageCheck, Route } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { LOCALE_NAMES, LOCALE_SHORT, LOCALES, writeLocaleCookie } from "@/i18n/config";
import { cn } from "@/lib/cn";

/** Kontsentrik kvadratlar — brend panelining fon bezagi (prototip LoginScreen). */
const RINGS = [
  { size: 880, offset: -260, radius: 120 },
  { size: 720, offset: -200, radius: 104 },
  { size: 560, offset: -140, radius: 88 },
  { size: 400, offset: -80, radius: 72 },
  { size: 240, offset: -20, radius: 56 },
];

function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-[12px]">
      <span className="flex size-[32px] items-center justify-center rounded-card bg-primary text-[16px] font-semibold text-white">M</span>
      <span className={cn("text-[17px] font-semibold tracking-[0.02em]", inverted ? "text-white" : "text-brand-900")}>MEDIX</span>
    </div>
  );
}

/**
 * Kirish, yangi parol va shu kabi sahifalar qobigʻi (prototip `Medix ERP` → LoginScreen): chapda brend paneli
 * (≥1024 px), oʻngda 380 px forma; tor ekranda logotip forma ustida.
 */
export function AuthShell({ topRight, children }: { topRight?: ReactNode; children: ReactNode }) {
  const t = useTranslations("login");
  return (
    <main className="flex h-dvh bg-surface text-text-primary">
      <aside className="relative hidden h-full w-[44%] flex-none flex-col overflow-hidden bg-brand-900 p-[40px] lg:flex">
        {RINGS.map((r) => (
          <div
            key={r.size}
            aria-hidden
            className="absolute border border-white/5"
            style={{ width: r.size, height: r.size, right: r.offset, bottom: r.offset, borderRadius: r.radius }}
          />
        ))}
        <div className="relative">
          <Logo inverted />
        </div>
        <div className="relative flex flex-1 flex-col justify-center">
          <div className="flex max-w-[420px] flex-col">
            <p className="text-[28px] leading-9 font-semibold tracking-[-0.01em] text-pretty text-white">{t("brandTitle")}</p>
            <p className="mt-[12px] text-subtitle font-normal text-sidebar-text">{t("brandSub")}</p>
            <ul className="mt-[24px] flex flex-col gap-[14px]">
              {[
                { icon: PackageCheck, text: t("feature1") },
                { icon: Route, text: t("feature2") },
                { icon: Building2, text: t("feature3") },
              ].map((f) => (
                <li key={f.text} className="flex items-center gap-[12px] text-body text-sidebar-text">
                  <Icon icon={f.icon} size="md" className="text-sidebar-active" />
                  {f.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="relative flex items-center gap-[8px] text-caption text-sidebar-text/75">
          <span>© 2026 Medix Group</span>
          <span aria-hidden>·</span>
          <span>v1.0</span>
        </div>
      </aside>
      <div className="relative flex h-full min-w-0 flex-1 justify-center overflow-y-auto px-[24px] pt-[80px] pb-[72px]">
        {topRight ? <div className="absolute top-[32px] right-[32px]">{topRight}</div> : null}
        <div className="my-auto flex w-[380px] max-w-full flex-col">
          <div className="mb-[40px] flex justify-center lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

/** Oʻz / Ўз / Ру — segmentli til tanlagichi; til cookie'ga yoziladi, sahifa yangi til bilan qayta chiziladi. */
export function LocaleSegments() {
  const t = useTranslations("login");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div
      role="radiogroup"
      aria-label={t("languages")}
      className="flex h-[30px] gap-[2px] rounded-card border border-background bg-background p-[2px]"
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LOCALE_NAMES[l]}
            title={LOCALE_NAMES[l]}
            disabled={pending}
            onClick={() => {
              if (active) return;
              writeLocaleCookie(l);
              startTransition(() => router.refresh());
            }}
            className={cn(
              "h-[24px] rounded-control px-[10px] text-caption font-medium transition-colors duration-150 ease-out",
              active ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {LOCALE_SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}
