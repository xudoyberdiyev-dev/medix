/** Qoldiqlar ekrani (prototip `Stock`) — koʻrinish, filtrlar, saralash URL'da (havola orqali ochish, saqlangan koʻrinishlar). */
export type StockView = "product" | "batch" | "wh";
export type ZoneTypeCode = "RECEIVING" | "MAIN" | "QUARANTINE" | "SHIPPING" | "COLD" | "SAFE";
export type ExpiryBucket = "EXPIRED" | "D0_30" | "D31_60" | "D61_90" | "D90_PLUS";
export type StockState = "HAS" | "ZERO" | "ALL_RESERVED";
export type StockFlag = "MARKED" | "CONTROLLED" | "PRESCRIPTION" | "BONUS";
export type ProductSort =
  "NAME" | "CODE" | "TOTAL" | "AVAILABLE" | "RESERVED" | "BATCHES" | "NEAREST_EXPIRY" | "COST_SUM" | "SALE_SUM" | "LAST_IN";

/** «Partiya boʻyicha» saralash (standart — yaroqlilik, FEFO). */
export type BatchSort = "EXPIRY" | "NAME" | "CODE" | "WAREHOUSE" | "QTY" | "AVAILABLE" | "COST_SUM" | "SALE_SUM" | "RECEIPT_DATE";

export const ZONE_TYPES: ZoneTypeCode[] = ["MAIN", "RECEIVING", "QUARANTINE", "SHIPPING", "COLD", "SAFE"];
export const EXPIRY_BUCKETS: ExpiryBucket[] = ["D0_30", "D31_60", "D61_90", "D90_PLUS", "EXPIRED"];
export const STOCK_STATES: StockState[] = ["HAS", "ZERO", "ALL_RESERVED"];
export const STOCK_FLAGS: StockFlag[] = ["MARKED", "CONTROLLED", "PRESCRIPTION", "BONUS"];
/** «Muddati yaqin» kartasi — 90 kun ichida (sidebar nishoni bilan bir xil). */
export const NEAR_BUCKETS: ExpiryBucket[] = ["D0_30", "D31_60", "D61_90"];
export const OVERVIEW_PAGE_SIZES = [25, 50, 100] as const;

export interface OverviewFilters {
  view: StockView;
  q: string;
  warehouses: number[];
  /** Ombor daraxtidan tanlangan aniq zona (prototip `zoneSel`): id va yorligʻi («Ombor · Zona»). */
  zoneSel: { id: number; label: string } | null;
  zones: ZoneTypeCode[];
  expiry: ExpiryBucket[];
  stock: StockState[];
  manufacturers: number[];
  categories: number[];
  countries: number[];
  supplyBy: number[];
  suppliers: number[];
  flags: StockFlag[];
  /** «Yoʻlda» kartasi bosilgan — asosiy jadval oʻrnida yoʻldagi tovar roʻyxati (prototip). */
  transit: boolean;
  sort: ProductSort | null;
  /** Partiya koʻrinishi saralashi (URL `bsort`). */
  bsort: BatchSort | null;
  desc: boolean;
  page: number;
  size: (typeof OVERVIEW_PAGE_SIZES)[number];
}

export const DEFAULT_OVERVIEW: OverviewFilters = {
  view: "product",
  q: "",
  warehouses: [],
  zoneSel: null,
  zones: [],
  expiry: [],
  stock: [],
  manufacturers: [],
  categories: [],
  countries: [],
  supplyBy: [],
  suppliers: [],
  flags: [],
  transit: false,
  sort: null,
  bsort: null,
  desc: false,
  page: 1,
  size: 25,
};

/** Jadval ustuni ↔ server saralash maydoni. */
export const PRODUCT_SORT_COLUMNS: Record<string, ProductSort> = {
  name: "NAME",
  code: "CODE",
  total: "TOTAL",
  available: "AVAILABLE",
  reserved: "RESERVED",
  batches: "BATCHES",
  nearestExpiry: "NEAREST_EXPIRY",
  costSum: "COST_SUM",
  saleSum: "SALE_SUM",
  lastIn: "LAST_IN",
};

const SORTS = Object.values(PRODUCT_SORT_COLUMNS);

/** Partiya jadvali ustuni ↔ server saralash maydoni. */
export const BATCH_SORT_COLUMNS: Record<string, BatchSort> = {
  exp: "EXPIRY",
  name: "NAME",
  code: "CODE",
  wh: "WAREHOUSE",
  qty: "QTY",
  avail: "AVAILABLE",
  costSum: "COST_SUM",
  saleSum: "SALE_SUM",
  docDate: "RECEIPT_DATE",
};
const BSORTS = Object.values(BATCH_SORT_COLUMNS);

const ids = (v: string | null): number[] =>
  v
    ? [
        ...new Set(
          v
            .split(",")
            .filter((x) => /^\d+$/.test(x))
            .map(Number),
        ),
      ]
    : [];
function codes<T extends string>(v: string | null, allowed: readonly T[]): T[] {
  return v ? [...new Set(v.split(",").filter((x): x is T => (allowed as readonly string[]).includes(x)))] : [];
}

