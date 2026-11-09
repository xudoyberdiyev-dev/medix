// Kontragent shakli (prototip CounterpartyForm): holat, tekshiruv va API soʻroviga aylantirish — sof funksiyalar.
import type { components } from "@/lib/api/schema";
import { parseMoneyInput, parseUzDate } from "./api";

type Detail = components["schemas"]["CounterpartyDetail"];
type Request = components["schemas"]["CounterpartyRequest"];
export type PaymentType = "CASH" | "TRANSFER" | "ONLINE";

export interface ContactForm {
  name: string;
  position: string;
  phone: string;
}

export interface CpForm {
  tin: string;
  name: string;
  legalName: string;
  regionId: string | null;
  phone: string;
  address: string;
  email: string;
  kind: string | null;
  vatCode: string;
  note: string;
  contacts: ContactForm[];
  bankName: string;
  bankMfo: string;
  bankAccount: string;
  // Faqat yangi kartada: litsenziya va birinchi filial shartlari
  pharmNo: string;
  pharmUntil: string;
  ctrl: boolean;
  ctrlNo: string;
  ctrlUntil: string;
  branchId: string | null;
  limit: string;
  days: string;
  /** Mijoz: standart chegirma, % (E8) */
  disc: string;
  /** YB: yetkazish muddati, kun (E8) */
  lead: string;
  priceTypeId: string | null;
  mainPay: PaymentType | null;
}

export type FormErr =
  "required" | "tin" | "email" | "mfo" | "account" | "vat" | "date" | "dateOrder" | "money" | "days" | "pct" | "contactName";
export type ErrKey = keyof CpForm | `contact${number}`;

const blankContact = (): ContactForm => ({ name: "", position: "", phone: "" });

export function emptyForm(branchId: string | null): CpForm {
  return {
    tin: "",
    name: "",
    legalName: "",
    regionId: null,
    phone: "",
    address: "",
    email: "",
    kind: null,
    vatCode: "",
    note: "",
    contacts: [blankContact()],
    bankName: "",
    bankMfo: "",
    bankAccount: "",
    pharmNo: "",
    pharmUntil: "",
    ctrl: false,
    ctrlNo: "",
    ctrlUntil: "",
    branchId,
    limit: "",
    days: "30",
    disc: "",
    lead: "",
    priceTypeId: null,
    mainPay: null,
  };
}

export function formFromDetail(c: Detail): CpForm {
  const contacts = c.contacts.length
    ? c.contacts.map((k) => ({ name: k.name, position: k.position ?? "", phone: k.phone ?? "" }))
    : c.contactPerson
      ? [{ name: c.contactPerson, position: "", phone: "" }]
      : [blankContact()];
  return {
    ...emptyForm(null),
    tin: c.tin,
    name: c.name,
    legalName: c.legalName ?? "",
    regionId: c.region ? String(c.region.id) : null,
    phone: c.phone ?? "",
    address: c.address ?? "",
    email: c.email ?? "",
    kind: c.kind ?? null,
    vatCode: c.vatCode ?? "",
    note: c.note ?? "",
    contacts,
    bankName: c.bankName ?? "",
    bankMfo: c.bankMfo ?? "",
    bankAccount: c.bankAccount ?? "",
  };
}

export const sameForm = (a: CpForm, b: CpForm) => JSON.stringify(a) === JSON.stringify(b);

const filled = (k: ContactForm) => !!(k.name.trim() || k.position.trim() || k.phone.trim());

