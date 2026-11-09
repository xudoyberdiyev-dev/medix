import { matchesSearch } from "@/lib/search";

/** YB qarzi kirimlar boʻyicha (prototip `Payables`): toʻlov kuni boʻlagi, yorliqlar, filtrlar. */
export type PayBucket = "paid" | "late" | "today" | "3d" | "open";
export type PayTab = "all" | "late" | "today" | "3d" | "prepaid";
export const PAY_TABS: PayTab[] = ["all", "late", "today", "3d", "prepaid"];

export interface InvoiceLike {
  number: string;
  supplier: string;
  owner?: string | null;
  left: string;
  paid: string;
  prepaid: boolean;
  days?: number | null;
  paymentType: string;
  branchId: number;
  supplierId: number;
}

const isOpen = (r: InvoiceLike) => r.left !== "0.00" && !r.left.startsWith("-");

export function bucketOf(r: InvoiceLike): PayBucket {
  if (!isOpen(r)) return "paid";
  if (r.days == null) return "open";
  if (r.days < 0) return "late";
  if (r.days === 0) return "today";
  if (r.days <= 3) return "3d";
  return "open";
}

export function inPayTab(r: InvoiceLike, tab: PayTab): boolean {
  if (tab === "all") return isOpen(r) || r.prepaid;
  if (tab === "prepaid") return r.prepaid;
  return bucketOf(r) === tab;
}

export interface PayFilters {
  q: string;
  suppliers: number[];
  branches: number[];
  payTypes: string[];
  owners: string[];
}

export function fitsPay(r: InvoiceLike, f: PayFilters): boolean {
  return (
    (!f.q.trim() || matchesSearch(f.q.trim(), [r.supplier, r.number, r.owner ?? ""])) &&
    (f.suppliers.length === 0 || f.suppliers.includes(r.supplierId)) &&
    (f.branches.length === 0 || f.branches.includes(r.branchId)) &&
    (f.payTypes.length === 0 || f.payTypes.includes(r.paymentType)) &&
    (f.owners.length === 0 || f.owners.includes(r.owner ?? ""))
  );
}
