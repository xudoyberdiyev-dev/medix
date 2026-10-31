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
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** Menyu tuzilmasi (SPEC 4-boʻlim). Rolga qarab filtrlash 1-bosqichda qoʻshiladi. */
export const navigation: NavGroup[] = [
  { items: [{ key: "home", label: "Bosh sahifa", href: "/", icon: LayoutDashboard }] },
  { title: "Savdo", items: [{ key: "orders", label: "Buyurtmalar", href: "/orders", icon: ClipboardList }] },
  {
    title: "Ombor",
    items: [
      { key: "receipts", label: "Kirim", href: "/receipts", icon: PackagePlus },
      { key: "stock", label: "Qoldiqlar", href: "/stock", icon: Boxes },
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
  { title: "Boshqaruv", items: [{ key: "settings", label: "Sozlamalar", href: "/settings", icon: Settings }] },
];