/** Mahalliy tekshiruv; `isNew` — litsenziya va shartlar ham, `supplier` — asosiy toʻlov turi. */
export function validateForm(f: CpForm, o: { isNew: boolean; supplier: boolean; terms: boolean }): Partial<Record<ErrKey, FormErr>> {
  const e: Partial<Record<ErrKey, FormErr>> = {};
  const tin = f.tin.replace(/\s/g, "");
  if (!tin) e.tin = "required";
  else if (!/^(\d{9}|\d{14})$/.test(tin)) e.tin = "tin";
  if (!f.name.trim()) e.name = "required";
  if (!f.kind) e.kind = "required";
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = "email";
  if (f.vatCode.trim() && !/^\d{12}$/.test(f.vatCode.trim())) e.vatCode = "vat";
  if (f.bankMfo.trim() && !/^\d{5}$/.test(f.bankMfo.trim())) e.bankMfo = "mfo";
  if (f.bankAccount.replace(/\s/g, "") && !/^\d{20}$/.test(f.bankAccount.replace(/\s/g, ""))) e.bankAccount = "account";
  f.contacts.forEach((k, i) => {
    if (filled(k) && !k.name.trim()) e[`contact${i}`] = "contactName";
  });
  if (!o.isNew) return e;
  if (o.supplier && !f.mainPay) e.mainPay = "required";
  // Litsenziya (farmatsevtik) — yangi kontragentda majburiy (egasi E9); nazoratdagi — belgilansa
  const pair = (no: "pharmNo" | "ctrlNo", until: "pharmUntil" | "ctrlUntil", need: boolean) => {
    if (!need && !f[no].trim() && !f[until].trim()) return;
    if (!f[no].trim()) e[no] = "required";
    const d = parseUzDate(f[until]);
    if (!f[until].trim()) e[until] = "required";
    else if (!d) e[until] = "date";
    else if (d <= new Date().toISOString().slice(0, 10)) e[until] = "dateOrder";
  };
  pair("pharmNo", "pharmUntil", true);
  if (f.ctrl) pair("ctrlNo", "ctrlUntil", true);
  if (o.terms) {
    if (!f.branchId) e.branchId = "required";
    if (!o.supplier && parseMoneyInput(f.limit) === null) e.limit = "money";
    if (!/^\d{1,3}$/.test(f.days.trim()) || Number(f.days) > 365) e.days = "days";
    if (!o.supplier && f.disc.trim() && !/^\d{1,2}([.,]\d{1,2})?$/.test(f.disc.trim())) e.disc = "pct";
    if (o.supplier && f.lead.trim() && (!/^\d{1,3}$/.test(f.lead.trim()) || Number(f.lead) > 365)) e.lead = "days";
  }
  return e;
}

const t = (v: string) => v.trim() || undefined;

/** Karta soʻrovi: rol oʻzgarmaydi (yangi kartada — sahifa roli), kontaktlar — toʻldirilganlari. */
export function toRequest(f: CpForm, roles: { customer: boolean; supplier: boolean }): Request {
  const contacts = f.contacts.filter((k) => k.name.trim());
  return {
    tin: f.tin.replace(/\s/g, ""),
    name: f.name.trim(),
    legalName: t(f.legalName),
    customer: roles.customer,
    supplier: roles.supplier,
    kind: (f.kind ?? undefined) as Request["kind"],
    regionId: f.regionId ? Number(f.regionId) : undefined,
    address: t(f.address),
    phone: t(f.phone),
    contactPerson: contacts[0]?.name.trim(),
    email: t(f.email),
    bankName: t(f.bankName),
    bankAccount: t(f.bankAccount.replace(/\s/g, "")),
    bankMfo: t(f.bankMfo),
    vatCode: t(f.vatCode),
    note: t(f.note),
    contacts: contacts.map((k) => ({ name: k.name.trim(), position: t(k.position), phone: t(k.phone) })),
  };
}

/** Yangi karta bilan birga saqlanadigan litsenziyalar. */
export function licenseRequests(f: CpForm) {
  const out: { number: string; kind: string; validUntil?: string; controlledAllowed: boolean }[] = [];
  if (f.pharmNo.trim())
    out.push({
      number: f.pharmNo.trim(),
      kind: "Farmatsevtika faoliyati",
      validUntil: parseUzDate(f.pharmUntil) ?? undefined,
      controlledAllowed: false,
    });
  if (f.ctrl && f.ctrlNo.trim())
    out.push({
      number: f.ctrlNo.trim(),
      kind: "Nazoratdagi preparatlar",
      validUntil: parseUzDate(f.ctrlUntil) ?? undefined,
      controlledAllowed: true,
    });
  return out;
}

/** Birinchi filial shartlari: mijoz — limit, muddat, narx turi; YB — muddat va asosiy toʻlov turi. */
export function termsRequest(f: CpForm, supplier: boolean): components["schemas"]["TermsRequest"] {
  const days = Number(f.days.trim());
  return supplier
    ? {
        supplierPaymentDays: days,
        defaultPaymentType: f.mainPay ?? undefined,
        supplierDeliveryDays: f.lead.trim() ? Number(f.lead.trim()) : undefined,
      }
    : {
        creditLimit: parseMoneyInput(f.limit) ?? undefined,
        paymentDays: days,
        priceTypeId: f.priceTypeId ? Number(f.priceTypeId) : undefined,
        discountPct: f.disc.trim() ? Number(f.disc.trim().replace(",", ".")) : undefined,
      };
}
