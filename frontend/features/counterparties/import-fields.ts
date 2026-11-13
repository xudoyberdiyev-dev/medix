import type { ImportField } from "@/features/products/import-model";

/** Import ustasi maydonlari (prototip `BQ_FIELDS.cust` / `BQ_FIELDS.sup`; chegirma — egasi qarori kutilmoqda). */
export type CpFieldKey = "stir" | "cname" | "ctype" | "region" | "address" | "phone" | "limit" | "days" | "lead" | "zone";

export type CpImportRole = "CUSTOMER" | "SUPPLIER";

export const CUSTOMER_FIELDS: ImportField<CpFieldKey>[] = [
  { key: "stir", req: true, syn: ["inn", "stir", "innpinfl", "pinfl"] },
  { key: "cname", req: true, syn: ["naimenovanie", "nomi", "kontragent", "name", "nazvanie", "mijoz", "klient"] },
  { key: "ctype", req: false, syn: ["tip", "turi", "vid"] },
  { key: "region", req: false, syn: ["region", "hudud", "oblast"] },
  { key: "address", req: false, syn: ["adres", "manzil"] },
  { key: "phone", req: false, syn: ["telefon", "tel", "phone"] },
  { key: "limit", req: false, syn: ["limit", "kreditlimit"] },
  { key: "days", req: false, syn: ["ocrochka", "otsrochka", "tolovmuddati", "srokoplati"] },
  { key: "zone", req: false, syn: ["savdozonasi", "zona", "torgovayazona", "zone"] },
];

export const SUPPLIER_FIELDS: ImportField<CpFieldKey>[] = [
  { key: "stir", req: true, syn: ["inn", "stir"] },
  { key: "cname", req: true, syn: ["naimenovanie", "nomi", "postavshik", "name", "yetkazibberuvchi"] },
  { key: "region", req: false, syn: ["region", "hudud"] },
  { key: "address", req: false, syn: ["adres", "manzil"] },
  { key: "phone", req: false, syn: ["telefon", "tel", "phone"] },
  { key: "days", req: false, syn: ["ocrochka", "otsrochka", "tolovmuddati", "srokoplati"] },
  { key: "lead", req: false, syn: ["srokpostavki", "yetkazish", "etkazish"] },
];

export function importFields(role: CpImportRole): ImportField<CpFieldKey>[] {
  return role === "SUPPLIER" ? SUPPLIER_FIELDS : CUSTOMER_FIELDS;
}

/** 4-qadam jadvali: maydonlar + «Natija» va «Izoh»; tahrirlanadigan kataklar. */
export function checkColumns(role: CpImportRole): (CpFieldKey | "match" | "msg")[] {
  return [...importFields(role).map((f) => f.key), "match", "msg"];
}

export const EDITABLE: CpFieldKey[] = ["stir", "cname", "limit", "days", "lead"];

/** Xato izohining qaysi katakka tegishli ekanligi (qizil chegara). */
export function messageField(key: string, params: Record<string, string>): CpFieldKey | null {
  if (params.f) return params.f as CpFieldKey;
  if (key.startsWith("cTin")) return "stir";
  return null;
}

/** Shablon — tanlangan til sarlavhalari bilan boʻsh CSV qatori (MEDIX nomlari avtomatik taniladi). */
export function templateRows(role: CpImportRole, label: (k: CpFieldKey) => string): string[][] {
  return [importFields(role).map((f) => label(f.key))];
}
