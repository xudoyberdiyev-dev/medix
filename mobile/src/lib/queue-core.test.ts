import { test } from "node:test";
import assert from "node:assert/strict";
import { applyQueue, dropFirst, type Queued } from "./queue-core.ts";
import type { TripDetail, TripStop } from "./trip-view.ts";

const stop = (id: number) => ({ id, seq: id, photos: 0, signed: false, paymentType: "CASH", total: "100.00" }) as TripStop;
const trip = { id: 7, stops: [stop(1), stop(2)] } as TripDetail;

test("navbat reysga ustiga qoʻyiladi", () => {
  const q: Queued[] = [
    { id: "a", at: "", kind: "photo", tripId: 7, stopId: 1, uri: "f", signature: false },
    { id: "b", at: "", kind: "photo", tripId: 7, stopId: 1, uri: "s", signature: true },
    { id: "c", at: "", kind: "deliver", tripId: 7, stopId: 1, cash: "100.00" },
    { id: "d", at: "", kind: "undeliver", tripId: 7, stopId: 2, reason: "Mijoz yopiq" },
    { id: "e", at: "", kind: "deliver", tripId: 8, stopId: 2, cash: null },
  ];
  const t = applyQueue(trip, q);
  assert.equal(t.stops[0].photos, 1);
  assert.equal(t.stops[0].signed, true);
  assert.equal(t.stops[0].outcome, "DELIVERED");
  assert.equal(t.stops[0].cashCollected, "100.00");
  assert.equal(t.stops[1].outcome, "UNDELIVERED");
  assert.equal(trip.stops[0].photos, 0, "asl reys oʻzgarmaydi");
  assert.equal(dropFirst(q, "a").length, 4);
});
