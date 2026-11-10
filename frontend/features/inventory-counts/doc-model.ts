import type { components } from "@/lib/api/schema";

export type ScopeMode = components["schemas"]["InventoryCountRequest"]["scopeMode"] & string;
export type ScopeOptions = components["schemas"]["InventoryScopeOptions"];
type Line = components["schemas"]["InventoryCountDetail"]["lines"][number];

/** Qoralama formasi holati (prototip InventoryDoc `x`). */
export interface DraftForm {
  warehouseId: number | null;
  countDate: string;
  scopeMode: ScopeMode;
  zoneIds: number[];
  productIds: number[];
  memberIds: number[];
  chairId: number | null;
  blind: boolean;
}

/** Qamrovdagi qatorlar (partiyalar) soni — prototip `scopeN`: zonalar tanlanmagan boʻlsa butun ombor. */
export function scopeCount(o: ScopeOptions | undefined, f: Pick<DraftForm, "scopeMode" | "zoneIds" | "productIds">): number {
  if (!o) return 0;
  const inZone = (z: number) => f.scopeMode === "WAREHOUSE" || f.zoneIds.length === 0 || f.zoneIds.includes(z);
  if (f.scopeMode === "ZONES" && f.zoneIds.length === 0) return 0;
  return o.products
    .filter((p) => f.scopeMode !== "PRODUCTS" || f.productIds.includes(p.id))
    .reduce((s, p) => s + p.zones.filter((z) => inZone(z.zoneId)).reduce((a, z) => a + z.batches, 0), 0);
}

export type StartError =
  | { k: "wh"; key: "eWh" }
  | { k: "zones"; key: "eZones" }
  | { k: "pids"; key: "ePids" }
  | { k: "comm"; key: "eComm" | "eChair" }
  | { k: "scope"; key: "eEmpty" }
  | { k: "zones"; key: "eBusy"; z: string; n: string };

/** Sanoqni boshlashdan oldingi tekshiruv (prototip `startErrs`). */
export function startErrors(f: DraftForm, o: ScopeOptions | undefined, ownNumber: string | null): StartError[] {
  const e: StartError[] = [];
  if (!f.warehouseId) e.push({ k: "wh", key: "eWh" });
  if (f.scopeMode === "ZONES" && f.zoneIds.length === 0) e.push({ k: "zones", key: "eZones" });
  if (f.scopeMode === "PRODUCTS" && f.productIds.length === 0) e.push({ k: "pids", key: "ePids" });
  if (f.memberIds.length < 2) e.push({ k: "comm", key: "eComm" });
  else if (!f.chairId || !f.memberIds.includes(f.chairId)) e.push({ k: "comm", key: "eChair" });
  if (f.warehouseId && o && scopeCount(o, f) === 0) e.push({ k: "scope", key: "eEmpty" });
  if (o)
    for (const z of o.zones) {
      const used = f.scopeMode === "WAREHOUSE" || f.zoneIds.length === 0 || f.zoneIds.includes(z.id);
      if (used && z.lockedBy && z.lockedBy !== ownNumber) e.push({ k: "zones", key: "eBusy", z: z.name, n: z.lockedBy });
    }
  return e;
}

/** Komissiyaga xodim qoʻshish / olib tashlash: birinchi aʼzo — rais; rais olib tashlansa — rais boʻsh (prototip `staff.toggle`). */
export function toggleMember(f: Pick<DraftForm, "memberIds" | "chairId">, id: number): Pick<DraftForm, "memberIds" | "chairId"> {
  if (f.memberIds.includes(id)) return { memberIds: f.memberIds.filter((m) => m !== id), chairId: f.chairId === id ? null : f.chairId };
  return { memberIds: [...f.memberIds, id], chairId: f.chairId ?? id };
}

export type LineTab = "all" | "todo" | "done" | "diff" | "short" | "over";

/** Qator yorliqlari: sanoqda — Hammasi / Sanalmagan / Sanalgan; natijada — Hammasi / Faqat farqlilar / Kamomad / Ortiqcha. */
export function lineTabs(result: boolean): LineTab[] {
  return result ? ["all", "diff", "short", "over"] : ["all", "todo", "done"];
}

export function lineFilter(tab: LineTab): (l: Line) => boolean {
  switch (tab) {
    case "todo":
      return (l) => l.countedQty == null;
    case "done":
      return (l) => l.countedQty != null;
    case "diff":
      return (l) => (l.diff ?? 0) !== 0;
    case "short":
      return (l) => (l.diff ?? 0) < 0;
    case "over":
      return (l) => (l.diff ?? 0) > 0;
    default:
      return () => true;
  }
}

/** Sana: ISO (YYYY-MM-DD) ↔ KK.OO.YYYY. */
export function isoToDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function dayToIso(day: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(day.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}
