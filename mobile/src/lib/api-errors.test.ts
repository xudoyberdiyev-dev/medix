import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrl, isSessionExpired, loginErrorKind } from "./api-errors.ts";

test("login xatolari turlarga ajraladi", () => {
  assert.equal(loginErrorKind(403, "mobile.driverOnly"), "role");
  assert.equal(loginErrorKind(403, "mobile.passwordChangeRequired"), "passwordChange");
  assert.equal(loginErrorKind(403, "auth.blocked"), "blocked");
  assert.equal(loginErrorKind(429, "auth.locked"), "locked");
  assert.equal(loginErrorKind(401, "auth.badCredentialsLeft"), "credentials");
  assert.equal(loginErrorKind(400, "validation"), "credentials");
  assert.equal(loginErrorKind(502, undefined), "network");
  assert.equal(loginErrorKind(500, "error.unexpected"), "network");
});

test("token yaroqsizligi aniqlanadi", () => {
  assert.equal(isSessionExpired(401, "mobile.tokenInvalid"), true);
  assert.equal(isSessionExpired(403, "auth.forbidden"), false);
  assert.equal(isSessionExpired(401, "auth.badCredentialsLeft"), false);
});

test("API manzili", () => {
  assert.equal(apiUrl("https://a.uz/", "/api/x"), "https://a.uz/api/x");
  assert.equal(apiUrl("https://a.uz", "/api/x"), "https://a.uz/api/x");
});
