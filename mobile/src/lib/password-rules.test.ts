import { test } from "node:test";
import assert from "node:assert/strict";
import { newPasswordProblem } from "./password-rules.ts";

test("yangi parol qoidalari", () => {
  assert.equal(newPasswordProblem("qisqa1", "qisqa1", "Vaqt-123"), "short");
  assert.equal(newPasswordProblem("faqatharflar", "faqatharflar", "Vaqt-123"), "chars");
  assert.equal(newPasswordProblem("12345678", "12345678", "Vaqt-123"), "chars");
  assert.equal(newPasswordProblem("Vaqt-1234", "Vaqt-1234", "Vaqt-1234"), "same");
  assert.equal(newPasswordProblem("Yangi-parol-1", "Yangi-parol-2", "Vaqt-123"), "mismatch");
  assert.equal(newPasswordProblem("Янги-парол-1", "Янги-парол-1", "Vaqt-123"), null);
  assert.equal(newPasswordProblem("Yangi-parol-1", "Yangi-parol-1", "Vaqt-123"), null);
});
