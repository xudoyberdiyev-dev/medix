"use client";

import { Fragment, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * «Yangi hujjat» sahifalari uchun: Next 16 (cacheComponents) sahifani <Activity> bilan yashirib saqlaydi,
 * shuning uchun saqlagandan keyin «Yangi …» qayta bosilsa oldingi maʼlumot formada qolib ketardi.
 * `bfcacheId` push/replace navigatsiyada (Link, router.push) yangilanadi — forma toza ochiladi;
 * brauzerning Orqaga/Oldinga tugmalarida esa qoralama saqlanib qoladi.
 */
export function FreshOnPush({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
