import { Ban, CalendarClock, PackageCheck, Truck } from "lucide-react";
import type { components } from "@/lib/api/schema";
import { formatQuantity } from "@/lib/format";
import type { OrdersT } from "./i18n";

export type ReadyOrder = components["schemas"]["ReadyOrder"];
export type TripSummary = components["schemas"]["TripSummary"];
export type TripStatus = TripSummary["status"];
export type HandedSale = components["schemas"]["HandedSale"];

/** Reys holati koʻrinishi; nomi — lugʻatda (`orders.shipments.tripStatus.*`). */
export const TRIP_STATUS: Record<TripStatus, { tone: "info" | "warning" | "success" | "neutral"; icon: typeof Truck }> = {
  PLANNED: { tone: "info", icon: CalendarClock },
  IN_TRANSIT: { tone: "info", icon: Truck },
  RETURN_WAIT: { tone: "warning", icon: Truck },
  DONE: { tone: "success", icon: PackageCheck },
  CANCELLED: { tone: "neutral", icon: Ban },
};

/** Tanlangan buyurtmalar joylari (E6, 07.11: mashina sigʻimi yoʻq — faqat maʼlumot). */
export function placesText(selected: number, t: OrdersT): string {
  return t("shipments.places", { n: formatQuantity(selected) });
}

export interface AreaGroup {
  /** Hudud nomi; null — hudud koʻrsatilmagan. */
  region: string | null;
  orders: ReadyOrder[];
  /** Hudud boʻyicha jami summa (tiyinlarda aniq qoʻshish uchun satr → BigInt). */
  total: string;
}

/** Pul satrlarini aniq qoʻshish (float ishlatmasdan): "1250.50" + "10.05" → "1260.55". */
export function addMoney(a: string, b: string): string {
  const cents = (s: string) => {
    const neg = s.trim().startsWith("-");
    const [i, f = ""] = s.trim().replace("-", "").split(".");
    const v = BigInt(i || "0") * 100n + BigInt((f + "00").slice(0, 2));
    return neg ? -v : v;
  };
  const v = cents(a) + cents(b);
  const abs = v < 0n ? -v : v;
  const s = `${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
  return v < 0n ? `-${s}` : s;
}

/** «Yetkazish» buyurtmalari hudud boʻyicha (prototip Shipping): hudud nomi tartibida, hududsizlar oxirida. */
export function groupByRegion(orders: ReadyOrder[]): AreaGroup[] {
  const map = new Map<string | null, ReadyOrder[]>();
  for (const o of orders) {
    const k = o.region ?? null;
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, "uz")))
    .map(([region, list]) => ({ region, orders: list, total: list.reduce((s, o) => addMoney(s, o.total), "0.00") }));
}

/** Yetkazish sanasi holati: bugun / oʻtgan / keyin (ISO sanalar solishtiriladi). */
export function deliveryDateState(date: string | null | undefined, today: string): "today" | "late" | "later" | "none" {
  if (!date) return "none";
  return date === today ? "today" : date < today ? "late" : "later";
}

/** «Terildi: N daqiqa/soat/kun oldin»: daqiqalar. */
export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function agoText(min: number, t: OrdersT): string {
  return min < 60
    ? t("shipments.agoM", { n: min })
    : min < 1440
      ? t("shipments.agoH", { n: Math.floor(min / 60) })
      : t("shipments.agoD", { n: Math.floor(min / 1440) });
}

/** Reys progressi (prototip): yakunlangan — «a / b yetkazildi», yoʻlda — «a / b belgilandi», boshqasi — «0 / b yetkazildi». */
export function tripProgress(t: Pick<TripSummary, "status" | "orders" | "delivered" | "marked">, tr: OrdersT): string {
  if (t.status === "IN_TRANSIT" || t.status === "RETURN_WAIT") return tr("shipments.finProg", { a: t.marked, b: t.orders });
  if (t.status === "DONE") return tr("shipments.prog", { a: t.delivered, b: t.orders });
  return tr("shipments.prog", { a: 0, b: t.orders });
}
