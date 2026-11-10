"use client";

import {
  ArrowLeftRight,
  CalendarClock,
  ChartColumn,
  Factory,
  FileCheck2,
  HandCoins,
  Lock,
  type LucideIcon,
  Package,
  ReceiptText,
  ScanBarcode,
  ScrollText,
  Timer,
  TrendingUp,
  Undo2,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ForbiddenState } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { MyReports } from "./saved-reports";

export type ReportKey =
  | "sales"
  | "gross-profit"
  | "products"
  | "returns"
  | "expenses"
  | "branch-sales"
  | "operators"
  | "supplier-staff"
  | "supplier-company"
  | "pickers"
  | "markers"
  | "customer-debts"
  | "supplier-debts"
  | "reconciliations"
  | "expiry"
  | "audit";

/** Prototip Reports katalogi guruhlari: Savdo; Guruh ichidagi; Xodimlar va taʼminot; Boshqa boʻlimlardagi hisobotlar. */
export type ReportGroup = "sales" | "group" | "staff" | "other";
/** «Boshqa boʻlimlardagi» kartaning boʻlimi (pastki oʻng burchakda «Ombor →»). */
export type ReportSection = "wh" | "money" | "admin";

/** `title`/`description` — uz-Latn (Ctrl+K qidiruvi uchun); UI tarjimasi `reports.catalog.items.<key>` dan. */
export interface ReportEntry {
  key: ReportKey;
  group: ReportGroup;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Hali qurilmagan boʻlsa — null. */
  href: string | null;
  anyOf: string[];
  /** Qoʻshimcha majburiy kalitlar (masalan, tannarxdagi hisobot uchun prices.cost). */
  allOf?: string[];
  /** «Tannarx» belgisi (qulf) — faqat prices.cost bilan ochiladi. */
  cost?: boolean;
  section?: ReportSection;
}

const REPORT_KEYS = ["reports.all", "reports.view"];

/** Hisobotlar katalogi (SPEC 2, 8; prototip Reports). Ruxsat — reports.* kalitlari; boshqa boʻlim sahifalari — oʻsha sahifa ruxsati. */
export const REPORTS: ReportEntry[] = [
  {
    key: "sales",
    group: "sales",
    icon: ChartColumn,
    title: "Savdo",
    description: "Tasdiqlangan sotuvlar va qaytarishlar — filial, mijoz, operator, kun kesimida; chegirma ustuni.",
    href: "/reports/sales",
    anyOf: ["reports.all", "reports.view", "reports.own"],
  },
  {
    key: "gross-profit",
    group: "sales",
    icon: TrendingUp,
    title: "Yalpi foyda",
    description: "Sof savdo minus sotilgan partiyalar tannarxi, marja va ustama.",
    href: "/reports/products",
    anyOf: REPORT_KEYS,
    allOf: ["prices.cost"],
    cost: true,
  },
  {
    key: "products",
    group: "sales",
    icon: Package,
    title: "Mahsulotlar savdosi",
    description: "Dona va sof savdo mahsulot, kategoriya yoki ishlab chiqaruvchi boʻyicha; mijoz filtri.",
    href: "/reports/products",
    anyOf: REPORT_KEYS,
  },
  {
    key: "returns",
    group: "sales",
    icon: Undo2,
    title: "Qaytarishlar",
    description: "QM hujjatlari sabab, mijoz, mahsulot yoki kun boʻyicha; qaytarish ulushi.",
    href: "/reports/returns",
    anyOf: ["reports.all", "reports.view", "reports.own"],
  },
  {
    key: "expenses",
    group: "sales",
    icon: Wallet,
    title: "Xarajatlar",
    description: "Oʻtkazilgan kassa va bank chiqimlari modda, filial, oy yoki kun boʻyicha; Naqd / Bank / Terminal.",
    href: "/reports/expenses",
    anyOf: REPORT_KEYS,
  },
  {
    key: "branch-sales",
    group: "group",
    icon: ArrowLeftRight,
    title: "Filiallararo savdo",
    description: "FS hujjatlari, filiallar matritsasi va guruh ichidagi qarz.",
    href: "/branch-sales",
    anyOf: ["transfer.view", "transfer.fs"],
  },
  {
    key: "operators",
    group: "staff",
    icon: Users,
    title: "Operatorlar savdosi",
    description: "Buyurtma kiritgan xodimlar: buyurtmalar soni va savdo.",
    href: "/reports/sales?groupBy=OPERATOR",
    anyOf: REPORT_KEYS,
  },
  {
    key: "supplier-staff",
    group: "staff",
    icon: UserCheck,
    title: "Taʼminotchi xodim tovari",
    description: "Kirimdagi «Kim nomiga» boʻyicha: Olib keldi, Sotildi, Qoldi tannarxda; Aktiv / Passiv.",
    href: "/reports/supplier-goods?kind=STAFF",
    anyOf: REPORT_KEYS,
    allOf: ["prices.cost"],
  },
  {
    key: "supplier-company",
    group: "staff",
    icon: Factory,
    title: "Taʼminotchi korxona tovari",
    description: "Yetkazib beruvchi boʻyicha: Olib keldi, Sotildi, Qoldi tannarxda.",
    href: "/reports/supplier-goods?kind=COMPANY",
    anyOf: REPORT_KEYS,
    allOf: ["prices.cost"],
  },
  {
    key: "pickers",
    group: "other",
    icon: Timer,
    title: "Yigʻuvchilar natijasi",
    description: "Har yigʻuvchi boʻyicha: buyurtma, qator va dona; vaqtida / kechikkan.",
    href: "/reports/pickers",
    anyOf: ["reports.pickers"],
    section: "wh",
  },
  {
    key: "markers",
    group: "other",
    icon: ScanBarcode,
    title: "Markirovkachilar natijasi",
    description: "Har markirovkachi boʻyicha: skanerlangan va olib tashlangan kodlar; vaqtida / kechikkan.",
    href: "/reports/markers",
    anyOf: ["reports.markers"],
    section: "wh",
  },
  {
    key: "customer-debts",
    group: "other",
    icon: HandCoins,
    title: "Mijozlar qarzi",
    description: "Qarz qoldigʻi, muddatlar va toʻlov taqvimi.",
    href: "/debts/customers",
    anyOf: ["cdebt.view"],
    section: "money",
  },
  {
    key: "supplier-debts",
    group: "other",
    icon: ReceiptText,
    title: "Yetkazib beruvchilar qarzi",
    description: "Yetkazib beruvchilarga qarz va toʻlov muddatlari.",
    href: "/debts/suppliers",
    anyOf: ["sdebt.view"],
    section: "money",
  },
  {
    key: "reconciliations",
    group: "other",
    icon: FileCheck2,
    title: "Akt sverka",
    description: "Kontragent bilan hisob-kitobni solishtirish.",
    href: "/reconciliations",
    anyOf: ["recon.view"],
    section: "money",
  },
  {
    key: "expiry",
    group: "other",
    icon: CalendarClock,
    title: "Muddat nazorati",
    description: "Muddati yaqin va oʻtgan partiyalar.",
    href: "/expiry",
    anyOf: ["expiry.view"],
    section: "wh",
  },
  {
    key: "audit",
    group: "other",
    icon: ScrollText,
    title: "Audit jurnali",
    description: "Tizimdagi barcha harakatlar tarixi.",
    href: "/settings/audit",
    anyOf: ["audit.view"],
    section: "admin",
  },
];

