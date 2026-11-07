"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { DayField } from "@/components/ui/day-field";
import { formatQuantity } from "@/lib/format";

export type FilterOption<V extends string | number> = { value: V; label: string; count?: number };

/** Chip yozuvi: 2 tagacha nom, koʻp boʻlsa «… +N» (prototip FilterChip). */
export function chipSummary(names: string[]): string {
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} … +${names.length - 2}` : names.join(", ");
}

/**
 * Prototip FilterBar chipi: boʻsh holatda «+ Nomi» (uzuq chegarali), tanlanganda «Nomi: A, B ×».
 * Ochiladigan oyna — qidiruv, belgilash katakchalari (soni bilan), «Tozalash» / «Qoʻllash».
 */
export function MultiFilter<V extends string | number>({
  label,
  options,
  selected,
  onChange,
  searchable,
}: {
  label: string;
  options: FilterOption<V>[];
  selected: V[];
  onChange: (v: V[]) => void;
  searchable?: boolean;
}) {
  const t = useTranslations("ui");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<V[]>(selected);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    setDraft(selected);
    setQ("");
    setOpen((o) => !o);
  };
  const names = selected.map((v) => options.find((o) => o.value === v)?.label ?? String(v));
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const showSearch = searchable ?? options.length > 7;

  return (
    <div ref={box} className="relative">
      {selected.length > 0 ? (
        <div className="flex h-control-sm items-center rounded-card border border-primary bg-primary-soft text-primary-button">
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            title={names.join(", ")}
            className="h-full max-w-72 truncate pr-1 pl-2.5 text-[13px] font-medium"
          >
            {label}: {chipSummary(names)}
          </button>
          <button
            type="button"
            aria-label={t("removeFilter", { what: label })}
            onClick={() => onChange([])}
            className="flex h-full w-[26px] items-center justify-center rounded-r-card hover:bg-primary/15"
          >
            <X size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className="flex h-control-sm items-center gap-1.5 rounded-card border border-dashed border-border bg-surface px-2.5 text-[13px] whitespace-nowrap text-text-secondary hover:bg-table-header hover:text-text-primary"
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden />
          {label}
        </button>
      )}
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className="absolute top-10 left-0 z-40 flex w-[260px] flex-col rounded-modal border border-border bg-surface shadow-overlay"
        >
          {showSearch ? (
            <label className="flex h-10 items-center gap-2 border-b border-border px-3 text-text-secondary">
              <Search size={16} strokeWidth={1.5} aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("search")}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none"
              />
            </label>
          ) : null}
          <div className="max-h-60 overflow-y-auto p-1">
            {shown.map((o) => {
              const on = draft.includes(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setDraft(on ? draft.filter((v) => v !== o.value) : [...draft, o.value])}
                  className="flex h-8 w-full items-center gap-2.5 rounded-control px-2 text-left text-[13px] hover:bg-table-header"
                >
                  <span
                    className={`flex size-4 flex-none items-center justify-center rounded-sm border text-white ${on ? "border-primary-button bg-primary-button" : "border-text-disabled bg-surface"}`}
                  >
                    {on ? <Check size={12} strokeWidth={2} aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.count !== undefined ? (
                    <span className="text-caption text-text-secondary tabular-nums">{formatQuantity(o.count)}</span>
                  ) : null}
                </button>
              );
            })}
            {shown.length === 0 ? <p className="px-2 py-3 text-[13px] text-text-secondary">{t("selectEmpty")}</p> : null}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border p-2">
            <button
              type="button"
              onClick={() => setDraft([])}
              className="h-[30px] rounded-card px-2.5 text-[13px] text-text-secondary hover:bg-background hover:text-text-primary"
            >
              {t("clear")}
            </button>
            <button
              type="button"
              onClick={() => (onChange(draft), setOpen(false))}
              className="h-[30px] rounded-card bg-primary-button px-3 text-[13px] font-medium text-white hover:bg-primary-button-hover"
            >
              {t("apply")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Toshkent sanasi (YYYY-MM-DD), `days` kun oldingi. */
export function tashkentDay(now: number, days = 0): string {
  return new Date(now + 5 * 3600000 - days * 86400000).toISOString().slice(0, 10);
}

/** Tayyor davrlar (prototip DateRangePicker): bugun, kecha, shu hafta (dushanbadan), shu oy. */
export function datePresets(now: number): Record<"today" | "yesterday" | "week" | "month", [string, string]> {
  const today = tashkentDay(now);
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return {
    today: [today, today],
    yesterday: [tashkentDay(now, 1), tashkentDay(now, 1)],
    week: [tashkentDay(now, dow), today],
    month: [`${today.slice(0, 8)}01`, today],
  };
}

const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Sana chipi: «+ Sana» → oyna (tayyor davrlar + dan/gacha); tanlanganda «Sana: 01.11.2026 – 08.11.2026 ×». */
export function DateChip({
  label,
  from,
  to,
  onChange,
  invalid,
}: {
  label: string;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  invalid: string;
}) {
  const t = useTranslations("ui");
  const [presets, setPresets] = useState<ReturnType<typeof datePresets> | null>(null);
  const open = presets !== null;
  const setOpen = (on: boolean) => setPresets(on ? datePresets(Date.now()) : null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setPresets(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const summary = from && to ? (from === to ? dmy(from) : `${dmy(from)} – ${dmy(to)}`) : from ? `${dmy(from)} –` : to ? `– ${dmy(to)}` : "";
  return (
    <div ref={box} className="relative">
      {summary ? (
        <div className="flex h-control-sm items-center rounded-card border border-primary bg-primary-soft text-primary-button">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="h-full pr-1 pl-2.5 text-[13px] font-medium whitespace-nowrap"
          >
            {label}: {summary}
          </button>
          <button
            type="button"
            aria-label={t("removeFilter", { what: label })}
            onClick={() => onChange(null, null)}
            className="flex h-full w-[26px] items-center justify-center rounded-r-card hover:bg-primary/15"
          >
            <X size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex h-control-sm items-center gap-1.5 rounded-card border border-dashed border-border bg-surface px-2.5 text-[13px] whitespace-nowrap text-text-secondary hover:bg-table-header hover:text-text-primary"
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden />
          {label}
        </button>
      )}
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className="absolute top-10 left-0 z-40 flex w-[320px] flex-col gap-3 rounded-modal border border-border bg-surface p-3 shadow-overlay"
        >
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(presets ?? {}) as [keyof ReturnType<typeof datePresets>, [string, string]][]).map(([k, [f, tt]]) => (
              <button
                key={k}
                type="button"
                onClick={() => (onChange(f, tt), setOpen(false))}
                className={`h-7 rounded-control px-2.5 text-[12.5px] ${f === from && tt === to ? "bg-primary-soft font-medium text-primary-button" : "bg-background text-text-primary hover:bg-table-header"}`}
              >
                {t(`date.${k}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <DayField label={t("date.from")} value={from} invalid={invalid} onApply={(v) => onChange(v, to)} />
            <DayField label={t("date.to")} value={to} invalid={invalid} onApply={(v) => onChange(from, v)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
