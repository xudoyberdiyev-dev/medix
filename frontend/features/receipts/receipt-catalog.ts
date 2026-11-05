import { parseMoneyInput, parseUzDate } from "@/features/counterparties/api";

/** Katalog qatoriga kiritilgan qiymatlar (hammasi matn, KK.OO.YYYY / «15.000,50» koʻrinishida). */
export interface CatalogInput {
  batch: string;
  produced: string;
  expiry: string;
  qty: string;
  bonus: string;
  price: string;
}

export const EMPTY_INPUT: CatalogInput = { batch: "", produced: "", expiry: "", qty: "", bonus: "", price: "" };

export interface CatalogProduct {
  productId: number;
  code: string;
  name: string;
  lastPrice?: string | null;
}

/** Kirim qoralamasiga qoʻshiladigan qator (receipt-drawer DraftLine bilan bir xil maydonlar). */
export interface CatalogPick {
  productId: number;
  productCode: string;
  productName: string;
  batchNumber: string;
  producedOn: string;
  expiryDate: string;
  zoneId: number;
  qty: string;
  bonusQty: string;
  price: string;
}

const isInt = (s: string) => /^\d+$/.test(s.trim());

/**
 * Katalogdagi toʻldirilgan qatorlarni tekshiradi: biror maydoni toʻldirilgan qator toʻliq boʻlishi shart (partiya, yaroqlilik,
 * soni). Narx boʻsh boʻlsa — shu YB dan oxirgi narx (bor boʻlsa). Bir xil mahsulot + partiya qoralamada boʻlsa — xato.
 */
export function collectPicks(
  rows: CatalogProduct[],
  inputs: Record<number, CatalogInput>,
  opts: { zoneId: number | null; pricesVisible: boolean; existing: Set<string> },
): { picks: CatalogPick[]; errors: Record<number, string> } {
  const picks: CatalogPick[] = [];
  const errors: Record<number, string> = {};
  for (const r of rows) {
    const v = inputs[r.productId];
    if (!v || Object.values(v).every((x) => !x.trim())) continue;
    const fail = (m: string) => (errors[r.productId] = m);
    if (!v.batch.trim()) fail("Partiyani kiriting");
    else if (!parseUzDate(v.expiry)) fail("Yaroqlilik: KK.OO.YYYY");
    else if (v.produced.trim() && !parseUzDate(v.produced)) fail("Ishlab chiqarilgan: KK.OO.YYYY");
    else if (!isInt(v.qty) || Number(v.qty) < 1) fail("Soni — butun musbat son");
    else if (v.bonus.trim() && !isInt(v.bonus)) fail("Bonus — butun son");
    else if (opts.pricesVisible && v.price.trim() && !parseMoneyInput(v.price)) fail("Narx notoʻgʻri");
    else if (opts.existing.has(`${r.productId}|${v.batch.trim().toUpperCase()}`)) fail("Bu partiya allaqachon qoʻshilgan");
    else if (opts.zoneId === null) fail("Zonani tanlang");
    if (errors[r.productId] || opts.zoneId === null) continue;
    const price = opts.pricesVisible ? (parseMoneyInput(v.price) ?? r.lastPrice ?? "") : "";
    picks.push({
      productId: r.productId,
      productCode: r.code,
      productName: r.name,
      batchNumber: v.batch.trim(),
      producedOn: v.produced.trim(),
      expiryDate: v.expiry.trim(),
      zoneId: opts.zoneId,
      qty: v.qty.trim(),
      bonusQty: v.bonus.trim(),
      price,
    });
  }
  return { picks, errors };
}
