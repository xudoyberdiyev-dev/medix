import type { CounterpartyQuery, CounterpartyRole, CounterpartySort } from "./api";

const SORTS: readonly CounterpartySort[] = ["NAME", "TIN", "REGION", "LICENSE"];

/** Roʻyxat filtrlari URL'dan (SPEC 4 «Jadvallar standarti»: filtrlar va saralash havolada saqlanadi). */
export function parseCounterpartyQuery(params: Pick<URLSearchParams, "get">, role: CounterpartyRole): CounterpartyQuery {
  const status = params.get("status");
  const size = Number(params.get("size"));
  const region = Number(params.get("region"));
  const page = Number(params.get("page"));
  const sort = params.get("sort");
  return {
    q: params.get("q") ?? "",
    role,
    status: status === "BLOCKED" || status === "INACTIVE" || status === "ALL" ? status : "ACTIVE",
    regionId: Number.isInteger(region) && region > 0 ? region : null,
    sort: SORTS.find((s) => s === sort) ?? "NAME",
    desc: params.get("desc") === "1",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: size === 25 || size === 100 ? size : 50,
  };
}

export function serializeCounterpartyQuery(f: CounterpartyQuery): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.status !== "ACTIVE") p.set("status", f.status);
  if (f.regionId) p.set("region", String(f.regionId));
  if (f.sort !== "NAME") p.set("sort", f.sort);
  if (f.desc) p.set("desc", "1");
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 50) p.set("size", String(f.size));
  return p.toString();
}

/** `/api/counterparties/export` soʻrovi: jadvaldagi filtr va saralash, sahifasiz. */
export function counterpartyExportQuery(f: CounterpartyQuery): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  p.set("role", f.role);
  p.set("status", f.status);
  if (f.regionId) p.set("regionId", String(f.regionId));
  p.set("sort", f.sort);
  if (f.desc) p.set("desc", "true");
  return p.toString();
}

/** Jadval ustuni ↔ server saralash maydoni. */
export const SORT_COLUMNS: Record<string, CounterpartySort> = { name: "NAME", tin: "TIN", region: "REGION", license: "LICENSE" };

export function sortColumn(sort: CounterpartySort): string {
  return Object.entries(SORT_COLUMNS).find(([, v]) => v === sort)?.[0] ?? "name";
}