export const REPORT_GROUPS: ReportGroup[] = ["sales", "group", "staff", "other"];

export function visibleReports(perms: string[]): ReportEntry[] {
  return REPORTS.filter((r) => r.anyOf.some((k) => perms.includes(k)) && (r.allOf ?? []).every((k) => perms.includes(k)));
}

/** Koʻrinadigan hisobotlar guruhlar boʻyicha (boʻsh guruh tashlanadi). */
export function groupedReports(perms: string[]): { group: ReportGroup; items: ReportEntry[] }[] {
  const list = visibleReports(perms);
  return REPORT_GROUPS.map((group) => ({ group, items: list.filter((r) => r.group === group) })).filter((g) => g.items.length > 0);
}

export function ReportsCatalog() {
  const t = useTranslations("reports.catalog");
  const me = useMe();
  if (!me.data) return null;
  const groups = groupedReports(me.data.permissions);
  if (!can(me.data, "reports.all") && !can(me.data, "reports.view") && !can(me.data, "reports.own") && groups.length === 0)
    return <ForbiddenState description={t("forbidden")} />;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="mt-1 text-caption text-text-secondary">{t("subtitle")}</p>
      </div>
      <MyReports
        allowed={(href) => groups.some((g) => g.items.some((r) => r.href !== null && href.split("?")[0] === r.href.split("?")[0]))}
      />
      {groups.length === 0 ? (
        <EmptyState icon={ChartColumn} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        groups.map((g) => (
          <section key={g.group} className="flex flex-col gap-3" aria-labelledby={`reports-group-${g.group}`}>
            <h2 id={`reports-group-${g.group}`} className="text-subtitle">
              {t(`groups.${g.group}`)}
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {g.items.map((r) => (
                <li key={r.key}>
                  <ReportCard entry={r} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ReportCard({ entry: r }: { entry: ReportEntry }) {
  const t = useTranslations("reports.catalog");
  const Icon = r.icon;
  const body = (
    <>
      <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon size={20} strokeWidth={1.5} aria-hidden />
      </span>
      <span className={`flex min-w-0 flex-1 flex-col gap-1 ${r.cost ? "pr-[72px]" : ""}`}>
        <span className="text-body font-semibold">{t(`items.${r.key}.title`)}</span>
        <span className="text-caption text-text-secondary">{t(`items.${r.key}.description`)}</span>
      </span>
      {r.cost && (
        <span className="absolute top-3 right-3 flex h-[22px] items-center gap-1 rounded-md bg-background px-2 text-caption font-medium text-text-secondary">
          <Lock size={12} strokeWidth={1.5} aria-hidden /> {t("costTag")}
        </span>
      )}
      {r.section && <span className="absolute right-3 bottom-3 text-caption text-primary">{t(`sections.${r.section}`)} →</span>}
    </>
  );
  const cls = "relative flex h-full min-h-24 items-start gap-3 rounded-[10px] border border-border bg-surface p-4 text-left";
  return r.href ? (
    <Link href={r.href} className={`${cls} hover:bg-background`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
