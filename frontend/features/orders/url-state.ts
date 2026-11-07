import type { components } from "@/lib/api/schema";

type OrderStatus = components["schemas"]["OrderDetail"]["status"];

export const ORDER_SORTS = ["CREATED", "NUMBER", "DATE", "CUSTOMER", "TOTAL"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

const STATUSES: readonly OrderStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "QUEUED",
  "PICKING",
  "MARKING",
  "CHECKING",
  "DOCUMENTING",
  "LOADING",
  "IN_TRANSIT",
  "DELIVERED",
  "UNDELIVERED",
  "REJECTED",
  "CANCELLED",
];

/** Buyurtmalar jadvali filtrlari — URL'da saqlanadi (SPEC 120: havola orqali shu koʻrinishni ochish mumkin). */
export interface OrderFilters {
  status: OrderStatus | null;
  q: string;
  mine: boolean;
  customer: { id: number; name: string } | null;
  operator: { id: number; name: string } | null;
  /** Sotuv/qaytarish davri (Savdo hisobotidan oʻtish). */
  soldFrom: string | null;
  soldTo: string | null;
  /** Buyurtma sanasi. */
  orderFrom: string | null;
  orderTo: string | null;
  sort: OrderSort;
  desc: boolean;
  /** 1 dan boshlanadi. */
  page: number;
}

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  status: null,
  q: "",
  mine: false,
  customer: null,
  operator: null,
  soldFrom: null,
  soldTo: null,
  orderFrom: null,
  orderTo: null,
  sort: "CREATED",
  desc: true,
  page: 1,
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (v: string | null): string | null => (v && ISO_DAY.test(v) ? v : null);
const positiveInt = (v: string | null): number | null => (v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null);

function ref(params: URLSearchParams, idKey: string, nameKey: string, fallback: string): { id: number; name: string } | null {
  const id = positiveInt(params.get(idKey));
  return id ? { id, name: params.get(nameKey) || `${fallback} #${id}` } : null;
}

export function parseOrderFilters(params: URLSearchParams, names: { customer: string; operator: string }): OrderFilters {
  const status = params.get("status");
  const sort = params.get("sort");
  const isSort = (ORDER_SORTS as readonly string[]).includes(sort ?? "");
  const dir = params.get("dir");
  return {
    status: (STATUSES as readonly string[]).includes(status ?? "") ? (status as OrderStatus) : null,
    q: params.get("q") ?? "",
    mine: params.get("mine") === "1",
    customer: ref(params, "customerId", "customer", names.customer),
    operator: ref(params, "operatorId", "operator", names.operator),
    soldFrom: isoDay(params.get("soldFrom")),
    soldTo: isoDay(params.get("soldTo")),
    orderFrom: isoDay(params.get("from")),
    orderTo: isoDay(params.get("to")),
    sort: isSort ? (sort as OrderSort) : "CREATED",
    // Standart: kiritilgan vaqti — yangisi tepada; boshqa ustunlar — oʻsish tartibida
    desc: dir === "desc" ? true : dir === "asc" ? false : !isSort || sort === "CREATED",
    page: positiveInt(params.get("page")) ?? 1,
  };
}

/** Faqat standartdan farq qiladigan qiymatlar yoziladi — havola qisqa boʻlsin. */
export function serializeOrderFilters(f: OrderFilters): string {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.mine) p.set("mine", "1");
  if (f.customer) {
    p.set("customerId", String(f.customer.id));
    p.set("customer", f.customer.name);
  }
  if (f.operator) {
    p.set("operatorId", String(f.operator.id));
    p.set("operator", f.operator.name);
  }
  if (f.soldFrom) p.set("soldFrom", f.soldFrom);
  if (f.soldTo) p.set("soldTo", f.soldTo);
  if (f.orderFrom) p.set("from", f.orderFrom);
  if (f.orderTo) p.set("to", f.orderTo);
  if (f.sort !== "CREATED") p.set("sort", f.sort);
  const defaultDesc = f.sort === "CREATED";
  if (f.desc !== defaultDesc) p.set("dir", f.desc ? "desc" : "asc");
  if (f.page > 1) p.set("page", String(f.page));
  return p.toString();
}

/** Filtr qoʻllanganmi (qidiruv ham) — «Natija yoʻq» yoki «Hali buyurtma yoʻq» holatini tanlash uchun. */
export function hasOrderFilters(f: OrderFilters): boolean {
  return Boolean(f.status || f.q.trim() || f.mine || f.customer || f.operator || f.soldFrom || f.soldTo || f.orderFrom || f.orderTo);
}

/** API soʻrovi parametrlari (roʻyxat va .xlsx eksport — bir xil). */
export function orderQuery(f: OrderFilters, branchId: number | null) {
  return {
    branchId: branchId ?? undefined,
    status: f.status ?? undefined,
    q: f.q.trim() || undefined,
    mine: f.mine || undefined,
    customerId: f.customer?.id,
    operatorId: f.operator?.id,
    soldFrom: f.soldFrom ?? undefined,
    soldTo: f.soldTo ?? undefined,
    orderFrom: f.orderFrom ?? undefined,
    orderTo: f.orderTo ?? undefined,
    sort: f.sort,
    desc: f.desc,
  };
}

/** .xlsx havolasi — roʻyxatdagi barcha filtrlar va saralash bilan. */
export function ordersExportHref(f: OrderFilters, branchId: number | null): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(orderQuery(f, branchId))) {
    if (v !== undefined) p.set(k, String(v));
  }
  return `/api/orders/export?${p.toString()}`;
}
