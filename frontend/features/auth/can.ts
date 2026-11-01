"use client";

import { useMe } from "./session";

/**
 * Ruxsat kaliti bor-yoʻqligi (1.3: 132 kalit, `docs/notes/T12-topshirish.md` §7). Frontend faqat koʻrinishni boshqaradi —
 * yakuniy tekshiruv serverda.
 */
export function can(me: { permissions: string[] } | undefined, key: string): boolean {
  return Boolean(me?.permissions.includes(key));
}

export function canAny(me: { permissions: string[] } | undefined, keys: string[]): boolean {
  return keys.some((k) => can(me, k));
}

export function useCan(): (key: string) => boolean {
  const me = useMe();
  return (key: string) => can(me.data, key);
}
