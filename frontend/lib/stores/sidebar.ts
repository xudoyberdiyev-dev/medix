"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Sidebar (prototip): ≥1280 px da yigʻilgan/ochiq va ochiq guruhlar — brauzerda eslab qolinadi. */
interface SidebarState {
  collapsed: boolean;
  open: Record<string, boolean>;
  setCollapsed: (v: boolean) => void;
  toggleGroup: (key: string, current: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      open: {},
      setCollapsed: (collapsed) => set({ collapsed }),
      toggleGroup: (key, current) => set((s) => ({ open: { ...s.open, [key]: !current } })),
    }),
    { name: "medix-sidebar", storage: createJSONStorage(() => localStorage) },
  ),
);
