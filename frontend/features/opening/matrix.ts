/** Boshlangʻich qoldiq — «Koʻchirish holati» matritsasi (prototip `OpeningBalances`): filial × tur. */

export type BqType = "GOODS" | "CUSTOMER_DEBT" | "SUPPLIER_DEBT" | "MONEY";
export const BQ_TYPES: BqType[] = ["GOODS", "CUSTOMER_DEBT", "SUPPLIER_DEBT", "MONEY"];
export type BqStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type CellState = "NONE" | "DRAFT" | "POSTED";

/** Roʻyxatdagi umumiy qator: tovar BQ (ombor) yoki pul BQ (filial). */
export interface BqDoc {
  key: string;
  id: number;
  type: BqType;
  number: string;
  branchId: number;
  warehouseId: number | null;
  /** Ombor (tovar) yoki filial nomi. */
  place: string;
  cutoffDate: string;
  lines: number;
  /** Tovar — tannarx (ruxsat boʻlsa), qarz — qoldiq, pul — summa; null — koʻrinmaydi. */
  total: string | null;
  source: "MANUAL" | "IMPORT";
  status: BqStatus;
  postedAt: string | null;
  createdAt: string;
}

export interface MatrixItem {
  /** Tovar katagida ombor nomi. */
  label: string | null;
  warehouseId: number | null;
  state: CellState;
  doc: BqDoc | null;
}

export interface MatrixRow {
  branchId: number;
  name: string;
  postedWarehouses: number;
  warehouses: number;
  cells: Record<BqType, MatrixItem[]>;
}

/** Katak holati: oʻtkazilgani bor — POSTED (oʻsha hujjat), aks holda eng yangi qoralama, boʻlmasa — NONE. */
export function cellOf(docs: BqDoc[]): { state: CellState; doc: BqDoc | null } {
  const posted = docs.find((d) => d.status === "POSTED");
  if (posted) return { state: "POSTED", doc: posted };
  const draft = docs.filter((d) => d.status === "DRAFT").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  return draft ? { state: "DRAFT", doc: draft } : { state: "NONE", doc: null };
}

export function buildMatrix(
  branches: { id: number; name: string }[],
  warehouses: { id: number; branchId: number; name: string; active: boolean }[],
  docs: BqDoc[],
): MatrixRow[] {
  return branches.map((b) => {
    const whs = warehouses.filter((w) => w.branchId === b.id && w.active);
    const goods = whs.map((w) => {
      const c = cellOf(docs.filter((d) => d.type === "GOODS" && d.warehouseId === w.id));
      return { label: w.name, warehouseId: w.id, ...c };
    });
    const branchCell = (type: BqType): MatrixItem[] => [
      { label: null, warehouseId: null, ...cellOf(docs.filter((d) => d.type === type && d.branchId === b.id)) },
    ];
    return {
      branchId: b.id,
      name: b.name.replace(/ filiali$/, ""),
      postedWarehouses: goods.filter((g) => g.state === "POSTED").length,
      warehouses: whs.length,
      cells: {
        GOODS: goods,
        CUSTOMER_DEBT: branchCell("CUSTOMER_DEBT"),
        SUPPLIER_DEBT: branchCell("SUPPLIER_DEBT"),
        MONEY: branchCell("MONEY"),
      },
    };
  });
}

/** Legenda: har holatdagi kataklar soni. */
export function legendOf(rows: MatrixRow[]): Record<CellState, number> {
  const n: Record<CellState, number> = { NONE: 0, DRAFT: 0, POSTED: 0 };
  rows.forEach((r) => BQ_TYPES.forEach((t) => r.cells[t].forEach((c) => (n[c.state] += 1))));
  return n;
}
