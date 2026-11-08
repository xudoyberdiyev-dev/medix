import type { PageSize } from "@/components/ui/pagination";

export const PRODUCT_VIEWS = ["ALL", "ACTIVE", "CONTROLLED", "MARKED", "PRESCRIPTION", "INACTIVE"] as const;
export type ProductView = (typeof PRODUCT_VIEWS)[number];

export const PRODUCT_SORTS = [
  "CODE",
  "NAME",
  "CONTRACT_NAME",
  "MANUFACTURER",
  "CATEGORY",
  "COUNTRY",
  "VAT",
  "MIN_QTY",
  "MAX_QTY",
  "STOCK",
  "PRICE",
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export type ProductStatusFilter = "ACTIVE" | "INACTIVE";

/** Mahsulotlar roʻyxati filtrlari (prototip `Products`) — URL'da saqlanadi (havola orqali ochish mumkin). */
export interface ProductFilters {
  q: string;
  view: ProductView;
  manufacturers: number[];
  categories: number[];
  countries: number[];
  supply: number[];
  statuses: ProductStatusFilter[];
  sort: ProductSort;
  desc: boolean;
  /** 1 dan boshlanadi. */
  page: number;
  size: PageSize;
}

export const DEFAULT_FILTERS: ProductFilters = {
  q: "",
  view: "ALL",
  manufacturers: [],
  categories: [],
  countries: [],
  supply: [],
  statuses: [],
  sort: "NAME",
  desc: false,
  page: 1,
  size: 25,
};

const positiveInt = (v: string | null): number | null => (v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null);
const ids = (v: string | null): number[] =>
  [...new Set((v ?? "").split(",").map((x) => positiveInt(x)))].filter((x): x is number => x !== null);
const oneOf = <T extends string>(list: readonly T[], v: string | null, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

export function parseFilters(params: URLSearchParams): ProductFilters {
  const size = Number(params.get("size"));
  const statuses = (params.get("status") ?? "").split(",").filter((s): s is ProductStatusFilter => s === "ACTIVE" || s === "INACTIVE");
  return {
    q: params.get("q") ?? "",
    view: oneOf(PRODUCT_VIEWS, params.get("view"), "ALL"),
    manufacturers: ids(params.get("manufacturer")),
    categories: ids(params.get("category")),
    countries: ids(params.get("country")),
    supply: ids(params.get("supply")),
    statuses: [...new Set(statuses)],
    sort: oneOf(PRODUCT_SORTS, params.get("sort"), "NAME"),
    desc: params.get("desc") === "1",
    page: positiveInt(params.get("page")) ?? 1,
    size: size === 50 || size === 100 ? size : 25,
  };
}

/** Faqat standartdan farq qiladigan qiymatlar yoziladi — havola qisqa boʻlsin. */
export function serializeFilters(f: ProductFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.view !== "ALL") p.set("view", f.view);
  if (f.manufacturers.length) p.set("manufacturer", f.manufacturers.join(","));
  if (f.categories.length) p.set("category", f.categories.join(","));
  if (f.countries.length) p.set("country", f.countries.join(","));
  if (f.supply.length) p.set("supply", f.supply.join(","));
  if (f.statuses.length) p.set("status", f.statuses.join(","));
  if (f.sort !== "NAME") p.set("sort", f.sort);
  if (f.desc) p.set("desc", "1");
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 25) p.set("size", String(f.size));
  return p.toString();
}

/** Faol filtrlar soni (qidiruv, yorliq va saralashsiz) — «Filtrlarni tozalash» uchun. */
export function activeFilterCount(f: ProductFilters): number {
  return [f.manufacturers, f.categories, f.countries, f.supply, f.statuses].filter((v) => v.length > 0).length;
}

/** «Holat» filtri → API `status`: ikkalasi yoki hech biri — hammasi. */
export function apiStatus(statuses: ProductStatusFilter[]): "ACTIVE" | "INACTIVE" | "ALL" {
  return statuses.length === 1 ? statuses[0] : "ALL";
}

/** API soʻrovi parametrlari. */
export function toQuery(f: ProductFilters, branchId: number | null) {
  return {
    q: f.q.trim() || undefined,
    view: f.view,
    manufacturerIds: f.manufacturers.length ? f.manufacturers : undefined,
    categoryIds: f.categories.length ? f.categories : undefined,
    countryIds: f.countries.length ? f.countries : undefined,
    supplyEmployeeIds: f.supply.length ? f.supply : undefined,
    status: apiStatus(f.statuses),
    branchId: branchId ?? undefined,
    facets: true,
    sort: f.sort,
    desc: f.desc,
    page: f.page - 1,
    size: f.size,
  };
}

/** Eksport havolasi uchun soʻrov satri (sahifalashsiz); `ids` — tanlanganlar. */
export function exportQuery(f: ProductFilters, branchId: number | null, selected: number[] = []): string {
  const q = toQuery(f, branchId);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || k === "page" || k === "size" || k === "facets") continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  if (selected.length) p.set("ids", selected.join(","));
  return p.toString();
}
