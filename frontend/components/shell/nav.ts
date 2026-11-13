import {
  Archive,
  ArrowLeftRight,
  Banknote,
  Boxes,
  Building,
  Building2,
  CalendarClock,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Database,
  Factory,
  FileCheck2,
  HandCoins,
  House,
  LayoutGrid,
  Landmark,
  List,
  MapPinned,
  MonitorDot,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Pill,
  ReceiptText,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  Stamp,
  Tag,
  Truck,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type navGroups from "@/messages/uz-Latn/navGroups.json";
import type nav from "@/messages/uz-Latn/nav.json";

export type NavKey = keyof typeof nav;
export type NavGroupKey = keyof typeof navGroups;

export interface NavItem {
  /** Lugʻat kaliti ham (`nav.<key>`); `label` — uz-Latn matni (lugʻat bilan bir xil, testda tekshiriladi). */
  key: NavKey;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Koʻrish uchun ruxsat kalitlaridan biri kerak (1.3, T12 §7 «Menyu sahifalari»); berilmasa — hamma. */
  anyOf?: string[];
  /** Shu band ostidagi boshqa sahifalar (yorliqlar): ularda ham band faol koʻrinadi. */
  also?: string[];
  /** Panel bandi — faqat bosh sahifasi shu panel boʻlgan rolga koʻrinadi (prototip: Monitor/Yigʻish/Markirovka/Reysim — oʻz rollari uchun). */
  panel?: string;
  /** Yorliqli band: manzil — foydalanuvchiga ruxsatli birinchi yorliq (masalan, Xarid uchun «Qaytarish» → YB ga qaytarish). */
  hub?: HubKey;
  /** Faqat aynan shu manzilda faol (ichki sahifalarning oʻz bandi bor — masalan, Sozlamalar va Boshqaruv bandlari). */
  exact?: boolean;
}

export interface NavGroup {
  /** Lugʻat kaliti (`navGroups.<key>`); sarlavhasiz guruhda yoʻq. */
  key?: NavGroupKey;
  title?: string;
  items: NavItem[];
}

export type HubTabKey =
  | "transfersAll"
  | "transfersWarehouse"
  | "transfersZone"
  | "transfersBranch"
  | "returnsCustomer"
  | "returnsWriteOffs"
  | "returnsSupplier"
  | "supplierDebtsDebts"
  | "supplierDebtsBonus";

export interface HubTab {
  key: HubTabKey;
  href: string;
  anyOf: string[];
}

/** Koʻchirishning istalgan turini koʻrish ruxsatlari. */
export const TRANSFER_ANY = [
  "transfer.view",
  "transfer.zk",
  "transfer.quar",
  "transfer.ok",
  "transfer.fs",
  "transfer.send",
  "transfer.receive",
] as const;

/** Bitta menyu bandi ostidagi sahifalar (prototip: «Koʻchirish», «Qaytarish va hisobdan chiqarish», YB qarzi → Bonus balans). */
export const HUBS = {
  transfers: [
    { key: "transfersAll", href: "/transfers", anyOf: [...TRANSFER_ANY] },
    {
      key: "transfersWarehouse",
      href: "/warehouse-transfers",
      anyOf: ["transfer.view", "transfer.ok", "transfer.send", "transfer.receive"],
    },
    { key: "transfersZone", href: "/zone-transfers", anyOf: ["transfer.view", "transfer.zk", "transfer.quar"] },
    { key: "transfersBranch", href: "/branch-sales", anyOf: ["transfer.view", "transfer.fs", "transfer.send", "transfer.receive"] },
  ],
  returns: [
    { key: "returnsCustomer", href: "/customer-returns", anyOf: ["qm.view", "qm.create", "qm.approve"] },
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

/** Koʻchirishning uch turi — bitta «Koʻchirish» bandi, sahifalarda yorliqlar. */
export const TRANSFER_PAGES = ["/transfers", "/warehouse-transfers", "/zone-transfers", "/branch-sales"] as const;
/** «Qaytarish va hisobdan chiqarish» yorliqlari. */
export const RETURN_PAGES = ["/customer-returns", "/write-offs", "/supplier-returns"] as const;

/** Menyu tuzilmasi — prototip `Medix ERP` (NAV) bilan aynan. */
export const navigation: NavGroup[] = [
  { items: [{ key: "home", label: "Bosh sahifa", href: "/", icon: House }] },
  {
    // Panel rollari (Ombor mudiri, Yigʻuvchi, Markirovkachi, Haydovchi) — faqat oʻz paneli
    items: [
      { key: "warehouse", label: "Monitor", href: "/warehouse", icon: MonitorDot, anyOf: ["orders.queue"], panel: "keeper" },
      { key: "picking", label: "Yigʻish", href: "/picking", icon: ClipboardCheck, anyOf: ["picking.do"], panel: "picker" },
      { key: "marking", label: "Markirovka", href: "/marking", icon: ScanLine, anyOf: ["marking.scan"], panel: "marker" },
      { key: "driver", label: "Reysim", href: "/driver", icon: Truck, anyOf: ["trip.driver"], panel: "driver" },
    ],
  },
  {
    key: "sales",
    title: "Savdo",
    items: [
      {
        key: "orders",
        label: "Buyurtmalar",
        href: "/orders",
        icon: ClipboardList,
        anyOf: ["orders.create", "orders.manage", "orders.queue"],
      },
      {
        key: "approvals",
        label: "Tasdiqlash",
        href: "/approvals",
        icon: Stamp,
        anyOf: ["approvals.view", "approvals.branch", "approvals.director"],
      },
      { key: "shipments", label: "Joʻnatish", href: "/shipments", icon: PackageCheck, anyOf: ["shipments.view"] },
    ],
  },
  {
    key: "warehouse",
    title: "Ombor",
    items: [
      { key: "receipts", label: "Kirim", href: "/receipts", icon: PackagePlus, anyOf: ["receipt.view"] },
      { key: "stock", label: "Qoldiqlar", href: "/stock", icon: Boxes, anyOf: ["stock.view"] },
      { key: "expiry", label: "Muddat nazorati", href: "/expiry", icon: CalendarClock, anyOf: ["expiry.view"] },
      {
        key: "transfers",
        label: "Koʻchirish",
        href: TRANSFER_PAGES[0],
        also: [...TRANSFER_PAGES],
        hub: "transfers",
        icon: ArrowLeftRight,
        anyOf: [...TRANSFER_ANY],
      },
      {
        key: "inventory-counts",
        label: "Inventarizatsiya",
        href: "/inventory-counts",
        icon: ClipboardCheck,
        anyOf: ["inventory.view", "inventory.create", "inventory.count", "inventory.approve"],
      },
      {
        key: "returns",
        label: "Qaytarish va hisobdan chiqarish",
        href: RETURN_PAGES[0],
        also: [...RETURN_PAGES],
        hub: "returns",
        icon: PackageMinus,
        anyOf: ["qm.view", "qm.create", "qm.approve", "hc.view", "hc.create", "hc.approve", "qy.view", "qy.create", "qy.approve"],
      },
      { key: "reserveCodes", label: "Zaxira kodlar", href: "/reserve-codes", icon: Archive, anyOf: ["zcodes.view"] },
      { key: "opening", label: "Boshlangʻich qoldiq", href: "/opening", icon: Database, anyOf: ["opening.list", "opening.view"] },
    ],
  },
  {
    key: "money",
    title: "Pul",
    items: [
      { key: "payments", label: "Toʻlovlar", href: "/payments", icon: Wallet, anyOf: ["payments.view"] },
      { key: "cash", label: "Kassa", href: "/cash", icon: Banknote, anyOf: ["cash.view"] },
      { key: "bank", label: "Bank", href: "/bank", icon: Landmark, anyOf: ["bank.view"] },
      { key: "customer-debts", label: "Mijozlar qarzi", href: "/debts/customers", icon: HandCoins, anyOf: ["cdebt.view"] },
      {
        key: "supplier-debts",
        label: "Yetkazib beruvchilar qarzi",
        href: "/debts/suppliers",
        also: ["/bonuses"],
        hub: "supplierDebts",
        icon: ReceiptText,
        anyOf: ["sdebt.view", "supplierBonus.confirm"],
      },
      { key: "reconciliations", label: "Akt sverka", href: "/reconciliations", icon: FileCheck2, anyOf: ["recon.view"] },
    ],
  },
  {
    key: "references",
    title: "Maʼlumotnomalar",
    items: [
      { key: "products", label: "Mahsulotlar", href: "/products", icon: Pill, anyOf: ["products.view"] },
      { key: "customers", label: "Mijozlar", href: "/customers", icon: Users, anyOf: ["clients.view"] },
      { key: "suppliers", label: "Yetkazib beruvchilar", href: "/suppliers", icon: Factory, anyOf: ["suppliers.view"] },
      { key: "prices", label: "Narxlar", href: "/prices", icon: Tag, anyOf: ["prices.view"] },
      { key: "salesZones", label: "Savdo zonalari", href: "/sales-zones", icon: MapPinned, anyOf: ["salesZones.view", "salesZones.edit"] },
      { key: "dictionaries", label: "Boshqa maʼlumotnomalar", href: "/dictionaries", icon: List, anyOf: ["lookups.view"] },
    ],
  },
  {
    // Prototip: «Hisobotlar» — sarlavhasiz, yuqori darajadagi band
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
    key: "admin",
    title: "Boshqaruv",
    items: [
      { key: "company", label: "Kompaniya", href: "/company", icon: Building, anyOf: ["company.view", "company.edit"] },
      { key: "branches", label: "Filiallar", href: "/settings/branches", icon: Building2, anyOf: ["branches.view"] },
      { key: "warehouses", label: "Omborlar va zonalar", href: "/settings/warehouses", icon: LayoutGrid, anyOf: ["warehouses.view"] },
      { key: "staff", label: "Xodimlar", href: "/settings/employees", icon: UsersRound, anyOf: ["staff.view"] },
      { key: "roles", label: "Rollar va ruxsatlar", href: "/settings/roles", icon: ShieldCheck, anyOf: ["roles.view"] },
      { key: "audit", label: "Audit jurnali", href: "/settings/audit", icon: ScrollText, anyOf: ["audit.view"] },
      {
        key: "settings",
        label: "Sozlamalar",
        href: "/settings",
        exact: true,
        icon: Settings,
        anyOf: ["settings.view"],
      },
    ],
  },
];

/** Band faolmi: oʻz manzili yoki `also` sahifalaridan biri (va ularning ichki sahifalari). */
export function isNavActive(pathname: string, item: Pick<NavItem, "href" | "also" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  const hit = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return hit(item.href) || (item.also ?? []).some(hit);
}

/** Ruxsatga qarab menyu (`home` — rolning bosh sahifasi; berilmasa panel bandlari ham qoladi — buyruqlar oynasi uchun): frontend faqat koʻrinishni boshqaradi, yakuniy ruxsat serverda. */
export function navigationFor(permissions: string[] | undefined, home?: string): NavGroup[] {
  if (!permissions) return [];
  return navigation
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => (!i.panel || home === undefined || i.panel === home) && (!i.anyOf || i.anyOf.some((k) => permissions.includes(k))))
        .map((i) => (i.hub ? { ...i, href: hubTabsFor(i.hub, permissions)[0]?.href ?? i.href } : i)),
    }))
    .filter((g) => g.items.length > 0);
}
