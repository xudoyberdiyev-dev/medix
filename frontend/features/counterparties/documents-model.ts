// Kontragent kartochkasi hujjat yorliqlari (prototip CounterpartyCard): holat matni, rangi va havolasi — sof funksiyalar.
import type { components } from "@/lib/api/schema";
import { cents } from "./overview-model";

export type DocSection = components["schemas"]["CounterpartyDocumentsPage"]["section"];
export type DocRow = components["schemas"]["DocRow"];
export type DocTone = "success" | "warning" | "danger" | "neutral";

/** Kartochka yorliqlari tartibi (prototip: mijoz — docs, sales, pays, qm; YB — docs (kirimlar), pays, qy). */
export function docSections(customers: boolean): DocSection[] {
  return customers ? ["ORDERS", "SALES", "PAYMENTS", "RETURNS"] : ["RECEIPTS", "PAYMENTS", "RETURNS"];
}

/** Yorliqni koʻrish ruxsati (API bilan bir xil). */
export function sectionPermission(section: DocSection, customers: boolean): string {
  switch (section) {
    case "ORDERS":
      return "orders.view";
    case "SALES":
      return "shipments.view";
    case "PAYMENTS":
      return "payments.view";
    case "RETURNS":
      return customers ? "qm.view" : "qy.view";
    case "RECEIPTS":
      return "receipt.view";
  }
}

const dayMs = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);

export type DocState =
  | { kind: "status"; status: string; tone: DocTone }
  | { kind: "paid"; tone: "success" }
  | { kind: "due"; due: string | null; open: string; tone: "warning" }
  | { kind: "late"; days: number; open: string; tone: "danger" };

const STATUS_TONE: Record<string, DocTone> = {
  POSTED: "success",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REJECTED: "danger",
  UNDELIVERED: "danger",
};

/** Sotuv/kirim: ochiq qoldiq boʻlsa — muddati (yoki kechikkani); toʻlangan — «Toʻlangan»; qolganlari — hujjat holati. */
export function docState(row: DocRow, today: string): DocState {
  if (row.open != null && row.status !== "CANCELLED") {
    if (cents(row.open) <= 0n) return { kind: "paid", tone: "success" };
    if (row.dueDate && row.dueDate < today) return { kind: "late", days: days(row.dueDate, today), open: row.open, tone: "danger" };
    return { kind: "due", due: row.dueDate ?? null, open: row.open, tone: "warning" };
  }
  return { kind: "status", status: row.status, tone: STATUS_TONE[row.status] ?? "warning" };
}

/** Hujjatni ochish havolasi. */
export function docHref(section: DocSection, customers: boolean, row: DocRow): string | null {
  const id = row.linkId ?? row.id;
  switch (section) {
    case "ORDERS":
    case "SALES":
      return row.linkId != null ? `/orders/${id}` : null;
    case "PAYMENTS":
      return customers ? `/payments?open=${id}` : "/payments?tab=yt";
    case "RETURNS":
      return customers ? (row.linkId != null ? `/orders/${id}` : null) : `/supplier-returns?open=${id}`;
    case "RECEIPTS":
      return `/receipts/${id}`;
  }
}

/** «Boʻlimga oʻtish» — tegishli roʻyxat sahifasi. */
export function sectionHref(section: DocSection, customers: boolean): string {
  switch (section) {
    case "ORDERS":
      return "/orders";
    case "SALES":
      return "/shipments";
    case "PAYMENTS":
      return customers ? "/payments" : "/payments?tab=yt";
    case "RETURNS":
      return customers ? "/reports/returns" : "/supplier-returns";
    case "RECEIPTS":
      return "/receipts";
  }
}
