"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Tanlangan filial (SPEC 10: Zustand — faqat kichik global holat). `null` — barcha filiallar.
 * Faqat koʻrinish uchun: maʼlumot doirasini server baribir tekshiradi.
 */
interface BranchState {
  branchId: number | null;
  setBranchId: (id: number | null) => void;
}

export const useBranchStore = create<BranchState>()(
  persist((set) => ({ branchId: null, setBranchId: (branchId) => set({ branchId }) }), {
    name: "medix-branch",
    storage: createJSONStorage(() => localStorage),
  }),
);

/** Joriy filial: barcha filiallarni koʻrmaydigan xodim uchun — doim oʻz filiali. */
export function effectiveBranchId(
  me: { allBranches: boolean; branchId?: number } | undefined,
  selected: number | null,
  activeIds: number[],
): number | null {
  if (!me) return null;
  if (!me.allBranches) return me.branchId ?? null;
  return selected !== null && activeIds.includes(selected) ? selected : null;
}
