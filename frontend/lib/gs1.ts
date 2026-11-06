/**
 * GS1 DataMatrix markirovka kodi (SPEC 6): (01) GTIN · (21) seriya · (17) yaroqlilik · (10) partiya · (91) Q/D.
 * Serverdagi `uz.medix.shared.gs1.Gs1Code` bilan bir xil qoidalar: frontendda tez tekshiruv, serverda yana bir bor.
 */
export type Gs1Kind = "BOX" | "UNIT";

export interface Gs1Code {
  gtin: string;
  serial: string;
  batch: string;
  expiry: string | null; // YYYY-MM-DD
  kind: Gs1Kind;
}

export type Gs1Error = "marking.format" | "marking.gtinInvalid" | "marking.kindInvalid" | "marking.expiryInvalid";

export type Gs1Parsed = { ok: true; code: Gs1Code } | { ok: false; error: Gs1Error };

export const GS = "\u001D";

const FIXED: Record<string, number> = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2 };

export const GS1_ERROR_TEXT: Record<Gs1Error, string> = {
  "marking.format": "Kod oʻqilmadi: GS1 formati emas yoki (01), (21), (10), (91) maydonlaridan biri yoʻq. Kodni qayta skanerlang.",
  "marking.gtinInvalid": "Koddagi GTIN notoʻgʻri (nazorat raqami mos emas). Qadoqdagi boshqa kodni skanerlang.",
  "marking.kindInvalid": "Koddagi tur (91) notoʻgʻri: Q (quti) yoki D (dona) boʻlishi kerak.",
  "marking.expiryInvalid": "Koddagi yaroqlilik sanasi (17) notoʻgʻri. Kodni qayta skanerlang.",
};

export function checkDigitOk(digits: string): boolean {
  const n = digits.length;
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    const d = digits.charCodeAt(i) - 48;
    sum += (n - 1 - i) % 2 === 1 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === digits.charCodeAt(n - 1) - 48;
}

function yymmdd(v: string): string | null {
  if (!/^\d{6}$/.test(v)) return null;
  const y = 2000 + Number(v.slice(0, 2));
  const m = Number(v.slice(2, 4));
  const d = Number(v.slice(4, 6));
  if (m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = d === 0 ? last : d;
  if (day > last) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function bracketed(s: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    if (s[i] !== "(") return null;
    const close = s.indexOf(")", i);
    if (close < 0) return null;
    const ai = s.slice(i + 1, close);
    if (!/^\d{2,4}$/.test(ai)) return null;
    const next = s.indexOf("(", close + 1);
    const end = next < 0 ? s.length : next;
    if (out.has(ai)) return null;
    out.set(ai, s.slice(close + 1, end));
    i = end;
  }
  return out;
}

function separated(s: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) {
      i++;
      continue;
    }
    if (i + 2 > s.length) return null;
    const ai = s.slice(i, i + 2);
    if (!/^\d{2}$/.test(ai)) return null;
    i += 2;
    const len = FIXED[ai];
    let value: string;
    if (len !== undefined) {
      if (i + len > s.length) return null;
      value = s.slice(i, i + len);
      i += len;
    } else {
      const gs = s.indexOf(GS, i);
      const end = gs < 0 ? s.length : gs;
      value = s.slice(i, end);
      i = end;
    }
    if (out.has(ai)) return null;
    out.set(ai, value);
  }
  return out;
}

export function parseGs1(raw: string): Gs1Parsed {
  let s = raw.trim();
  if (s.startsWith("]d2") || s.startsWith("]C1") || s.startsWith("]Q3")) s = s.slice(3);
  if (!s || s.length > 300) return { ok: false, error: "marking.format" };
  const f = s[0] === "(" ? bracketed(s) : separated(s);
  if (!f) return { ok: false, error: "marking.format" };
  const gtin = f.get("01");
  const serial = f.get("21");
  const batch = f.get("10");
  const kind = f.get("91");
  if (!gtin || !serial || !batch || !kind) return { ok: false, error: "marking.format" };
  if (!/^\d{14}$/.test(gtin) || !checkDigitOk(gtin)) return { ok: false, error: "marking.gtinInvalid" };
  const k = kind.toUpperCase() === "Q" ? "BOX" : kind.toUpperCase() === "D" ? "UNIT" : null;
  if (!k) return { ok: false, error: "marking.kindInvalid" };
  let expiry: string | null = null;
  const e = f.get("17");
  if (e !== undefined) {
    expiry = yymmdd(e);
    if (!expiry) return { ok: false, error: "marking.expiryInvalid" };
  }
  const printable = /^[\x21-\x7E]{1,20}$/;
  if (!printable.test(serial) || !printable.test(batch)) return { ok: false, error: "marking.format" };
  return { ok: true, code: { gtin, serial, batch, expiry, kind: k } };
}
