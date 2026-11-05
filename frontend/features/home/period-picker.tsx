"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
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
export function usePeriodState(): PeriodState {
  const today = todayTashkent();
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [customFrom, setCustomFrom] = useState(formatIsoDate(today));
  const [customTo, setCustomTo] = useState(formatIsoDate(today));
  const range =
    preset === "custom" ? { from: parseUzDate(customFrom) ?? null, to: parseUzDate(customTo) ?? null } : periodRange(preset, today);
  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range };
}

export function PeriodPicker({ state }: { state: PeriodState }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Tabs
        aria-label="Davr"
        items={(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((k) => ({ key: k, label: PERIOD_LABELS[k] }))}
        value={state.preset}
        onChange={(k) => state.setPreset(k as PeriodPreset)}
      />
      {state.preset === "custom" ? (
        <>
          <div className="w-36">
            <TextField
              label="Dan"
              size="sm"
              value={state.customFrom}
              onChange={state.setCustomFrom}
              placeholder="04.10.2026"
              error={parseUzDate(state.customFrom) ? undefined : "Sana?"}
            />
          </div>
          <div className="w-36">
            <TextField
              label="Gacha"
              size="sm"
              value={state.customTo}
              onChange={state.setCustomTo}
              placeholder="04.10.2026"
              error={parseUzDate(state.customTo) ? undefined : "Sana?"}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
