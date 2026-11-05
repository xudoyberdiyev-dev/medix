/** Bosh sahifa davri (SPEC 8): Bugun / Hafta / Oy / Ixtiyoriy. Sanalar ISO (YYYY-MM-DD), Toshkent kuni bo'yicha. */
export type PeriodPreset = "today" | "week" | "month" | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Bugun",
  week: "Hafta",
  month: "Oy",
  custom: "Ixtiyoriy",
};

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Hafta — dushanbadan bugungacha; Oy — oyning 1-kunidan bugungacha. */
export function periodRange(preset: Exclude<PeriodPreset, "custom">, todayIso: string): { from: string; to: string } {
  if (preset === "today") return { from: todayIso, to: todayIso };
  if (preset === "month") return { from: `${todayIso.slice(0, 8)}01`, to: todayIso };
  const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0 — yakshanba
  const back = (weekday + 6) % 7;
  return { from: shift(todayIso, -back), to: todayIso };
}
