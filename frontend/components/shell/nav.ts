import {
  Banknote,
  Boxes,
  CalendarClock,
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  PackagePlus,
  Pill,
  Settings,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Koʻradigan rollar; berilmasa — panel rollaridan boshqa hamma. Ruxsatlar matritsasi (1.3) kelganda kalitga oʻtadi. */
  roles?: string[];
  /** Koʻrmaydigan rollar (SPEC 3: Buxgalterga Qoldiqlar yopiq). */
  hiddenFor?: string[];
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** Menyu tuzilmasi (SPEC 4-boʻlim). Rolga qarab filtrlash 1-bosqichda qoʻshiladi. */
export const navigation: NavGroup[] = [
  { items: [{ key: "home", label: "Bosh sahifa", href: "/", icon: LayoutDashboard, roles: ["*"] }] },
  { title: "Savdo", items: [{ key: "orders", label: "Buyurtmalar", href: "/orders", icon: ClipboardList }] },
  {
    title: "Ombor",
    items: [
      { key: "receipts", label: "Kirim", href: "/receipts", icon: PackagePlus },
      { key: "stock", label: "Qoldiqlar", href: "/stock", icon: Boxes, hiddenFor: ["ACCOUNTANT"] },
      { key: "expiry", label: "Muddat nazorati", href: "/expiry", icon: CalendarClock },
    ],
  },
  {
    title: "Pul",
    items: [
      { key: "payments", label: "Toʻlovlar", href: "/payments", icon: Wallet },
      { key: "cash", label: "Kassa", href: "/cash", icon: Banknote },
    ],
  },
  {
    title: "Maʼlumotnomalar",
    items: [
      { key: "products", label: "Mahsulotlar", href: "/products", icon: Pill },
      { key: "customers", label: "Mijozlar", href: "/customers", icon: Users },
      { key: "suppliers", label: "Yetkazib beruvchilar", href: "/suppliers", icon: Truck },
      { key: "prices", label: "Narxlar", href: "/prices", icon: Tags },
    ],
  },
  { title: "Tahlil", items: [{ key: "reports", label: "Hisobotlar", href: "/reports", icon: ChartColumn }] },
  {
    title: "Boshqaruv",
    items: [{ key: "settings", label: "Sozlamalar", href: "/settings", icon: Settings, roles: ["DIRECTOR", "ADMIN", "BRANCH_MANAGER"] }],
  },
];

/** Yigʻuvchi, Markirovkachi, Haydovchi — menyuda faqat panel (SPEC 3). Panellar 7–8-bosqichda. */
export const PANEL_ROLES = ["PICKER", "MARKER", "DRIVER"];

/** Rolga qarab menyu: frontend faqat koʻrinishni boshqaradi, yakuniy ruxsat serverda. */
export function navigationFor(roleCode: string | undefined): NavGroup[] {
  if (!roleCode) return [];
  return navigation
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => {
        if (i.hiddenFor?.includes(roleCode)) return false;
        if (i.roles) return i.roles.includes("*") || i.roles.includes(roleCode);
        return !PANEL_ROLES.includes(roleCode);
      }),
    }))
    .filter((g) => g.items.length > 0);
}
