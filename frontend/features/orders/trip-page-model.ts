import { addMoney, type ReadyOrder } from "./shipments-model";

/** Roʻyxatda elementni `from` oʻrnidan `to` oʻrniga koʻchirish (sudrab tartiblash). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m);
  return next;
}

const norm = (s: string) => s.toLocaleLowerCase("uz").replace(/[ʻʼ'`‘’]/g, "");

/** Reysga qoʻshish mumkin boʻlgan buyurtmalar: shu filial, «Yetkazish», qidiruv — mijoz, raqam, manzil. */
export function availableOrders(ready: readonly ReadyOrder[], branchId: number, q: string): ReadyOrder[] {
  const needle = norm(q.trim());
  return ready.filter(
    (o) =>
      o.branchId === branchId &&
      o.delivery === "DELIVERY" &&
      (!needle || [o.customer, o.number, o.address ?? ""].some((v) => norm(v).includes(needle))),
  );
}

export interface StopTotals {
  stops: number;
  lines: number;
  qty: number;
  sum: string;
}

export function stopTotals(stops: readonly { lines: number; qty: number; total: string }[]): StopTotals {
  return {
    stops: stops.length,
    lines: stops.reduce((s, x) => s + x.lines, 0),
    qty: stops.reduce((s, x) => s + x.qty, 0),
    sum: stops.reduce((s, x) => addMoney(s, x.total), "0.00"),
  };
}

/** Prototip bosqichlari: Rejalashtirilgan → Yoʻlda → Qaytish kutilmoqda → Yakunlangan; bekor — qizil. */
export type StepState = "done" | "cur" | "next" | "fail";
export const TRIP_STEPS = ["PLANNED", "IN_TRANSIT", "RETURN_WAIT", "DONE"] as const;

export function tripSteps(status: string): { key: string; state: StepState }[] {
  if (status === "CANCELLED")
    return [
      { key: "PLANNED", state: "done" },
      { key: "CANCELLED", state: "fail" },
    ];
  const idx = TRIP_STEPS.indexOf(status as (typeof TRIP_STEPS)[number]);
  return TRIP_STEPS.map((key, i) => ({ key, state: i < idx ? "done" : i === idx ? "cur" : "next" }));
}
