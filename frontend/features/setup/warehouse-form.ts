import type { components } from "@/lib/api/schema";

export type Warehouse = components["schemas"]["Warehouse"];
export type WarehouseRequest = components["schemas"]["WarehouseRequest"];
export type ZoneType = Warehouse["zones"][number]["type"];
export type WarehouseKind = Warehouse["kind"];

/** Prototip WarehousePanel tartibi: Qabul, Saqlash, Sovuq, Seyf, Karantin, Joʻnatish. */
export const ZONE_ORDER: readonly ZoneType[] = ["RECEIVING", "MAIN", "COLD", "SAFE", "QUARANTINE", "SHIPPING"];
/** Har omborda boʻlishi shart (SPEC 2) — olib tashlanmaydi. */
export const REQUIRED_ZONES: readonly ZoneType[] = ["RECEIVING", "MAIN", "QUARANTINE", "SHIPPING"];
/** Sotuvga ochiqlik zona turidan (SPEC 2): Asosiy saqlash, Sovuq, Seyf. */
export const SELLABLE_ZONES: readonly ZoneType[] = ["MAIN", "COLD", "SAFE"];

export interface ZoneRow {
  type: ZoneType;
  name: string;
}

export interface WarehouseForm {
  branchId: string | null;
  name: string;
  sameAddress: boolean;
  address: string;
  kind: WarehouseKind;
  keeperId: string | null;
  zones: ZoneRow[];
}

export const sortZones = (zones: ZoneRow[]) => [...zones].sort((a, b) => ZONE_ORDER.indexOf(a.type) - ZONE_ORDER.indexOf(b.type));

/** Turi boʻyicha standart nom (zona nomi maydonining boshlangʻich qiymati). */
export type ZoneNames = Record<ZoneType, string>;

export function formFromWarehouse(
  w: Warehouse | null | undefined,
  defaults: { branchId: number | null; branchAddress?: string | null; zoneNames: ZoneNames },
): WarehouseForm {
  if (!w) {
    return {
      branchId: defaults.branchId == null ? null : String(defaults.branchId),
      name: "",
      sameAddress: Boolean(defaults.branchAddress),
      address: "",
      kind: "NORMAL",
      keeperId: null,
      zones: REQUIRED_ZONES.map((type) => ({ type, name: defaults.zoneNames[type] })).sort(
        (a, b) => ZONE_ORDER.indexOf(a.type) - ZONE_ORDER.indexOf(b.type),
      ),
    };
  }
  const same = Boolean(defaults.branchAddress) && (w.address ?? "") === defaults.branchAddress;
  return {
    branchId: String(w.branchId),
    name: w.name,
    sameAddress: same,
    address: same ? "" : (w.address ?? ""),
    kind: w.kind,
    keeperId: w.keeperId == null ? null : String(w.keeperId),
    zones: sortZones(w.zones.map((z) => ({ type: z.type, name: z.name }))),
  };
}

/** Tur tanlanmagan ixtiyoriy zonalar (Sovuq, Seyf) — «Zona qoʻshish» menyusi uchun. */
export const freeZoneTypes = (zones: ZoneRow[]) => ZONE_ORDER.filter((t) => !zones.some((z) => z.type === t));

export function withZone(zones: ZoneRow[], type: ZoneType, name: string): ZoneRow[] {
  return zones.some((z) => z.type === type) ? zones : sortZones([...zones, { type, name }]);
}

export type WarehouseErrorKey = "eBranch" | "eName" | "eAddr" | "eZName" | "eZDup";
export type WarehouseErrors = Partial<Record<"branchId" | "name" | "address" | `zone.${number}`, WarehouseErrorKey>>;

/** Xatolar — `warehousePanel` lugʻati kalitlari. */
export function validateWarehouse(f: WarehouseForm): WarehouseErrors {
  const e: WarehouseErrors = {};
  if (!f.branchId) e.branchId = "eBranch";
  if (!f.name.trim()) e.name = "eName";
  if (!f.sameAddress && !f.address.trim()) e.address = "eAddr";
  const seen = new Set<string>();
  f.zones.forEach((z, i) => {
    const n = z.name.trim().toLocaleLowerCase();
    if (!n) e[`zone.${i}`] = "eZName";
    else if (seen.has(n)) e[`zone.${i}`] = "eZDup";
    seen.add(n);
  });
  return e;
}

export function bodyFromForm(f: WarehouseForm, branchAddress: string | null | undefined): WarehouseRequest {
  const address = f.sameAddress ? (branchAddress ?? "") : f.address.trim();
  return {
    branchId: Number(f.branchId),
    name: f.name.trim(),
    address: address || undefined,
    kind: f.kind,
    keeperId: f.keeperId == null ? undefined : Number(f.keeperId),
    extraZones: f.zones.filter((z) => !REQUIRED_ZONES.includes(z.type)).map((z) => z.type),
    zoneNames: Object.fromEntries(f.zones.map((z) => [z.type, z.name.trim()])),
  };
}
