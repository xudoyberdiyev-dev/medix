export type HistoryKind = "create" | "change" | "status";

/** Audit amali → «Tarix» filtri turi. */
export function historyKind(action: string): HistoryKind {
  if (action === "product.create") return "create";
  if (action === "product.activate" || action === "product.deactivate") return "status";
  return "change";
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

const parse = (json: string | null | undefined): Record<string, unknown> => {
  if (!json) return {};
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Eski va yangi qiymatlar (JSON) farqi — faqat oʻzgargan maydonlar, kalit tartibida. */
export function historyChanges(oldValue: string | null | undefined, newValue: string | null | undefined): FieldChange[] {
  const a = parse(oldValue);
  const b = parse(newValue);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.filter((k) => !same(a[k], b[k])).map((k) => ({ field: k, from: a[k] ?? null, to: b[k] ?? null }));
}
