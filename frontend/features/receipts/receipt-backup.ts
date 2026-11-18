/**
 * Yangi kirim qoralamasining zaxirasi (U11): qogʻoz nakladnoydan uzoq kiritilgan qatorlar oyna yopilsa, brauzer qulasa
 * yoki sahifa yangilansa yoʻqolmasin. Brauzer xotirasida (localStorage), foydalanuvchi boʻyicha alohida kalit
 * (umumiy kompyuterda boshqa xodimga oʻtmaydi); 7 kundan eskisi tashlanadi. Serverda saqlangach oʻchiriladi.
 */

export interface ReceiptBackupLine {
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

export interface ReceiptBackupForm {
  warehouseId: string | null;
  supplier: string | null;
  supplierLabel: string;
  date: string;
  invoice: string;
  invoiceDate: string;
  paymentType: string | null;
  due: string;
  owner: string | null;
  prepaid: boolean;
  discountKind: string | null;
  discountValue: string;
  discountDate: string;
  note: string;
  factura: string;
  lines: ReceiptBackupLine[];
}

export interface ReceiptBackup {
  form: ReceiptBackupForm;
  at: number;
}

export const RECEIPT_BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function receiptBackupKey(userId: number): string {
  return `yuzplus-receipt-backup:${userId}:new`;
}

const STR = ["supplierLabel", "date", "invoice", "invoiceDate", "due", "discountValue", "discountDate", "note", "factura"] as const;
const STR_OR_NULL = ["warehouseId", "supplier", "paymentType", "owner", "discountKind"] as const;
const LINE_STR = ["productCode", "productName", "batchNumber", "producedOn", "expiryDate", "qty", "bonusQty", "price"] as const;

function parseLine(v: unknown): ReceiptBackupLine | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  if (!Number.isInteger(l.productId) || !Number.isInteger(l.zoneId)) return null;
  if (LINE_STR.some((k) => typeof l[k] !== "string")) return null;
  return l as unknown as ReceiptBackupLine;
}

function parseForm(v: unknown): ReceiptBackupForm | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  if (STR.some((k) => typeof f[k] !== "string")) return null;
  if (STR_OR_NULL.some((k) => f[k] !== null && typeof f[k] !== "string")) return null;
  if (typeof f.prepaid !== "boolean" || !Array.isArray(f.lines)) return null;
  const lines = f.lines.map(parseLine).filter((l): l is ReceiptBackupLine => l !== null);
  return { ...(f as unknown as ReceiptBackupForm), lines };
}

/** Zaxiraga arziydimi: qator yoki taʼminotchi kiritilgan boʻlsa (boʻsh forma eslab qolinmaydi). */
export function worthBackup(f: ReceiptBackupForm): boolean {
  return f.lines.length > 0 || f.supplier !== null || f.invoice.trim() !== "";
}

export function parseReceiptBackup(raw: string | null, now = Date.now()): ReceiptBackup | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.at !== "number" || now - v.at > RECEIPT_BACKUP_TTL_MS || v.at > now + 60_000) return null;
    const form = parseForm(v.form);
    return form && worthBackup(form) ? { form, at: v.at } : null;
  } catch {
    return null;
  }
}

export function readReceiptBackup(userId: number): ReceiptBackup | null {
  try {
    const key = receiptBackupKey(userId);
    const b = parseReceiptBackup(localStorage.getItem(key));
    if (!b) localStorage.removeItem(key);
    return b;
  } catch {
    return null;
  }
}

/** form null yoki boʻsh — zaxira oʻchiriladi. */
export function writeReceiptBackup(userId: number, form: ReceiptBackupForm | null) {
  try {
    const key = receiptBackupKey(userId);
    if (form && worthBackup(form)) localStorage.setItem(key, JSON.stringify({ form, at: Date.now() }));
    else localStorage.removeItem(key);
  } catch {
    /* xotira yopiq — zaxirasiz ishlaydi */
  }
}
