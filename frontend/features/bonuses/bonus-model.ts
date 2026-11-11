/** Bonus balans yorligʻi (prototip Payables → Bonus balans): koʻrinishlar va kartalar hisobi. */

export type BonusState = "PENDING" | "CONFIRMED" | "DECLINED";
export const BONUS_TABS = ["all", "wait", "soon", "late", "ok", "no"] as const;
export type BonusTab = (typeof BONUS_TABS)[number];

export interface BonusFilterRow {
  state: BonusState;
  days?: number | null;
  amount: string;
  supplier: string;
  receiptNumber: string;
  bnsNumber?: string | null;
  supplierId: number;
  branchId: number;
  bonusDate?: string | null;
}

export const isWaiting = (r: Pick<BonusFilterRow, "state">) => r.state === "PENDING";
/** Bugun yoki 3 kun ichida olinadi. */
export const isSoon = (r: Pick<BonusFilterRow, "state" | "days">) => isWaiting(r) && r.days != null && r.days >= 0 && r.days <= 3;
/** Olish sanasi oʻtgan, hali tasdiqlanmagan. */
export const isLate = (r: Pick<BonusFilterRow, "state" | "days">) => isWaiting(r) && r.days != null && r.days < 0;

export function inBonusTab(r: BonusFilterRow, tab: BonusTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "wait":
      return isWaiting(r);
    case "soon":
      return isSoon(r);
    case "late":
      return isLate(r);
    case "ok":
      return r.state === "CONFIRMED";
    case "no":
      return r.state === "DECLINED";
  }
}

/** Qidiruv (YB, kirim yoki BNS raqami), YB va filial filtrlari, olish sanasi oraligʻi (ISO). */
export function fitsBonus(
  r: BonusFilterRow,
  f: { q: string; suppliers: string[]; branches: string[]; from?: string | null; to?: string | null },
): boolean {
  const q = f.q.trim().toLowerCase();
  if (q && !`${r.supplier} ${r.receiptNumber} ${r.bnsNumber ?? ""}`.toLowerCase().includes(q)) return false;
  if (f.suppliers.length > 0 && !f.suppliers.includes(String(r.supplierId))) return false;
  if (f.branches.length > 0 && !f.branches.includes(String(r.branchId))) return false;
  if (f.from || f.to) {
    if (!r.bonusDate) return false;
    if (f.from && r.bonusDate < f.from) return false;
    if (f.to && r.bonusDate > f.to) return false;
  }
  return true;
}
