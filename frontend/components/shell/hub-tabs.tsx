"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/session";
import { cn } from "@/lib/cn";

type HubTabKey =
  | "transfersWarehouse"
  | "transfersZone"
  | "transfersBranch"
  | "returnsWriteOffs"
  | "returnsSupplier"
  | "supplierDebtsDebts"
  | "supplierDebtsBonus";

interface HubTab {
  key: HubTabKey;
  href: string;
  anyOf: string[];
}

/** Bitta menyu bandi ostidagi sahifalar (prototip: «Koʻchirish», «Qaytarish va hisobdan chiqarish», YB qarzi → Bonus balans). */
export const HUBS = {
  transfers: [
    {
      key: "transfersWarehouse",
      href: "/warehouse-transfers",
      anyOf: ["transfer.view", "transfer.ok", "transfer.send", "transfer.receive"],
    },
    { key: "transfersZone", href: "/zone-transfers", anyOf: ["transfer.view", "transfer.zk", "transfer.quar"] },
    { key: "transfersBranch", href: "/branch-sales", anyOf: ["transfer.view", "transfer.fs", "transfer.send", "transfer.receive"] },
  ],
  returns: [
    { key: "returnsWriteOffs", href: "/write-offs", anyOf: ["hc.view", "hc.create", "hc.approve"] },
    { key: "returnsSupplier", href: "/supplier-returns", anyOf: ["qy.view", "qy.create", "qy.approve"] },
  ],
  supplierDebts: [
    { key: "supplierDebtsDebts", href: "/debts/suppliers", anyOf: ["sdebt.view"] },
    { key: "supplierDebtsBonus", href: "/bonuses", anyOf: ["sdebt.view", "supplierBonus.confirm"] },
  ],
} satisfies Record<string, HubTab[]>;

export type HubKey = keyof typeof HUBS;

/** Ruxsat boʻyicha koʻrinadigan yorliqlar (bittasi qolsa — yorliq qatori koʻrsatilmaydi). */
export function hubTabsFor(hub: HubKey, permissions: string[] | undefined): HubTab[] {
  if (!permissions) return [];
  return HUBS[hub].filter((t) => t.anyOf.some((k) => permissions.includes(k)));
}

/** Sahifalararo yorliqlar (havola) — sarlavha ustida, prototipdagi chiziqli yorliqlar uslubida. */
export function HubTabs({ hub, className }: { hub: HubKey; className?: string }) {
  const t = useTranslations("shell.hubTabs");
  const pathname = usePathname();
  const me = useMe();
  const tabs = hubTabsFor(hub, me.data?.permissions);
  if (tabs.length < 2) return null;
  return (
    <nav
      aria-label={t(hub)}
      className={cn("mb-4 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] print:hidden", className)}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-3 font-medium whitespace-nowrap transition-colors duration-150 ease-out",
              active
                ? "border-primary text-text-primary"
                : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
