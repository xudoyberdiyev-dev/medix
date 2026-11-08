"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useLogout, useMe } from "@/features/auth/session";
import { cn } from "@/lib/cn";

/** Qadam nomlari — `setup.steps.<key>`, sarlavhalar — `setup.titles.<key>`, izohlar — `setup.descriptions.<key>`. */
export const SETUP_STEPS = ["company", "branches", "warehouses", "roles", "employees", "finish"] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export interface WizardFrameProps {
  step: number;
  /** Bajarilgan qadamlar (bosib oʻtish mumkin). */
  reachable: (step: number) => boolean;
  onStep: (step: number) => void;
  /** Oʻng ustun (oldindan koʻrish, maslahat). */
  aside?: ReactNode;
  /** Pastki panel: avtomatik saqlash holati. */
  status?: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  children: ReactNode;
}

/**
 * Sozlash ustasi qobigʻi (prototip SetupWizard): yuqorida logotip, 6 qadamli chiziq, «Keyinroq davom ettirish», avatar;
 * oʻrtada qadam sarlavhasi + forma + oʻng ustun; pastda qotirilgan panel — holat va «Keyingi qadam».
 */
export function WizardFrame({
  step,
  reachable,
  onStep,
  aside,
  status,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextLoading,
  children,
}: WizardFrameProps) {
  const t = useTranslations("setup");
  const me = useMe();
  const router = useRouter();
  const logout = useLogout();
  const [leaving, setLeaving] = useState(false);
  const key = SETUP_STEPS[step] ?? "company";

  return (
    <div className="min-h-dvh bg-background text-text-primary">
      <header className="sticky top-0 z-20 flex h-[64px] items-center gap-[24px] border-b border-border bg-surface px-[24px]">
        <div className="flex flex-none items-center gap-[12px]">
          <span className="flex size-[28px] items-center justify-center rounded-card bg-primary text-[15px] font-semibold text-white">
            M
          </span>
          <span className="text-[17px] font-semibold tracking-[0.02em] text-brand-900">MEDIX</span>
        </div>
        <nav aria-label={t("wizard")} className="flex min-w-0 flex-1 justify-center">
          <ol className="flex items-center gap-[12px]">
            {SETUP_STEPS.map((k, i) => {
              const done = i < step;
              const active = i === step;
              const can = !active && reachable(i);
              return (
                <Fragment key={k}>
                  {i > 0 ? <li aria-hidden className="hidden h-px w-[40px] bg-border xl:block" /> : null}
                  <li>
                    <button
                      type="button"
                      disabled={!can}
                      aria-current={active ? "step" : undefined}
                      onClick={() => onStep(i)}
                      className={cn("flex items-center gap-[8px] rounded-control text-table", can && "hover:text-primary-button")}
                    >
                      <span
                        className={cn(
                          "flex size-[22px] flex-none items-center justify-center rounded-full border text-caption font-medium",
                          active && "border-primary-button text-primary-button",
                          done && "border-primary-button bg-primary-button text-white",
                          !active && !done && "border-border text-text-secondary",
                        )}
                      >
                        {done ? <Check size={12} strokeWidth={2} aria-hidden /> : i + 1}
                      </span>
                      <span
                        className={cn(
                          "whitespace-nowrap",
                          active ? "font-semibold text-text-primary" : "hidden text-text-secondary xl:inline",
                        )}
                      >
                        {t(`steps.${k}`)}
                      </span>
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ol>
        </nav>
        <div className="flex flex-none items-center gap-[20px]">
          <button
            type="button"
            onClick={() => setLeaving(true)}
            className="text-table text-text-secondary transition-colors duration-150 ease-out hover:text-text-primary"
          >
            {t("later")}
          </button>
          {me.data ? (
            <span
              title={me.data.fullName}
              className="flex size-[28px] items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-button"
            >
              {initials(me.data.fullName)}
            </span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid max-w-[1088px] grid-cols-1 gap-[40px] px-[24px] pt-[40px] pb-[120px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <p className="text-table text-primary-button">{t("stepOf", { n: step + 1, total: SETUP_STEPS.length })}</p>
          <h1 className="mt-[6px] text-[26px] leading-[32px] font-semibold tracking-[-0.01em]">{t(`titles.${key}`)}</h1>
          <p className="mt-[8px] max-w-[560px] text-body text-pretty text-text-secondary">{t(`descriptions.${key}`)}</p>
          <div className="mt-[24px]">{children}</div>
        </section>
        <aside className="flex flex-col gap-[16px]">
          {aside}
          <div className="rounded-modal bg-primary-soft p-[24px] text-body text-pretty text-text-primary">{t("tip")}</div>
        </aside>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface">
        <div className="relative mx-auto flex h-[72px] max-w-[1088px] items-center justify-between gap-[16px] px-[24px]">
          <div>
            {onBack ? (
              <Button variant="secondary" size="lg" onClick={onBack}>
                {t("back")}
              </Button>
            ) : null}
          </div>
          <div
            className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-caption whitespace-nowrap text-text-secondary md:block"
            aria-live="polite"
          >
            {status}
          </div>
          {onNext ? (
            <Button size="lg" onClick={onNext} disabled={nextDisabled} loading={nextLoading}>
              {nextLabel ?? t("next")}
            </Button>
          ) : null}
        </div>
      </footer>

      <Modal
        open={leaving}
        size="sm"
        onClose={() => setLeaving(false)}
        title={t("leave.title")}
        primaryAction={{
          label: t("leave.exit"),
          loading: logout.isPending,
          onClick: () => logout.mutate(undefined, { onSettled: () => router.replace("/login?out=1") }),
        }}
        secondaryAction={{ label: t("leave.stay"), onClick: () => setLeaving(false) }}
      >
        <p className="text-text-secondary">{t("leave.text")}</p>
      </Modal>
    </div>
  );
}
