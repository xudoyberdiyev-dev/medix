import type { components } from "@/lib/api/schema";

type OrderSummary = components["schemas"]["OrderSummary"];

export type StageHint =
  | { key: "wait" | "given"; tone: "warning" | "info" }
  | { key: "left" | "late"; n: number; tone: "secondary" | "danger" }
  | { key: "resOk"; s: number; d: number; tone: "success" }
  | { key: "resOnTime"; s: number; tone: "success" }
  | { key: "resLate"; d: number; tone: "danger" };

const AFTER_PICK = new Set(["MARKING", "CHECKING", "DOCUMENTING"]);
const minutes = (ms: number) => Math.round(ms / 60000);

/**
 * Holat ostidagi bosqich izohi (prototip Orders: stSub): Navbatda — «Vaqt kutilmoqda / Vaqt berildi»;
 * Yigʻilmoqda — «N daqiqa qoldi / +N daqiqa kechikdi»; yigʻib boʻlingach — «Yigʻildi N daqiqada · …».
 */
export function stageHint(
  o: Pick<OrderSummary, "status" | "pickMinutes" | "pickStartedAt" | "pickFinishedAt">,
  now: number,
): StageHint | null {
  if (o.status === "QUEUED") return o.pickMinutes ? { key: "given", tone: "info" } : { key: "wait", tone: "warning" };
  if (!o.pickMinutes || !o.pickStartedAt) return null;
  const start = Date.parse(o.pickStartedAt);
  if (o.status === "PICKING" && !o.pickFinishedAt) {
    const left = o.pickMinutes - minutes(now - start);
    return left < 0 ? { key: "late", n: -left, tone: "danger" } : { key: "left", n: left, tone: "secondary" };
  }
  if (!o.pickFinishedAt || !AFTER_PICK.has(o.status)) return null;
  const spent = Math.max(1, minutes(Date.parse(o.pickFinishedAt) - start));
  const diff = o.pickMinutes - spent;
  if (diff < 0) return { key: "resLate", d: -diff, tone: "danger" };
  return diff > 0 ? { key: "resOk", s: spent, d: diff, tone: "success" } : { key: "resOnTime", s: spent, tone: "success" };
}

/** «Malika Yusupova» → «Malika Y.» (prototip: shortName). */
export function shortName(full: string): string {
  const a = full.trim().split(/\s+/);
  return a.length > 1 ? `${a[0]} ${a[1][0]}.` : full;
}
