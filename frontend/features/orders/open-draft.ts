/**
 * Ochiq hujjat (SPEC 208): katalogga yoki boshqa sahifaga oʻtib qaytganda buyurtma shu holatda ochiladi.
 * Shu brauzer oynasida (sessionStorage) saqlanadi — boshqa xodim yoki qurilmaga oʻtmaydi; 12 soatdan eskisi tashlanadi.
 */

export interface OpenDraftForm {
  warehouseId: string | null;
  customer: string | null;
  customerLabel: string;
  deliveryType: string | null;
  deliveryDate: string;
  address: string;
  paymentType: string | null;
  note: string;
  lines: { productId: number; productCode: string; productName: string; qty: string }[];
}

export interface OpenDraft {
  /** null — hali saqlanmagan yangi buyurtma. */
  id: number | null;
  /** Saqlanmagan oʻzgarishlar boʻlsa — forma; boʻlmasa faqat hujjat ochiq turgani eslab qolinadi. */
  form: OpenDraftForm | null;
  at: number;
}

const KEY = "medix-order-open";
export const OPEN_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

function parseForm(v: unknown): OpenDraftForm | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  if (
    !strOrNull(f.warehouseId) ||
    !strOrNull(f.customer) ||
    !str(f.customerLabel) ||
    !strOrNull(f.deliveryType) ||
    !str(f.deliveryDate) ||
    !str(f.address) ||
    !strOrNull(f.paymentType) ||
    !str(f.note) ||
    !Array.isArray(f.lines)
  )
    return null;
  const lines = f.lines.filter(
    (l): l is OpenDraftForm["lines"][number] =>
      !!l &&
      typeof l === "object" &&
      Number.isInteger((l as Record<string, unknown>).productId) &&
      str((l as Record<string, unknown>).productCode) &&
      str((l as Record<string, unknown>).productName) &&
      str((l as Record<string, unknown>).qty),
  );
  return {
    warehouseId: f.warehouseId,
    customer: f.customer,
    customerLabel: f.customerLabel,
    deliveryType: f.deliveryType,
    deliveryDate: f.deliveryDate,
    address: f.address,
    paymentType: f.paymentType,
    note: f.note,
    lines,
  };
}

export function parseOpenDraft(raw: string | null, now = Date.now()): OpenDraft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.at !== "number" || now - v.at > OPEN_DRAFT_TTL_MS || v.at > now + 60_000) return null;
    const id = v.id === null ? null : Number.isInteger(v.id) && (v.id as number) > 0 ? (v.id as number) : undefined;
    if (id === undefined) return null;
    const form = v.form === null ? null : parseForm(v.form);
    // Yangi buyurtma formasiz — eslab qolishga arzimaydi
    if (id === null && !form) return null;
    return { id, form, at: v.at };
  } catch {
    return null;
  }
}

export function readOpenDraft(): OpenDraft | null {
  try {
    return parseOpenDraft(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function writeOpenDraft(d: Omit<OpenDraft, "at">) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...d, at: Date.now() }));
  } catch {
    /* xotira yopiq — hujjat faqat shu sahifada ochiq qoladi */
  }
}

export function clearOpenDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* xotira yopiq */
  }
}

/** Saqlangan forma shu hujjatga tegishlimi (yangi buyurtma — id null). */
export function draftFormFor(d: OpenDraft | null, id: number | null): OpenDraftForm | null {
  return d && d.id === id ? d.form : null;
}
