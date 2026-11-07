import type { components } from "@/lib/api/schema";

type OrderDetail = components["schemas"]["OrderDetail"];

/** Terish varagʻining bitta qatori: zona + partiya boʻyicha jamlangan miqdor, qaysi buyurtmalarga necha dona. */
export type PickSheetRow = {
  zone: string;
  productCode: string;
  productName: string;
  batch: string;
  expiryDate: string;
  qty: number;
  orders: { number: string; qty: number }[];
};

export type PickSheet = {
  rows: PickSheetRow[];
  orders: { id: number; number: string; customer: string; lines: number; qty: number; marked: boolean }[];
  totalQty: number;
};

/** «?ids=3,5,8» → [3, 5, 8]; notoʻgʻri qiymatlar va takrorlar tashlanadi, eng koʻpi 20 ta. */
export function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 20);
}

/** Yigʻiladigan qatorlar: qator boʻyicha qaytarilgan boʻlsa — faqat shular, aks holda hammasi. */
export function repickLines<L extends { id: number }>(d: { lines: L[]; repickLineIds?: number[] }): L[] {
  if (!d.repickLineIds || d.repickLineIds.length === 0) return d.lines;
  const set = new Set(d.repickLineIds);
  return d.lines.filter((l) => set.has(l.id));
}

/**
 * Bir necha buyurtma bitta varaqda (SPEC: chop etish shakllari): zahiradagi partiyalar zona → mahsulot →
 * yaroqlilik muddati boʻyicha tartiblanadi, yigʻuvchi omborni bir marta aylanib chiqadi.
 * Zahirasi yoʻq qator (hali taqsimlanmagan) «—» zonasi bilan oxirida.
 */
export function buildPickSheet(orders: OrderDetail[]): PickSheet {
  const map = new Map<string, PickSheetRow>();
  for (const o of orders) {
    for (const l of repickLines(o)) {
      const parts = l.reserved.length > 0 ? l.reserved : [{ zone: "", batch: "", expiryDate: "", qty: l.qty }];
      for (const r of parts) {
        const key = [r.zone, l.productCode, r.batch].join("\u0000");
        const row = map.get(key) ?? {
          zone: r.zone,
          productCode: l.productCode,
          productName: l.productName,
          batch: r.batch,
          expiryDate: r.expiryDate,
          qty: 0,
          orders: [],
        };
        row.qty += r.qty;
        const ref = row.orders.find((x) => x.number === o.number);
        if (ref) ref.qty += r.qty;
        else row.orders.push({ number: o.number, qty: r.qty });
        map.set(key, row);
      }
    }
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, "uz");
  const rows = [...map.values()].sort(
    (a, b) =>
      Number(a.zone === "") - Number(b.zone === "") ||
      cmp(a.zone, b.zone) ||
      cmp(a.productName, b.productName) ||
      cmp(a.expiryDate, b.expiryDate) ||
      cmp(a.batch, b.batch),
  );
  return {
    rows,
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      customer: o.customer,
      lines: repickLines(o).length,
      qty: repickLines(o).reduce((s, l) => s + l.qty, 0),
      marked: repickLines(o).some((l) => l.marked),
    })),
    totalQty: rows.reduce((s, r) => s + r.qty, 0),
  };
}
