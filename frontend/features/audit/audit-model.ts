import type { components } from "@/lib/api/schema";

export type AuditRow = components["schemas"]["AuditRow"];
export type AuditCategory = AuditRow["category"];
export type AuditView = components["schemas"]["AuditViewCount"]["view"];

/** Obyekt sahifasi (prototip «obyekt — hujjat raqami havola»); sahifasi yoʻq obyekt — null. */
const ROUTES: Partial<Record<string, (id: string) => string>> = {
  sales_order: (id) => `/orders/${id}`,
  receipt: (id) => `/receipts/${id}`,
  customer_payment: (id) => `/payments/mt/${id}`,
  supplier_payment: (id) => `/payments/yt/${id}`,
  cash_op: (id) => `/cash/ops/${id}`,
  price_change: (id) => `/prices/changes/${id}`,
  reconciliation_act: (id) => `/reconciliations/${id}`,
  product: (id) => `/products/${id}`,
  employee: (id) => `/settings/employees/${id}`,
  counterparty: (id) => `/customers/${id}`,
  warehouse: () => "/settings/warehouses",
  zone: () => "/settings/warehouses",
  branch: () => "/settings/branches",
  role: () => "/settings/roles",
};

export function objectHref(r: Pick<AuditRow, "entityType" | "entityId">): string | null {
  const route = ROUTES[r.entityType];
  return route && r.entityId && /^\d+$/.test(r.entityId) ? route(r.entityId) : null;
}

export interface DiffLine {
  field: string;
  before: string;
  after: string;
}

function parse(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { value: json };
  }
}

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** «Oldin → keyin»: eski va yangi qiymatlar maydon boʻyicha; oʻzgarmagan maydonlar koʻrsatilmaydi. */
export function auditDiff(r: Pick<AuditRow, "oldValue" | "newValue">): DiffLine[] {
  const a = parse(r.oldValue);
  const b = parse(r.newValue);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.map((field) => ({ field, before: show(a[field]), after: show(b[field]) })).filter((d) => d.before !== d.after);
}

const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Excel uchun CSV («;» ajratgich, prototip exportCsv). */
export function auditCsv(
  rows: AuditRow[],
  o: {
    head: string[];
    time: (r: AuditRow) => string;
    cat: (r: AuditRow) => string;
    object: (r: AuditRow) => string;
    allBranches: string;
  },
): string {
  return [o.head.map(esc).join(";")]
    .concat(
      rows.map((r) => {
        const diff = auditDiff(r);
        return [
          o.time(r),
          r.employeeName ?? "",
          r.roleName ?? "",
          r.branchName ?? o.allBranches,
          o.cat(r),
          o.object(r),
          diff.length ? diff.map((d) => `${d.field}: ${d.before} → ${d.after}`).join("; ") : (r.reason ?? ""),
          r.ip ?? "",
        ]
          .map(esc)
          .join(";");
      }),
    )
    .join("\n");
}
