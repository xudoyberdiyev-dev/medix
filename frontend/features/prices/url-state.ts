export type PriceSort = "CODE" | "NAME" | "MANUFACTURER";

export interface PriceFilters {
  q: string;
  manufacturerId: number | null;
  /** Narxlar shu sanaga (ISO); null — bugun. */
  at: string | null;
  sort: PriceSort;
  desc: boolean;
  page: number;
  size: 20 | 25 | 50 | 100;
}

const SORTS: readonly PriceSort[] = ["CODE", "NAME", "MANUFACTURER"];

/** «Amaldagi narxlar» filtrlari URL'dan (SPEC 4 «Jadvallar standarti»). */
export function parsePriceFilters(params: Pick<URLSearchParams, "get">): PriceFilters {
  const mf = Number(params.get("mf"));
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  const at = params.get("at");
  const sort = params.get("sort");
  return {
    q: params.get("q") ?? "",
    manufacturerId: Number.isInteger(mf) && mf > 0 ? mf : null,
    at: at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : null,
    sort: SORTS.find((s) => s === sort) ?? "NAME",
    desc: params.get("desc") === "1",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: size === 25 || size === 100 ? size : 50,
  };
}

export function serializePriceFilters(f: PriceFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.manufacturerId) p.set("mf", String(f.manufacturerId));
  if (f.at) p.set("at", f.at);
  if (f.sort !== "NAME") p.set("sort", f.sort);
  if (f.desc) p.set("desc", "1");
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 50) p.set("size", String(f.size));
  return p.toString();
}

/** `/api/prices/export` soʻrovi: filial, filtrlar, sana va saralash; sahifasiz. */
export function priceExportQuery(branchId: number, f: PriceFilters): string {
  const p = new URLSearchParams({ branchId: String(branchId) });
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.manufacturerId) p.set("manufacturerId", String(f.manufacturerId));
  if (f.at) p.set("at", f.at);
  p.set("sort", f.sort);
  if (f.desc) p.set("desc", "true");
  return p.toString();
}

export function priceSortKey(sort: PriceSort): string {
  return sort === "CODE" ? "code" : sort === "MANUFACTURER" ? "manufacturer" : "name";
}

export function priceSortFromKey(key: string): PriceSort {
  return key === "code" ? "CODE" : key === "manufacturer" ? "MANUFACTURER" : "NAME";
}
