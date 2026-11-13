import type { PageSize } from "@/components/ui/pagination";
import type { components } from "@/lib/api/schema";

type OrderStatus = components["schemas"]["OrderDetail"]["status"];
type DeliveryType = components["schemas"]["OrderDetail"]["deliveryType"];
type PaymentType = components["schemas"]["OrderDetail"]["paymentType"];

export const DELIVERY_TYPES: readonly DeliveryType[] = ["DELIVERY", "PICKUP"];
export const PAYMENT_TYPES: readonly PaymentType[] = ["CASH", "TRANSFER", "ONLINE"];
export const PAGE_SIZES: PageSize[] = [20, 50, 100];
export type Ref = { id: number; name: string };

export const ORDER_SORTS = ["CREATED", "NUMBER", "DATE", "CUSTOMER", "TOTAL"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export const STATUSES: readonly OrderStatus[] = [
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
  /** Prototip filtr chiplari — bir nechta qiymat. */
  customers: Ref[];
  operators: Ref[];
  statuses: OrderStatus[];
  delivery: DeliveryType[];
  payments: PaymentType[];
  regions: number[];
  /** Savdo zonalari (O6) */
  zones: number[];
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
  size: PageSize;
}

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  status: null,
  q: "",
  mine: false,
  customers: [],
  operators: [],
  statuses: [],
  delivery: [],
  payments: [],
  regions: [],
  zones: [],
  soldFrom: null,
  soldTo: null,
  orderFrom: null,
  orderTo: null,
  sort: "CREATED",
  desc: true,
  page: 1,
  size: 20,
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (v: string | null): string | null => (v && ISO_DAY.test(v) ? v : null);
const positiveInt = (v: string | null): number | null => (v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null);

/** ?customerId=4&customer=Shifo&customerId=9 — id va (ixtiyoriy) nom, tartib boʻyicha. */
function refs(params: URLSearchParams, idKey: string, nameKey: string, fallback: string): Ref[] {
  const names = params.getAll(nameKey);
  const out: Ref[] = [];
  params.getAll(idKey).forEach((v, i) => {
    const id = positiveInt(v);
    if (id && !out.some((r) => r.id === id)) out.push({ id, name: names[i] || `${fallback} #${id}` });
  });
  return out;
}

function oneOf<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return [...new Set(values.filter((v): v is T => (allowed as readonly string[]).includes(v)))];
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
    customers: refs(params, "customerId", "customer", names.customer),
    operators: refs(params, "operatorId", "operator", names.operator),
    statuses: oneOf(params.getAll("st"), STATUSES),
    delivery: oneOf(params.getAll("dt"), DELIVERY_TYPES),
    payments: oneOf(params.getAll("pt"), PAYMENT_TYPES),
    regions: [
      ...new Set(
        params
          .getAll("regionId")
          .map(positiveInt)
          .filter((v): v is number => v !== null),
      ),
    ],
    zones: [
      ...new Set(
        params
          .getAll("zoneId")
          .map(positiveInt)
          .filter((v): v is number => v !== null),
      ),
    ],
    soldFrom: isoDay(params.get("soldFrom")),
    soldTo: isoDay(params.get("soldTo")),
    orderFrom: isoDay(params.get("from")),
    orderTo: isoDay(params.get("to")),
    sort: isSort ? (sort as OrderSort) : "CREATED",
    // Standart: kiritilgan vaqti — yangisi tepada; boshqa ustunlar — oʻsish tartibida
    desc: dir === "desc" ? true : dir === "asc" ? false : !isSort || sort === "CREATED",
    page: positiveInt(params.get("page")) ?? 1,
    size: PAGE_SIZES.find((n) => String(n) === params.get("per")) ?? 20,
  };
}

/** Faqat standartdan farq qiladigan qiymatlar yoziladi — havola qisqa boʻlsin. */
export function serializeOrderFilters(f: OrderFilters): string {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.mine) p.set("mine", "1");
  for (const c of f.customers) {
    p.append("customerId", String(c.id));
    p.append("customer", c.name);
  }
  for (const o of f.operators) {
    p.append("operatorId", String(o.id));
    p.append("operator", o.name);
  }
  f.statuses.forEach((v) => p.append("st", v));
  f.delivery.forEach((v) => p.append("dt", v));
  f.payments.forEach((v) => p.append("pt", v));
  f.regions.forEach((v) => p.append("regionId", String(v)));
  f.zones.forEach((v) => p.append("zoneId", String(v)));
  if (f.soldFrom) p.set("soldFrom", f.soldFrom);
  if (f.soldTo) p.set("soldTo", f.soldTo);
  if (f.orderFrom) p.set("from", f.orderFrom);
  if (f.orderTo) p.set("to", f.orderTo);
  if (f.sort !== "CREATED") p.set("sort", f.sort);
  const defaultDesc = f.sort === "CREATED";
  if (f.desc !== defaultDesc) p.set("dir", f.desc ? "desc" : "asc");
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 20) p.set("per", String(f.size));
  return p.toString();
}

/** Filtr qoʻllanganmi (qidiruv ham) — «Natija yoʻq» yoki «Hali buyurtma yoʻq» holatini tanlash uchun. */
export function hasOrderFilters(f: OrderFilters): boolean {
  return Boolean(
    f.status ||
    f.q.trim() ||
    f.mine ||
    f.customers.length ||
    f.operators.length ||
    f.statuses.length ||
    f.delivery.length ||
    f.payments.length ||
    f.regions.length ||
    f.zones.length ||
    f.soldFrom ||
    f.soldTo ||
    f.orderFrom ||
    f.orderTo,
  );
}

/** API soʻrovi parametrlari (roʻyxat va .xlsx eksport — bir xil). */
export function orderQuery(f: OrderFilters, branchId: number | null) {
  return {
    branchId: branchId ?? undefined,
    status: f.status ?? undefined,
    q: f.q.trim() || undefined,
    mine: f.mine || undefined,
    customerId: f.customers.length ? f.customers.map((c) => c.id) : undefined,
    operatorId: f.operators.length ? f.operators.map((o) => o.id) : undefined,
    statuses: f.statuses.length ? f.statuses : undefined,
    deliveryType: f.delivery.length ? f.delivery : undefined,
    paymentType: f.payments.length ? f.payments : undefined,
    regionId: f.regions.length ? f.regions : undefined,
    salesZoneId: f.zones.length ? f.zones : undefined,
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
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else if (v !== undefined) p.set(k, String(v));
  }
  return `/api/orders/export?${p.toString()}`;
}
