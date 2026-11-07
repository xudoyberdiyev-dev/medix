"use client";

import { ChartColumn, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { EmptyState, ForbiddenState } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";

export type ReportKey = "sales" | "operators" | "products" | "gross-profit" | "debts" | "stock" | "suppliers" | "pickers" | "markers";

/** `title`/`description` — uz-Latn (Ctrl+K qidiruvi uchun); UI tarjimasi `reports.catalog.items.<key>` dan. */
export interface ReportEntry {
  key: ReportKey;
  title: string;
  description: string;
  /** Hali qurilmagan boʻlsa — null. */
  href: string | null;
  anyOf: string[];
  /** Qoʻshimcha majburiy kalitlar (masalan, tannarxdagi hisobot uchun prices.cost). */
  allOf?: string[];
}

/** Hisobotlar katalogi (SPEC 2, 8). Ruxsat — reports.* kalitlari; tannarx ustunlari hisobotning oʻzida prices.cost bilan. */
export const REPORTS: ReportEntry[] = [
  {
    key: "sales",
    title: "Savdo",
    description: "Sof savdo (sotuv − qaytarish) mijoz, operator, filial yoki kun boʻyicha; tannarx va yalpi foyda — ruxsat bilan.",
    href: "/reports/sales",
    anyOf: ["reports.all", "reports.view", "reports.own"],
  },
  {
    key: "operators",
    title: "Operatorlar savdosi",
    description: "Har operatorning sof savdosi va buyurtmalari tanlangan davrda.",
    href: "/reports/sales?groupBy=OPERATOR",
    anyOf: ["reports.all", "reports.view"],
  },
  {
    key: "products",
    title: "Mahsulotlar savdosi",
    description: "Dona va sof savdo mahsulot, kategoriya yoki ishlab chiqaruvchi boʻyicha; mijoz filtri.",
    href: "/reports/products",
    anyOf: ["reports.all", "reports.view"],
  },
  {
    key: "gross-profit",
    title: "Yalpi foyda",
    description: "Mahsulot, kategoriya yoki ishlab chiqaruvchi boʻyicha tannarx, yalpi foyda (QQSsiz) va rentabellik.",
    href: "/reports/products",
    anyOf: ["reports.all", "reports.view"],
    allOf: ["prices.cost"],
  },
  {
    key: "debts",
    title: "Qarzlar",
    description: "Mijozlar va taʼminotchilar qarzi muddat guruhlari bilan.",
    href: "/debts/customers",
    anyOf: ["cdebt.view", "sdebt.view"],
  },
  {
    key: "stock",
    title: "Qoldiq",
    description: "Ombor va partiyalar boʻyicha qoldiq, .xlsx eksport.",
    href: "/stock",
    anyOf: ["stock.view"],
  },
  {
    key: "suppliers",
    title: "Taʼminotchi xodim va korxona tovari",
    description: "Olib keldi / sotildi / boshqa / qoldi (tannarxda); Aktiv / Passiv.",
    href: "/reports/supplier-goods",
    anyOf: ["reports.all", "reports.view"],
    allOf: ["prices.cost"],
  },
  {
    key: "pickers",
    title: "Yigʻuvchilar natijasi",
    description: "Yigʻilgan buyurtma, qator va dona; vaqtida / kechikkan.",
    href: "/reports/pickers",
    anyOf: ["reports.pickers"],
  },
  {
    key: "markers",
    title: "Markirovkachilar natijasi",
    description: "Skanerlangan va olib tashlangan kodlar; vaqtida / kechikkan.",
    href: "/reports/markers",
    anyOf: ["reports.markers"],
  },
];

export function visibleReports(perms: string[]): ReportEntry[] {
  return REPORTS.filter((r) => r.anyOf.some((k) => perms.includes(k)) && (r.allOf ?? []).every((k) => perms.includes(k)));
}

export function ReportsCatalog() {
  const t = useTranslations("reports.catalog");
  const me = useMe();
  if (!me.data) return null;
  const list = visibleReports(me.data.permissions);
  if (!can(me.data, "reports.all") && !can(me.data, "reports.view") && !can(me.data, "reports.own") && list.length === 0)
    return <ForbiddenState description={t("forbidden")} />;
  return (
    <>
      <h1 className="mb-4 text-page-title">{t("title")}</h1>
      {list.length === 0 ? (
        <EmptyState icon={ChartColumn} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <li key={r.key}>
              {r.href ? (
                <Link href={r.href} className="block h-full">
                  <Card className="h-full hover:bg-background">
                    <div className="flex items-center justify-between gap-2 text-subtitle">
                      <span className="flex items-center gap-2">
                        <ChartColumn size={18} strokeWidth={1.5} aria-hidden /> {t(`items.${r.key}.title`)}
                      </span>
                      <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                    </div>
                    <p className="mt-1 text-caption text-text-secondary">{t(`items.${r.key}.description`)}</p>
                  </Card>
                </Link>
              ) : (
                <Card className="h-full">
                  <div className="flex items-center gap-2 text-subtitle text-text-secondary">
                    <Clock size={18} strokeWidth={1.5} aria-hidden /> {t(`items.${r.key}.title`)}
                  </div>
                  <p className="mt-1 text-caption text-text-secondary">{t(`items.${r.key}.description`)}</p>
                  <p className="mt-2 text-caption text-text-secondary">{t("soon")}</p>
                </Card>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
