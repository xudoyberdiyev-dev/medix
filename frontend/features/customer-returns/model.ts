/** QM sabablari — prototip `QM_REASONS` tartibida; nomlari lugʻatda `customerReturns.reason.*`. */
export const QM_REASONS = ["EXPIRING", "DAMAGED", "WRONG_ITEM", "REFUSED", "OTHER"] as const;
export type QmReason = (typeof QM_REASONS)[number];

export interface QmRow {
  saleLineId: number;
  productName: string;
  left: number;
  price: string;
}

export interface QmInput {
  qty: Record<number, string>;
  reason: Record<number, QmReason | undefined>;
}

/** Qator xatosi: nima va qaysi qator (prototip: «1. Mahsulot: Qaytarish mumkin: 2»). */
export type QmLineError =
  | { kind: "qty"; line: number; product: string }
  | { kind: "left"; line: number; product: string; left: number }
  | { kind: "reason"; line: number; product: string };

/** Kiritilgan qatorlar: miqdor 0/boʻsh — oʻtkaziladi; butun son ≤ qoldi; sabab majburiy. */
export function qmLinesFrom(
  rows: QmRow[],
  input: QmInput,
): { lines: { saleLineId: number; qty: number; reason: QmReason }[]; errors: QmLineError[] } {
  const lines: { saleLineId: number; qty: number; reason: QmReason }[] = [];
  const errors: QmLineError[] = [];
  rows.forEach((row, i) => {
    const raw = (input.qty[row.saleLineId] ?? "").trim();
    if (raw === "" || raw === "0") return;
    const line = i + 1;
    const product = row.productName;
    if (!/^\d+$/.test(raw) || Number(raw) <= 0) return void errors.push({ kind: "qty", line, product });
    const qty = Number(raw);
    if (qty > row.left) return void errors.push({ kind: "left", line, product, left: row.left });
    const reason = input.reason[row.saleLineId];
    if (!reason) return void errors.push({ kind: "reason", line, product });
    lines.push({ saleLineId: row.saleLineId, qty, reason });
  });
  return { lines, errors };
}

/** Qaytarish summasi (sotuv narxida): tiyinlarda hisoblanadi — float xatosiz. */
export function qmTotal(rows: QmRow[], qty: Record<number, string>): string {
  let cents = 0n;
  for (const r of rows) {
    const raw = (qty[r.saleLineId] ?? "").trim();
    if (!/^\d+$/.test(raw)) continue;
    const q = BigInt(raw);
    if (q === 0n || Number(q) > r.left) continue;
    const [whole, frac = ""] = r.price.split(".");
    cents += (BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2))) * q;
  }
  const s = cents.toString().padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}
