/** Qoldiqlar / Muddat nazorati filtrlari URL'da (jadvallar standarti: havola orqali ochish, saqlangan koʻrinishlar). */
export interface StockFilters {
  q: string;
  warehouseId: string | null;
  sellableOnly: boolean;
  days: string;
  page: number;
  size: 25 | 50 | 100;
}

export const DEFAULT_STOCK_FILTERS: StockFilters = { q: "", warehouseId: null, sellableOnly: false, days: "90", page: 1, size: 50 };

const DAYS = ["0", "30", "90", "180"];

export function parseStockFilters(p: URLSearchParams): StockFilters {
  const wh = p.get("warehouse");
  const page = Number(p.get("page"));
  const size = Number(p.get("size"));
  const days = p.get("days") ?? "90";
  return {
    q: (p.get("q") ?? "").trim(),
    warehouseId: wh && /^\d+$/.test(wh) ? wh : null,
    sellableOnly: p.get("sellable") === "1",
    days: DAYS.includes(days) ? days : "90",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    size: size === 25 || size === 100 ? size : 50,
  };
}

/** Standart qiymatlar URL'ga yozilmaydi. */
export function serializeStockFilters(f: StockFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.warehouseId) p.set("warehouse", f.warehouseId);
  if (f.sellableOnly) p.set("sellable", "1");
  if (f.days !== "90") p.set("days", f.days);
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 50) p.set("size", String(f.size));
  return p.toString();
}
