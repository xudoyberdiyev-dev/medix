/** Rollar matritsasi mantigʻi (prototip WizRoles): bogʻliqliklar, qulflar, oʻzgarishlar hisobi. Sof funksiyalar — testlanadi. */

export const MATRIX_GROUPS = ["sales", "wh", "money", "ref", "rep", "admin", "special"] as const;
export type MatrixGroup = (typeof MATRIX_GROUPS)[number];

export const HOME_KINDS = [
  "director",
  "branch",
  "operator",
  "purchase",
  "keeper",
  "cashier",
  "accountant",
  "picker",
  "marker",
  "driver",
] as const;
export type HomeKind = (typeof HOME_KINDS)[number];

export interface MatrixPermission {
  key: string;
  module: string;
  description: string;
  group: string;
  kind: string;
  page?: string | null;
  lock?: string | null;
}

export interface MatrixRole {
  /** Mavjud rol kodi yoki yangi rol uchun vaqtinchalik `new:<n>` */
  code: string;
  name: string;
  description?: string | null;
  scope: string;
  home: string;
  active: boolean;
  system: boolean;
  employeeCount: number;
  copiedFrom?: string | null;
}

const KIND_ORDER = ["view", "create", "cancel", "approve", "special"];

export type Grants = Record<string, string[]>;

export interface MatrixState {
  roles: MatrixRole[];
  grants: Grants;
}

export const DIRECTOR = "DIRECTOR";
export const isNewRole = (code: string) => code.startsWith("new:");

/** Katakcha qulfi: Direktor ustuni oʻzgarmaydi; «faqat Direktor» kaliti boshqa rolga berilmaydi. */
export function lockOf(roleCode: string, p: MatrixPermission): "dir" | "only" | null {
  if (roleCode === DIRECTOR) return "dir";
  if (p.lock === "excl") return null;
  if (p.lock === "dir") return "only";
  return null;
}

/**
 * Ruxsatni yoqish/oʻchirish. Amal yoqilsa — oʻsha sahifani koʻrish ham yoqiladi;
 * koʻrish oʻchsa — sahifaning boshqa ruxsatlari ham oʻchadi (`off` — oʻchganlar).
 */
export function toggle(
  keys: readonly string[],
  key: string,
  on: boolean,
  perms: readonly MatrixPermission[],
): { keys: string[]; off: string[]; viewOn: boolean } {
  const byKey = new Map(perms.map((p) => [p.key, p]));
  const p = byKey.get(key);
  const set = new Set(keys);
  const off: string[] = [];
  let viewOn = false;
  if (!p) return { keys: [...set], off, viewOn };
  if (on) {
    set.add(key);
    const view = p.page ? `${p.page}.view` : null;
    if (p.kind !== "view" && view && byKey.has(view) && !set.has(view)) {
      set.add(view);
      viewOn = true;
    }
  } else {
    set.delete(key);
    if (p.kind === "view")
      for (const q of perms)
        if (q.key !== key && q.page === p.page && set.has(q.key)) {
          set.delete(q.key);
          off.push(q.key);
        }
  }
  return { keys: [...set].sort(), off, viewOn };
}

export function diff(a: readonly string[] = [], b: readonly string[] = []): { add: string[]; rem: string[] } {
  const A = new Set(a);
  const B = new Set(b);
  return { add: [...B].filter((k) => !A.has(k)).sort(), rem: [...A].filter((k) => !B.has(k)).sort() };
}

const fieldsChanged = (a: MatrixRole, b: MatrixRole) =>
  a.name !== b.name || (a.description ?? "") !== (b.description ?? "") || a.scope !== b.scope || a.home !== b.home || a.active !== b.active;

/** Saqlanmagan oʻzgarishlar: soni, taʼsirlangan rollar, olib tashlanayotgan ruxsatlar va xodimlar soni. */
export function changes(base: MatrixState, draft: MatrixState) {
  let n = 0;
  const roles: string[] = [];
  const rem: Record<string, string[]> = {};
  for (const r of draft.roles) {
    const d = diff(base.grants[r.code], draft.grants[r.code]);
    const b = base.roles.find((x) => x.code === r.code);
    let c = d.add.length + d.rem.length;
    if (!b || fieldsChanged(b, r)) c++;
    if (c) {
      n += c;
      roles.push(r.code);
    }
    if (d.rem.length) rem[r.code] = d.rem;
  }
  const employees = roles.reduce((s, code) => s + (draft.roles.find((r) => r.code === code)?.employeeCount ?? 0), 0);
  return { n, roles, rem, employees };
}

export function changed(base: MatrixState, draft: MatrixState, role: string, key: string) {
  return (base.grants[role] ?? []).includes(key) !== (draft.grants[role] ?? []).includes(key);
}

/** Yangi rol: asos rolning ruxsatlari («faqat Direktor» kalitlarisiz). */
export function copyGrants(from: string | null, state: MatrixState, perms: readonly MatrixPermission[]): string[] {
  if (!from) return [];
  const only = new Set(perms.filter((p) => p.lock === "dir").map((p) => p.key));
  return (state.grants[from] ?? []).filter((k) => !only.has(k));
}

/** Qidiruv, «faqat maxsus», «faqat oʻzgarganlar» boʻyicha guruhlangan qatorlar. */
export function groupRows(
  perms: readonly MatrixPermission[],
  opts: {
    query: string;
    onlySpecial: boolean;
    onlyChanged: boolean;
    name: (p: MatrixPermission) => string;
    isChanged: (key: string) => boolean;
  },
) {
  const q = opts.query.trim().toLowerCase();
  // Guruh ichida: sahifalar birinchi uchrash tartibida, sahifa ichida koʻrish → yaratish → bekor → tasdiq → maxsus
  const pageOrder = new Map<string, number>();
  for (const p of perms) if (!pageOrder.has(p.page ?? p.module)) pageOrder.set(p.page ?? p.module, pageOrder.size);
  const rank = (p: MatrixPermission) => (pageOrder.get(p.page ?? p.module) ?? 0) * 10 + Math.max(0, KIND_ORDER.indexOf(p.kind));
  return MATRIX_GROUPS.map((g) => {
    const all = perms.filter((p) => p.group === g).sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
    const items = all.filter(
      (p) =>
        (!q || opts.name(p).toLowerCase().includes(q) || p.key.toLowerCase().includes(q)) &&
        (!opts.onlySpecial || p.kind === "special") &&
        (!opts.onlyChanged || opts.isChanged(p.key)),
    );
    return { group: g, all, items };
  }).filter((x) => x.items.length > 0);
}

/** Saqlash soʻrovi: Direktordan tashqari barcha rollar. */
export function toRequest(draft: MatrixState) {
  return draft.roles
    .filter((r) => r.code !== DIRECTOR)
    .map((r) => ({
      code: isNewRole(r.code) ? undefined : r.code,
      name: r.name,
      description: r.description ?? undefined,
      scope: r.scope,
      home: r.home,
      active: r.active,
      permissions: draft.grants[r.code] ?? [],
      copiedFrom: r.copiedFrom ?? undefined,
    }));
}
