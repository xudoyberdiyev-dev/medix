import { test } from "node:test";
import assert from "node:assert/strict";
import { cashDigits, checkCash, digitsToTiyin, groupDigits, returnedAmount, tiyinToApi, tiyinToDigits } from "./stop-view.ts";

test("naqd summa kiritish", () => {
  assert.equal(cashDigits("800.000"), "800000");
  assert.equal(cashDigits("00120"), "120");
  assert.equal(groupDigits("800000"), "800.000");
  assert.equal(digitsToTiyin("800000"), 80000000n);
  assert.equal(tiyinToApi(80000000n), "800000.00");
  assert.equal(tiyinToApi(0n), null);
  assert.equal(tiyinToDigits(82000050n), "820000");
});

test("kam olingan summa — qarz, koʻp — mumkin emas", () => {
  assert.deepEqual(checkCash(82000000n, 80000000n), { kind: "short", short: 2000000n });
  assert.deepEqual(checkCash(82000000n, 82000000n), { kind: "full" });
  assert.deepEqual(checkCash(82000050n, 82000000n), { kind: "full" });
  assert.deepEqual(checkCash(82000000n, 90000000n), { kind: "over" });
  assert.deepEqual(checkCash(0n, 0n), { kind: "empty" });
});

test("qaytgan qism summasi", () => {
  const lines = [
    { id: 1, qty: 20, amount: "378000.00" },
    { id: 2, qty: 3, amount: "100.00" },
  ];
  assert.equal(returnedAmount(lines, { 1: 10 }), 18900000n);
  assert.equal(returnedAmount(lines, { 2: 1 }), 3333n);
  assert.equal(returnedAmount(lines, { 1: 99 }), 37800000n);
});
