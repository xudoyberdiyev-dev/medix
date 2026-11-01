import type { PageSize } from "@/components/ui/pagination";

/** Mahsulotlar jadvali filtrlari — URL'da saqlanadi (SPEC 4: havola orqali ochish mumkin). */
export interface ProductFilters {
  q: string;
  manufacturerId: number | null;
  categoryId: number | null;
  status: "ACTIVE" | "INACTIVE" | "ALL";
  flag: "marked" | "controlled" | "prescription" | null;
  sort: "CODE" | "NAME" | "MANUFACTURER";
  desc: boolean;
  /** 1 dan boshlanadi. */
  page: number;
  size: PageSize;
}

export const DEFAULT_FILTERS: ProductFilters = {
  q: "",
  manufacturerId: null,
  categoryId: null,
  status: "ACTIVE",
  flag: null,
  sort: "NAME",
  desc: false,
  page: 1,
  size: 50,
};

const positiveInt = (v: string | null): number | null => (v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null);

export function parseFilters(params: URLSearchParams): ProductFilters {
  const status = params.get("status");
  const flag = params.get("flag");
  const sort = params.get("sort");
  const size = Number(params.get("size"));
  return {
    q: params.get("q") ?? "",
    manufacturerId: positiveInt(params.get("manufacturer")),
    categoryId: positiveInt(params.get("category")),
    status: status === "INACTIVE" || status === "ALL" ? status : "ACTIVE",
    flag: flag === "marked" || flag === "controlled" || flag === "prescription" ? flag : null,
    sort: sort === "CODE" || sort === "MANUFACTURER" ? sort : "NAME",
    desc: params.get("desc") === "1",
    page: positiveInt(params.get("page")) ?? 1,
    size: size === 25 || size === 100 ? size : 50,
  };
}

/** Faqat standartdan farq qiladigan qiymatlar yoziladi — havola qisqa boʻlsin. */
export function serializeFilters(f: ProductFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.manufacturerId) p.set("manufacturer", String(f.manufacturerId));
  if (f.categoryId) p.set("category", String(f.categoryId));
  if (f.status !== "ACTIVE") p.set("status", f.status);
  if (f.flag) p.set("flag", f.flag);
  if (f.sort !== "NAME") p.set("sort", f.sort);
  if (f.desc) p.set("desc", "1");
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 50) p.set("size", String(f.size));
  return p.toString();
}

/** Faol filtrlar soni (qidiruv va saralashsiz) — «Filtrlarni tozalash» uchun. */
export function activeFilterCount(f: ProductFilters): number {
  return [f.manufacturerId, f.categoryId, f.status !== "ACTIVE" ? 1 : null, f.flag].filter((v) => v !== null).length;
}

/** API soʻrovi parametrlari. */
export function toQuery(f: ProductFilters) {
  return {
    q: f.q.trim() || undefined,
    manufacturerId: f.manufacturerId ?? undefined,
    categoryId: f.categoryId ?? undefined,
    status: f.status,
    marked: f.flag === "marked" ? true : undefined,
    controlled: f.flag === "controlled" ? true : undefined,
    sort: f.sort,
    desc: f.desc,
    page: f.page - 1,
    size: f.size,
  };
}

/** Eksport havolasi uchun soʻrov satri (sahifalashsiz). */
export function exportQuery(f: ProductFilters): string {
  const q = toQuery(f);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && k !== "page" && k !== "size") p.set(k, String(v));
  }
  return p.toString();
}
