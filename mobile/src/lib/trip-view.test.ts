import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDayMonth, formatMoney, formatTime, toTiyin } from "./format.ts";
import { allLoaded, cashInHand, cashToCollect, loadStates, mapUri, nextStop, telUri, type TripDetail, type TripStop } from "./trip-view.ts";

function stop(p: Partial<TripStop> & { id: number; seq: number }): TripStop {
  return {
    orderId: p.id, orderNumber: `BY-TSH-${p.id}`, customer: `Mijoz ${p.id}`, paymentType: "CASH", places: 4, total: "100000.00",
    photos: 0, signed: false, lines: 1, qty: 1, ...p,
  } as TripStop;
}

function trip(list: TripStop[]): TripDetail {
  return { id: 1, number: "RS-TSH-000014", stops: list } as TripDetail;
}

test("pul formati — float'siz", () => {
  assert.equal(toTiyin("820000.5"), 82000050n);
  assert.equal(formatMoney("1250000"), "1.250.000,00");
  assert.equal(formatMoney("820000.00", true), "820.000");
  assert.equal(formatMoney("0.10"), "0,10");
  assert.equal(formatMoney(null), "0,00");
  assert.equal(formatMoney("-1500.00"), "−1.500,00");
});

test("sana va vaqt — Toshkent", () => {
  assert.equal(formatDate("2026-11-20"), "20.11.2026");
  assert.equal(formatDate("2026-11-19T20:30:00Z"), "20.11.2026");
  assert.equal(formatDayMonth("2026-11-19"), "19.11");
  assert.equal(formatTime("2026-11-20T04:40:00Z"), "09:40");
});

test("yuklash holatlari: qabul qilingan, joriy, kutilmoqda", () => {
  const t = trip([stop({ id: 3, seq: 3 }), stop({ id: 1, seq: 1, loadedAt: "2026-11-20T04:00:00Z" }), stop({ id: 2, seq: 2 })]);
  assert.deepEqual(loadStates(t).map((x) => [x.stop.id, x.state]), [[1, "loaded"], [2, "current"], [3, "waiting"]]);
  assert.equal(allLoaded(t), false);
});

test("keyingi manzil va naqd", () => {
  const t = trip([
    stop({ id: 1, seq: 1, outcome: "DELIVERED", cashCollected: "1250000.00" }),
    stop({ id: 2, seq: 2, total: "820000.00" }),
    stop({ id: 3, seq: 3, paymentType: "TRANSFER", total: "500000.00" }),
  ]);
  assert.equal(nextStop(t)?.id, 2);
  assert.equal(cashInHand(t), 125000000n);
  assert.equal(cashToCollect(t), 82000000n);
});

test("telefon va xarita havolalari", () => {
  assert.equal(telUri("+998 (90) 123-45-67"), "tel:+998901234567");
  assert.equal(telUri("12"), null);
  assert.equal(mapUri(" Yunusobod 4-kv "), "geo:0,0?q=Yunusobod%204-kv");
  assert.equal(mapUri(null), null);
});

test("reys yakuni: olinishi kerak, natijalar soni", async () => {
  const { cashDue, outcomeCounts } = await import("./trip-view.ts");
  const t = trip([
    stop({ id: 1, seq: 1, outcome: "DELIVERED", total: "1000.00" }),
    stop({ id: 2, seq: 2, outcome: "PARTIAL", total: "820000.00", returnTotal: "189000.00" }),
    stop({ id: 3, seq: 3, outcome: "UNDELIVERED" }),
    stop({ id: 4, seq: 4, outcome: "DELIVERED", paymentType: "TRANSFER" }),
  ]);
  assert.equal(cashDue(t), 63200000n);
  assert.deepEqual(outcomeCounts(t), { delivered: 2, partial: 1, undelivered: 1 });
});
