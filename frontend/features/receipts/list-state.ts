import type { PageSize } from "@/components/ui/pagination";
import type { components } from "@/lib/api/schema";

type ReceiptStatus = components["schemas"]["ReceiptDetail"]["status"];

export const RECEIPT_STATUSES: readonly ReceiptStatus[] = ["DRAFT", "ACCEPTED", "POSTED", "CANCELLED"];
export const RECEIPT_SORTS = ["CREATED", "NUMBER", "DATE", "AMOUNT", "DUE"] as const;
export type ReceiptSort = (typeof RECEIPT_SORTS)[number];
export const RECEIPT_PAGE_SIZES: PageSize[] = [20, 50, 100];

/** Kirimlar roʻyxati filtrlari (prototip `Receipts`) — URL'da saqlanadi. */
export interface ReceiptFilters {
  status: ReceiptStatus | null;
  q: string;
  suppliers: number[];
  warehouses: number[];
  from: string | null;
  to: string | null;
  sort: ReceiptSort;
  desc: boolean;
  page: number;
  size: PageSize;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ids = (v: string | null): number[] =>
  (v ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

export function parseReceiptFilters(p: Pick<URLSearchParams, "get">): ReceiptFilters {
  const status = p.get("status")?.toUpperCase() as ReceiptStatus | undefined;
  const sort = p.get("sort") as ReceiptSort | null;
  const size = Number(p.get("size")) as PageSize;
  const page = Number(p.get("page"));
  const from = p.get("from");
  const to = p.get("to");
  // Hisobotdan oʻtish: ?supplierId=… (Taʼminotchi korxona tovari) — «Yetkazib beruvchi» filtri
  const suppliers = [...new Set([...ids(p.get("supplier")), ...ids(p.get("supplierId"))])];
  return {
    status: status && RECEIPT_STATUSES.includes(status) ? status : null,
    q: p.get("q") ?? "",
    suppliers,
    warehouses: ids(p.get("wh")),
    from: from && ISO.test(from) ? from : null,
    to: to && ISO.test(to) ? to : null,
    sort: sort && RECEIPT_SORTS.includes(sort) ? sort : "CREATED",
    desc: p.get("desc") === "1",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    size: RECEIPT_PAGE_SIZES.includes(size) ? size : 50,
  };
}

export function serializeReceiptFilters(f: ReceiptFilters): string {
  const q = new URLSearchParams();
  if (f.status) q.set("status", f.status.toLowerCase());
  if (f.q.trim()) q.set("q", f.q.trim());
  if (f.suppliers.length) q.set("supplier", f.suppliers.join(","));
  if (f.warehouses.length) q.set("wh", f.warehouses.join(","));
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.sort !== "CREATED") {
    q.set("sort", f.sort);
    if (f.desc) q.set("desc", "1");
  }
  if (f.page > 1) q.set("page", String(f.page));
  if (f.size !== 50) q.set("size", String(f.size));
  return q.toString();
}

/** API soʻrovi (roʻyxat va .xlsx uchun bir xil). */
export function receiptQuery(f: ReceiptFilters, branchId: number | null) {
  return {
    branchId: branchId ?? undefined,
    status: f.status ?? undefined,
    supplierId: f.suppliers.length ? f.suppliers : undefined,
    warehouseId: f.warehouses.length ? f.warehouses : undefined,
    from: f.from ?? undefined,
    to: f.to ?? undefined,
    q: f.q.trim() || undefined,
    sort: f.sort === "CREATED" ? undefined : f.sort,
    desc: f.sort === "CREATED" ? undefined : f.desc,
  };
}

/** Kirimlar .xlsx — roʻyxat filtrlari bilan; `ids` — faqat tanlangan qatorlar. */
export function receiptsExportHref(f: ReceiptFilters, branchId: number | null, selected: number[] = []): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(receiptQuery(f, branchId))) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)));
    else q.set(k, String(v));
  }
  selected.forEach((id) => q.append("id", String(id)));
  const qs = q.toString();
  return `/api/receipts/export${qs ? `?${qs}` : ""}`;
}

/** Qoralama yoshi (kun) — kirim sanasidan bugungacha (Toshkent). */
export function draftAgeDays(receiptDate: string, todayIso: string): number {
  const d = Date.parse(`${receiptDate}T00:00:00Z`);
  const t = Date.parse(`${todayIso}T00:00:00Z`);
  return Number.isNaN(d) || Number.isNaN(t) ? 0 : Math.max(0, Math.round((t - d) / 86400000));
}

/** Toʻlov kuni rangi (prototip): oʻtkazilgan kirimda — muddati oʻtgan qizil, 3 kun ichida sariq; boshqalarida — oddiy. */
export function dueTone(status: ReceiptStatus, dueDate: string | null, todayIso: string): "danger" | "warning" | "default" | "muted" {
  if (!dueDate) return "muted";
  if (status === "CANCELLED") return "muted";
  if (status !== "POSTED") return "default";
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86400000);
  return days < 0 ? "danger" : days <= 3 ? "warning" : "default";
}
