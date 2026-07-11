// Unit tests for the post-auth return-path allowlist (Wave-α A6).
// Run: node --test fsi-app/src/lib/auth/safe-return-path.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeReturnPath } from "./safe-return-path.mjs";

test("same-origin absolute paths pass through unchanged", () => {
  assert.equal(sanitizeReturnPath("/"), "/");
  assert.equal(sanitizeReturnPath("/onboarding"), "/onboarding");
  assert.equal(sanitizeReturnPath("/regulations/eu-ppwr"), "/regulations/eu-ppwr");
  assert.equal(sanitizeReturnPath("/admin?tab=coverage"), "/admin?tab=coverage");
});

test("protocol-relative // escapes are rejected (the open-redirect vector)", () => {
  assert.equal(sanitizeReturnPath("//evil.com"), "/");
  assert.equal(sanitizeReturnPath("//evil.com/phish"), "/");
});

test("backslash-normalization escape /\\ is rejected", () => {
  assert.equal(sanitizeReturnPath("/\\evil.com"), "/");
});

test("absolute URLs and scheme-bearing values are rejected", () => {
  assert.equal(sanitizeReturnPath("https://evil.com"), "/");
  assert.equal(sanitizeReturnPath("http://evil.com"), "/");
  assert.equal(sanitizeReturnPath("https://app@evil.com"), "/");
  assert.equal(sanitizeReturnPath("javascript:alert(1)"), "/");
});

test("non-path and empty inputs fall back to /", () => {
  assert.equal(sanitizeReturnPath(""), "/");
  assert.equal(sanitizeReturnPath(null), "/");
  assert.equal(sanitizeReturnPath(undefined), "/");
  assert.equal(sanitizeReturnPath("onboarding"), "/"); // no leading slash
  assert.equal(sanitizeReturnPath("@evil.com"), "/");
});
