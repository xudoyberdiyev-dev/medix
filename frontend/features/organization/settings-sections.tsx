"use client";

import { Building2, CircleUser, ScrollText, Settings2, ShieldCheck, Users, Warehouse } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/session";

type SectionKey = "branches" | "warehouses" | "employees" | "roles" | "audit" | "profile" | "setup";

/** Sozlamalar boʻlimlari (SPEC 4: Boshqaruv). Rolga qarab koʻrinadi — yakuniy ruxsat serverda. Nomi va tavsifi — `organization.sections.<key>` lugʻatida. */
export const SETTINGS_SECTIONS: { key: SectionKey; href: string; icon: typeof Users; anyOf?: string[] }[] = [
  { key: "branches", href: "/settings/branches", icon: Building2, anyOf: ["branches.view"] },
  { key: "warehouses", href: "/settings/warehouses", icon: Warehouse, anyOf: ["warehouses.view"] },
  { key: "employees", href: "/settings/employees", icon: Users, anyOf: ["staff.view"] },
  { key: "roles", href: "/settings/roles", icon: ShieldCheck, anyOf: ["roles.view"] },
  { key: "audit", href: "/settings/audit", icon: ScrollText, anyOf: ["audit.view"] },
  { key: "profile", href: "/profile", icon: CircleUser },
  { key: "setup", href: "/setup", icon: Settings2, anyOf: ["company.edit"] },
];

export function sectionsFor(permissions: string[] | undefined) {
  if (!permissions) return [];
  return SETTINGS_SECTIONS.filter((s) => !s.anyOf || s.anyOf.some((k) => permissions.includes(k)));
}

export function SettingsSections() {
  const me = useMe();
  const t = useTranslations("organization.sections");
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
      {sectionsFor(me.data?.permissions).map(({ key, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex gap-3 rounded-card border border-border bg-surface p-5 transition-colors duration-150 hover:border-text-disabled"
        >
          <Icon size={20} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="block text-subtitle">{t(`${key}.title`)}</span>
            <span className="mt-1 block text-text-secondary">{t(`${key}.description`)}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
