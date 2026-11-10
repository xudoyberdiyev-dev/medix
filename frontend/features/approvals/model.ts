/** «Tasdiqlash» sahifasi modeli (prototip `Approvals`): yorliqlar, chiplar, kutish vaqti, qisqa summa. Pul — satr, float yoʻq. */

export type ApprovalTab = "mine" | "all" | "today";

export interface QueueItem {
  mine: boolean;
  limitOverPct?: number | null;
  overdue: string;
  overdueDays: number;
  blocked: boolean;
}

/** Yorliq boʻyicha roʻyxat: «Mening darajam» — faqat joriy foydalanuvchi tasdiqlay oladiganlari. */
export function visibleOrders<T extends QueueItem>(orders: T[], tab: ApprovalTab): T[] {
  return tab === "mine" ? orders.filter((o) => o.mine) : orders;
}

/** «46300000.00» → «46,3» (mln, bir kasr, HALF_UP) — butun sonlar bilan. */
export function toMln(amount: string): string {
  const neg = amount.trim().startsWith("-");
  const [int = "0", frac = ""] = amount.trim().replace("-", "").split(".");
  const tiyin = BigInt(int || "0") * 100n + BigInt((frac + "00").slice(0, 2));
  // 1 mln = 100 000 000 tiyin; bir kasr uchun 10 000 000 ga boʻlamiz
  const tenths = (tiyin + 5_000_000n) / 10_000_000n;
  const s = `${tenths / 10n},${tenths % 10n}`;
  return neg && tenths > 0n ? `-${s}` : s;
}

export type ChipTone = "warning" | "danger";

export interface Chip {
  kind: "limit" | "overdue" | "blocked";
  tone: ChipTone;
  /** limit — foiz; overdue — mln va kun */
  pct?: number;
  mln?: string;
  days?: number;
}

/**
 * Roʻyxat qatoridagi belgilar (prototip): «Limit +N%» (≤ Sozlamalardagi limit % — sariq, undan koʻp — qizil), «Muddati oʻtgan X mln · N kun»
 * (≤ Sozlamalardagi kun — sariq, undan koʻp — qizil), «Bloklangan».
 */
export function chips(
  o: QueueItem,
  th: { limitBranchPct: number; overdueDirDays: number } = { limitBranchPct: 20, overdueDirDays: 30 },
): Chip[] {
  const out: Chip[] = [];
  if (o.limitOverPct != null && o.limitOverPct > 0) {
    out.push({ kind: "limit", tone: o.limitOverPct > th.limitBranchPct ? "danger" : "warning", pct: o.limitOverPct });
  }
  if (o.overdueDays > 0) {
    out.push({
      kind: "overdue",
      tone: o.overdueDays > th.overdueDirDays ? "danger" : "warning",
      mln: toMln(o.overdue),
      days: o.overdueDays,
    });
  }
  if (o.blocked) out.push({ kind: "blocked", tone: "danger" });
  return out;
}

/** Kutish vaqti: daqiqa → {d, h, m}; ≥ 1 kun — «N kun M soat», ≥ 1 soat — «N soat M daqiqa», aks holda — «M daqiqa». */
export function waitParts(minutes: number): { key: "wD" | "wH" | "wM"; d: number; h: number; m: number } {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return { key: "wD", d, h, m };
  if (h > 0) return { key: "wH", d, h, m };
  return { key: "wM", d, h, m };
}

/** Kutish rangi: 4 soatdan koʻp — sariq (prototip). */
export function waitLate(minutes: number): boolean {
  return minutes >= 240;
}

/** Kredit chizigʻi ulushlari (%): joriy qarz, shu buyurtma (limitgacha), limitdan oshgan; limit chizigʻi oʻrni. Butun sonlar bilan. */
export function creditBar(debt: string, order: string, limit: string | null | undefined) {
  const toT = (s: string) => {
    const [i = "0", f = ""] = s.replace("-", "").split(".");
    const v = BigInt(i || "0") * 100n + BigInt((f + "00").slice(0, 2));
    return s.startsWith("-") ? 0n : v;
  };
  const d = toT(debt);
  const o = toT(order);
  const l = limit == null ? null : toT(limit);
  const total = d + o;
  const scale = l == null ? total : total > l ? total : l;
  if (scale === 0n)
    return { debt: 0, order: 0, over: 0, limitAt: null as number | null, overAmount: 0n, leftAmount: null as bigint | null };
  const pct = (x: bigint) => Number((x * 1000n) / scale) / 10;
  const over = l != null && total > l ? total - l : 0n;
  const orderIn = o - over > 0n ? o - over : 0n;
  const debtIn = d - (over > o ? over - o : 0n);
  return {
    debt: pct(debtIn),
    order: pct(orderIn),
    over: pct(over),
    limitAt: l == null ? null : pct(l),
    overAmount: over,
    leftAmount: l == null ? null : l > total ? l - total : 0n,
  };
}

/** Tiyin (bigint) → API satri «123.45». */
export function fromTiyin(t: bigint): string {
  const neg = t < 0n;
  const a = neg ? -t : t;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}
