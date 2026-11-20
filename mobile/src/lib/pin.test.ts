import { test } from "node:test";
import assert from "node:assert/strict";
import { afterFailure, isComplete, pinMaterial, popDigit, pushDigit, PIN_MAX_ATTEMPTS } from "./pin.ts";

test("faqat raqam va 4 tadan oshmaydi", () => {
  let p = "";
  for (const d of ["1", "a", "2", "3", "4", "5"]) p = pushDigit(p, d);
  assert.equal(p, "1234");
  assert.equal(isComplete(p), true);
  assert.equal(popDigit(p), "123");
  assert.equal(isComplete("123"), false);
});

test("5 marta xato — bloklanadi", () => {
  let s = { failed: 0 };
  let last = afterFailure(s);
  for (let i = 1; i < PIN_MAX_ATTEMPTS; i++) {
    assert.equal(last.locked, false);
    s = last.state;
    last = afterFailure(s);
  }
  assert.equal(last.left, 0);
  assert.equal(last.locked, true);
});

test("xesh materiali tuz va PIN ni oʻz ichiga oladi", () => {
  assert.notEqual(pinMaterial("1234", "a"), pinMaterial("1234", "b"));
});
