import { Archive, Lock, PackageOpen, ShieldAlert, Snowflake, Truck, type LucideIcon } from "lucide-react";
import type { ZoneTypeCode } from "./overview-state";

/** Zona turi belgisi (prototip `Stock`: ZT). */
export const ZONE_ICON: Record<ZoneTypeCode, { icon: LucideIcon; cls: string }> = {
  MAIN: { icon: Archive, cls: "text-text-secondary" },
  RECEIVING: { icon: PackageOpen, cls: "text-text-secondary" },
  QUARANTINE: { icon: ShieldAlert, cls: "text-warning" },
  SHIPPING: { icon: Truck, cls: "text-text-secondary" },
  COLD: { icon: Snowflake, cls: "text-info" },
  SAFE: { icon: Lock, cls: "text-danger" },
};
