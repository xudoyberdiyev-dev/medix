import {
  FileMinus,
  ArrowRightLeft,
  Banknote,
  BadgeDollarSign,
  Gift,
  BookOpen,
  Boxes,
  CalendarClock,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  MonitorDot,
  PackageOpen,
  PackagePlus,
  Pill,
  ScanLine,
  Settings,
  Tags,
  Truck,
  Users,
  Wallet,
  Warehouse,
  HandCoins,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Koʻrish uchun ruxsat kalitlaridan biri kerak (1.3, T12 §7 «Menyu sahifalari»); berilmasa — hamma. */
  anyOf?: string[];
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** Menyu tuzilmasi (SPEC 4-boʻlim). Rolga qarab filtrlash 1-bosqichda qoʻshiladi. */
export const navigation: NavGroup[] = [
  { items: [{ key: "home", label: "Bosh sahifa", href: "/", icon: LayoutDashboard }] },
  {
    title: "Savdo",
    items: [
      {
        key: "orders",
        label: "Buyurtmalar",
        href: "/orders",
        icon: ClipboardList,
        anyOf: ["orders.create", "orders.manage", "orders.queue"],
      },
    ],
  },
  {
    title: "Ombor",
    items: [
      { key: "warehouse", label: "Monitor", href: "/warehouse", icon: MonitorDot, anyOf: ["orders.queue"] },
      { key: "receipts", label: "Kirim", href: "/receipts", icon: PackagePlus, anyOf: ["receipt.view"] },
      { key: "picking", label: "Yigʻish", href: "/picking", icon: ClipboardCheck, anyOf: ["picking.do"] },
      { key: "marking", label: "Markirovka", href: "/marking", icon: ScanLine, anyOf: ["marking.scan"] },
      { key: "shipments", label: "Joʻnatish", href: "/shipments", icon: Truck, anyOf: ["shipments.view"] },
      { key: "driver", label: "Reysim", href: "/driver", icon: Truck, anyOf: ["trip.driver"] },
      { key: "stock", label: "Qoldiqlar", href: "/stock", icon: Boxes, anyOf: ["stock.view"] },
      {
        key: "zone-transfers",
        label: "Zona koʻchirishlari",
        href: "/zone-transfers",
        icon: ArrowRightLeft,
        anyOf: ["transfer.view", "transfer.zk", "transfer.quar"],
      },
      {
        key: "warehouse-transfers",
        label: "Ombor koʻchirishlari",
        href: "/warehouse-transfers",
        icon: Warehouse,
        anyOf: ["transfer.view", "transfer.ok", "transfer.send", "transfer.receive"],
      },
      {
        key: "write-offs",
        label: "Hisobdan chiqarish",
        href: "/write-offs",
        icon: FileMinus,
        anyOf: ["hc.view", "hc.create", "hc.approve"],
      },
      { key: "expiry", label: "Muddat nazorati", href: "/expiry", icon: CalendarClock, anyOf: ["expiry.view"] },
      { key: "opening", label: "Boshlangʻich qoldiq", href: "/opening", icon: PackageOpen, anyOf: ["opening.list", "opening.view"] },
    ],
  },
  {
    title: "Pul",
    items: [
      { key: "payments", label: "Toʻlovlar", href: "/payments", icon: Wallet, anyOf: ["payments.view"] },
      { key: "cash", label: "Kassa", href: "/cash", icon: Banknote, anyOf: ["cash.view"] },
      { key: "customer-debts", label: "Mijozlar qarzi", href: "/debts/customers", icon: HandCoins, anyOf: ["cdebt.view"] },
      { key: "supplier-debts", label: "YB qarzi", href: "/debts/suppliers", icon: BadgeDollarSign, anyOf: ["sdebt.view"] },
      { key: "bonuses", label: "Bonus balans", href: "/bonuses", icon: Gift, anyOf: ["sdebt.view", "supplierBonus.confirm"] },
    ],
  },
  {
    title: "Maʼlumotnomalar",
    items: [
      { key: "products", label: "Mahsulotlar", href: "/products", icon: Pill, anyOf: ["products.view"] },
      { key: "customers", label: "Mijozlar", href: "/customers", icon: Users, anyOf: ["clients.view"] },
      { key: "suppliers", label: "Yetkazib beruvchilar", href: "/suppliers", icon: Truck, anyOf: ["suppliers.view"] },
      { key: "prices", label: "Narxlar", href: "/prices", icon: Tags, anyOf: ["prices.view"] },
      { key: "dictionaries", label: "Kichik maʼlumotnomalar", href: "/dictionaries", icon: BookOpen, anyOf: ["lookups.view"] },
    ],
  },
  {
    title: "Tahlil",
    items: [
      {
        key: "reports",
        label: "Hisobotlar",
        href: "/reports",
        icon: ChartColumn,
        anyOf: ["reports.view", "reports.own", "reports.pickers", "reports.markers"],
      },
    ],
  },
  {
    title: "Boshqaruv",
    items: [
      {
        key: "settings",
        label: "Sozlamalar",
        href: "/settings",
        icon: Settings,
        anyOf: ["staff.view", "audit.view", "branches.view", "warehouses.view", "roles.view", "company.view"],
      },
    ],
  },
];

/** Ruxsatga qarab menyu: frontend faqat koʻrinishni boshqaradi, yakuniy ruxsat serverda. */
export function navigationFor(permissions: string[] | undefined): NavGroup[] {
  if (!permissions) return [];
  return navigation
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.anyOf || i.anyOf.some((k) => permissions.includes(k))) }))
    .filter((g) => g.items.length > 0);
}