export function parseOverview(p: URLSearchParams): OverviewFilters {
  const page = Number(p.get("page"));
  const size = Number(p.get("size"));
  return {
    view: p.get("view") === "batch" ? "batch" : p.get("view") === "wh" ? "wh" : "product",
    q: (p.get("q") ?? "").trim(),
    warehouses: ids(p.get("wh")),
    zoneSel: /^\d+$/.test(p.get("zid") ?? "") ? { id: Number(p.get("zid")), label: p.get("zl") ?? "" } : null,
    zones: codes(p.get("zone"), ZONE_TYPES),
    expiry: codes(p.get("exp"), EXPIRY_BUCKETS),
    stock: codes(p.get("stock"), STOCK_STATES),
    manufacturers: ids(p.get("maker")),
    categories: ids(p.get("cat")),
    countries: ids(p.get("country")),
    supplyBy: ids(p.get("supply")),
    suppliers: ids(p.get("supplier")),
    flags: codes(p.get("flag"), STOCK_FLAGS),
    transit: p.get("transit") === "1",
    sort: SORTS.find((x) => x === p.get("psort")) ?? null,
    bsort: BSORTS.find((x) => x === p.get("bsort")) ?? null,
    desc: p.get("desc") === "1",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    size: size === 50 || size === 100 ? size : 25,
  };
}

/** Standart qiymatlar URL'ga yozilmaydi. */
export function serializeOverview(f: OverviewFilters): string {
  const p = new URLSearchParams();
  if (f.view !== "product") p.set("view", f.view);
  if (f.q) p.set("q", f.q);
  const list = (k: string, v: readonly (string | number)[]) => v.length && p.set(k, v.join(","));
  list("wh", f.warehouses);
  if (f.zoneSel) {
    p.set("zid", String(f.zoneSel.id));
    if (f.zoneSel.label) p.set("zl", f.zoneSel.label);
  }
  list("zone", f.zones);
  list("exp", f.expiry);
  list("stock", f.stock);
  list("maker", f.manufacturers);
  list("cat", f.categories);
  list("country", f.countries);
  list("supply", f.supplyBy);
  list("supplier", f.suppliers);
  list("flag", f.flags);
  if (f.transit) p.set("transit", "1");
  if (f.sort) p.set("psort", f.sort);
  if (f.bsort) p.set("bsort", f.bsort);
  if (f.desc) p.set("desc", "1");
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 25) p.set("size", String(f.size));
  return p.toString();
}

/** Prototip: «Koʻproq filtrlar» ostidagilar — biri tanlangan boʻlsa, panel ochiq turadi. */
export function hasMoreFilters(f: OverviewFilters): boolean {
  return [f.manufacturers, f.categories, f.countries, f.supplyBy, f.suppliers, f.flags].some((x) => x.length > 0);
}

export function hasAnyFilter(f: OverviewFilters): boolean {
  return hasMoreFilters(f) || f.zoneSel != null || [f.warehouses, f.zones, f.expiry, f.stock].some((x) => x.length > 0);
}

export const sameSet = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Kartalar filtr sifatida (prototip): bosilsa yoqiladi, yana bosilsa — oʻchadi; boshqa karta filtrlarini almashtiradi. */
export type KpiKey = "near" | "expired" | "quar" | "transit";
export function kpiActive(f: OverviewFilters, k: KpiKey): boolean {
  if (k === "transit") return f.transit;
  if (f.transit) return false;
  if (k === "near") return sameSet(f.expiry, NEAR_BUCKETS) && f.zones.length === 0;
  if (k === "expired") return sameSet(f.expiry, ["EXPIRED"]) && f.zones.length === 0;
  return sameSet(f.zones, ["QUARANTINE"]) && f.expiry.length === 0;
}
export function kpiPatch(f: OverviewFilters, k: KpiKey): Partial<OverviewFilters> {
  if (kpiActive(f, k)) return { expiry: [], zones: [], transit: false };
  if (k === "transit") return { expiry: [], zones: [], transit: true };
  if (k === "near") return { expiry: NEAR_BUCKETS, zones: [], transit: false };
  if (k === "expired") return { expiry: ["EXPIRED"], zones: [], transit: false };
  return { zones: ["QUARANTINE"], expiry: [], transit: false };
}

/** Mahsulot boʻyicha jadval soʻrovi parametrlari (serverga). */
export function productQuery(f: OverviewFilters, branchId: number | null) {
  const arr = <T>(v: T[]) => (v.length ? v : undefined);
  return {
    branchId: branchId ?? undefined,
    q: f.q || undefined,
    warehouseId: arr(f.warehouses),
    zoneId: f.zoneSel ? [f.zoneSel.id] : undefined,
    zoneType: arr(f.zones),
    expiry: arr(f.expiry),
    stock: arr(f.stock),
    manufacturerId: arr(f.manufacturers),
    categoryId: arr(f.categories),
    countryId: arr(f.countries),
    supplyEmployeeId: arr(f.supplyBy),
    supplierId: arr(f.suppliers),
    flag: arr(f.flags),
    sort: f.sort ?? undefined,
    desc: f.desc || undefined,
    page: f.page - 1,
    size: f.size,
  };
}

/** Partiya boʻyicha jadval soʻrovi — filtrlar mahsulot koʻrinishi bilan bir xil. */
export function batchQuery(f: OverviewFilters, branchId: number | null) {
  const { sort: _ignored, ...rest } = productQuery(f, branchId);
  void _ignored;
  return { ...rest, sort: f.bsort ?? undefined };
}
