"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { PERIOD_LABELS, type PeriodPreset, periodRange } from "./period";

export interface PeriodState {
  preset: PeriodPreset;
  setPreset: (p: PeriodPreset) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  /** ISO sanalar; ixtiyoriy davrda sana notoʻgʻri boʻlsa — null. */
  range: { from: string | null; to: string | null };
}

/** Bosh sahifa davri holati: Bugun / Hafta / Oy / Ixtiyoriy (SPEC 8). */
export function usePeriodState(initial: PeriodPreset = "today"): PeriodState {
  const today = todayTashkent();
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [customFrom, setCustomFrom] = useState(formatIsoDate(today));
  const [customTo, setCustomTo] = useState(formatIsoDate(today));
  const range =
    preset === "custom" ? { from: parseUzDate(customFrom) ?? null, to: parseUzDate(customTo) ?? null } : periodRange(preset, today);
  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range };
}

export function PeriodPicker({ state }: { state: PeriodState }) {
  const t = useTranslations("home.period");
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div role="radiogroup" aria-label={t("label")} className="inline-flex rounded-control border border-border bg-background p-0.5">
        {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((k) => {
          const on = state.preset === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => state.setPreset(k)}
              className={cn(
                "h-8 rounded-control px-3 text-body font-medium whitespace-nowrap transition-colors duration-150",
                on ? "bg-surface text-text-primary shadow-xs" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t(k)}
            </button>
          );
        })}
      </div>
      {state.preset === "custom" ? (
        <>
          <div className="w-36">
            <TextField
              label={t("from")}
              size="sm"
              value={state.customFrom}
              onChange={state.setCustomFrom}
              placeholder="04.10.2026"
              error={parseUzDate(state.customFrom) ? undefined : t("invalid")}
            />
          </div>
          <div className="w-36">
            <TextField
              label={t("to")}
              size="sm"
              value={state.customTo}
              onChange={state.setCustomTo}
              placeholder="04.10.2026"
              error={parseUzDate(state.customTo) ? undefined : t("invalid")}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
