import type { DosageForm, ProductDetail, ProductRequest } from "./api";

/** Mahsulot shakli — toʻliq sahifa (prototip `Products` → `isForm`). Hammasi satr (inputlar uchun). */
export interface PageForm {
  code: string;
  name: string;
  contractName: string;
  classifierName: string;
  manufacturerId: string | null;
  categoryId: string | null;
  supplyEmployeeId: string | null;
  dosageForm: DosageForm | null;
  countryId: string | null;
  dose: string;
  packQty: string;
  minQty: string;
  maxQty: string;
  barcodes: string[];
  ikpu: string;
  farmId: string;
  unitId: string | null;
  perPack: string;
  controlled: boolean;
  marked: boolean;
  prescription: boolean;
  /** "12" | "0" | "none" (QQSsiz) yoki eski boshqa stavka ("15"). */
  vat: string;
  note: string;
}

export const EMPTY_PAGE_FORM: PageForm = {
  code: "",
  name: "",
  contractName: "",
  classifierName: "",
  manufacturerId: null,
  categoryId: null,
  supplyEmployeeId: null,
  dosageForm: null,
  countryId: null,
  dose: "",
  packQty: "",
  minQty: "",
  maxQty: "",
  barcodes: [],
  ikpu: "",
  farmId: "",
  unitId: null,
  perPack: "",
  controlled: false,
  marked: false,
  prescription: false,
  vat: "12",
  note: "",
};

const num = (n: number | null | undefined) => (n ? String(n) : "");

export function pageFormFromProduct(p: ProductDetail): PageForm {
  const id = (r?: { id: number } | null) => (r ? String(r.id) : null);
  const rate = p.vatRate.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return {
    code: p.code,
    name: p.name,
    contractName: p.contractName ?? "",
    classifierName: p.classifierName ?? "",
    manufacturerId: id(p.manufacturer),
    categoryId: id(p.category),
    supplyEmployeeId: id(p.supplyEmployee),
    dosageForm: p.dosageForm ?? null,
    countryId: id(p.country),
    dose: p.dose ?? "",
    packQty: num(p.packQty),
    minQty: num(p.minQty),
    maxQty: num(p.maxQty),
    barcodes: [...p.barcodes],
    ikpu: p.ikpu ?? "",
    farmId: p.farmId ?? "",
    unitId: String(p.unit.id),
    perPack: num(p.perPack),
    controlled: p.controlled,
    marked: p.marked,
    prescription: p.prescription,
    vat: p.vatExempt ? "none" : rate,
    note: p.note ?? "",
  };
}

/** «Nusxa olish»: kod va shtrix-kodlarsiz, nomga qoʻshimcha. */
export function copyForm(p: ProductDetail, suffix: string): PageForm {
  return { ...pageFormFromProduct(p), code: "", name: p.name + suffix, barcodes: [] };
}

export type EanError = "len" | "digits" | "check";

/** EAN-8 / EAN-13: faqat raqam, uzunlik va nazorat raqami. */
export function eanCheck(code: string): EanError | null {
  if (!/^\d+$/.test(code)) return "digits";
  if (code.length !== 8 && code.length !== 13) return "len";
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  // Oʻngdan: 3, 1, 3, 1 …
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? null : "check";
}

/** Majburiy maydonlar — prototip tartibida (xatolar bloki shu tartibda havola beradi). */
export const REQUIRED: (keyof PageForm)[] = ["name", "contractName", "classifierName", "manufacturerId", "categoryId", "ikpu", "farmId"];

export type PageFormError = "required" | "codeFmt" | "maxMin" | "ikpu" | "unit";

export function validatePageForm(f: PageForm): Partial<Record<keyof PageForm, PageFormError>> {
  const e: Partial<Record<keyof PageForm, PageFormError>> = {};
  for (const k of REQUIRED) {
    const v = f[k];
    if (v === null || (typeof v === "string" && !v.trim())) e[k] = "required";
  }
  if (!e.ikpu && !/^\d{17}$/.test(f.ikpu.trim())) e.ikpu = "ikpu";
  if (!/^[1-9]\d{7}$/.test(f.code)) e.code = "codeFmt";
  if (Number(f.maxQty) > 0 && Number(f.minQty) > Number(f.maxQty)) e.maxQty = "maxMin";
  if (!f.unitId) e.unitId = "unit";
  return e;
}

export function toPageRequest(f: PageForm): ProductRequest {
  const text = (v: string) => v.trim() || undefined;
  const int = (v: string) => (/^\d+$/.test(v) && Number(v) > 0 ? Number(v) : undefined);
  const id = (v: string | null) => (v ? Number(v) : undefined);
  const exempt = f.vat === "none";
  return {
    code: f.code,
    name: f.name.trim(),
    contractName: text(f.contractName),
    classifierName: text(f.classifierName),
    manufacturerId: id(f.manufacturerId),
    categoryId: id(f.categoryId),
    countryId: id(f.countryId),
    unitId: Number(f.unitId),
    supplyEmployeeId: id(f.supplyEmployeeId),
    ikpu: text(f.ikpu),
    farmId: text(f.farmId),
    barcodes: f.barcodes,
    controlled: f.controlled,
    marked: f.marked,
    prescription: f.prescription,
    vatRate: exempt ? "0" : f.vat,
    vatExempt: exempt,
    minQty: int(f.minQty),
    maxQty: int(f.maxQty),
    dosageForm: f.dosageForm ?? undefined,
    dose: text(f.dose),
    packQty: int(f.packQty),
    perPack: int(f.perPack),
    note: text(f.note),
  };
}

export const sameForm = (a: PageForm, b: PageForm) => JSON.stringify(a) === JSON.stringify(b);
