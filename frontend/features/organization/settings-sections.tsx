"use client";

import { Building2, CircleUser, ScrollText, Settings2, Users, Warehouse } from "lucide-react";
import Link from "next/link";
import { useMe } from "@/features/auth/session";

const ADMINS = ["DIRECTOR", "ADMIN"];

/** Sozlamalar boʻlimlari (SPEC 4: Boshqaruv). Rolga qarab koʻrinadi — yakuniy ruxsat serverda. */
export const SETTINGS_SECTIONS = [
  { href: "/settings/branches", icon: Building2, title: "Filiallar", description: "Kod, STIR, yuridik nom; nofaol qilish", roles: ADMINS },
  {
    href: "/settings/warehouses",
    icon: Warehouse,
    title: "Omborlar va zonalar",
    description: "Omborlar, Sovuq va Seyf zonalari",
    roles: [...ADMINS, "BRANCH_MANAGER"],
  },
  {
    href: "/settings/employees",
    icon: Users,
    title: "Xodimlar",
    description: "Loginlar, rollar, bloklash, vaqtinchalik parol",
    roles: ADMINS,
  },
  { href: "/settings/audit", icon: ScrollText, title: "Audit jurnali", description: "Kim, qachon, nima oʻzgartirdi", roles: ADMINS },
  { href: "/profile", icon: CircleUser, title: "Profil", description: "Telefon, parol, PIN", roles: ["*"] },
  {
    href: "/setup",
    icon: Settings2,
    title: "Sozlash ustasi",
    description: "Birinchi ishga tushirish: kompaniya, filiallar, omborlar",
    roles: ["DIRECTOR"],
  },
];

export function sectionsFor(roleCode: string | undefined) {
  if (!roleCode) return [];
  return SETTINGS_SECTIONS.filter((s) => s.roles.includes("*") || s.roles.includes(roleCode));
}

export function SettingsSections() {
  const me = useMe();
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
      {sectionsFor(me.data?.role.code).map(({ href, icon: Icon, title, description }) => (
        <Link
          key={href}
          href={href}
          className="flex gap-3 rounded-card border border-border bg-surface p-5 transition-colors duration-150 hover:border-text-disabled"
        >
          <Icon size={20} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="block text-subtitle">{title}</span>
            <span className="mt-1 block text-text-secondary">{description}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
