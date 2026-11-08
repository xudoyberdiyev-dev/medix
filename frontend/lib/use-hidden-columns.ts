"use client";

import { useEffect, useState } from "react";

/** Jadvalda yashirilgan ustunlar — shu brauzerda eslab qolinadi (jadval standarti: «Ustunlar»). */
export function useHiddenColumns(storageKey: string) {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- brauzer xotirasidan bir marta oʻqiladi
      if (Array.isArray(parsed)) setHidden(parsed.filter((x): x is string => typeof x === "string"));
    } catch {
      /* xotira yopiq — standart ustunlar */
    }
  }, [storageKey]);
  const update = (next: string[]) => {
    setHidden(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* saqlanmasa ham ishlaydi */
    }
  };
  return [hidden, update] as const;
}
