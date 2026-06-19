// Unit tests for the Anthropic error classifier — the fatal-vs-transient decision that prevents a
// billing/auth halt from being swallowed as a per-item content failure. CI-gated via discipline.yml.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAnthropic, anthropicError, isFatalAnthropic } from "./anthropic-error.mjs";

const credit = { error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } };

test("OUT OF CREDITS (400) → fatal, labeled, FULL message preserved (the bug that started this)", () => {
  const c = classifyAnthropic(400, credit);
  assert.equal(c.fatal, true);
  assert.equal(c.label, "ANTHROPIC_OUT_OF_CREDITS");
  assert.match(c.message, /credit balance is too low/); // never truncated away
  assert.match(c.message, /HTTP 400/);
});

test("other 400 invalid_request (prompt too long / max_tokens) → fatal, non-retryable", () => {
  const c = classifyAnthropic(400, { error: { type: "invalid_request_error", message: "prompt is too long: 250000 tokens > 200000 maximum" } });
  assert.equal(c.fatal, true);
  assert.equal(c.label, "ANTHROPIC_FATAL");
});

test("401/403 auth → fatal", () => {
  assert.equal(classifyAnthropic(401, { error: { message: "invalid x-api-key" } }).fatal, true);
  assert.equal(classifyAnthropic(403, { error: { message: "forbidden" } }).fatal, true);
});

test("429 / 500 / 503 / 529 → TRANSIENT (retryable), never fatal", () => {
  for (const s of [429, 500, 503, 529]) {
    const c = classifyAnthropic(s, { error: { type: "overloaded_error", message: "overloaded" } });
    assert.equal(c.fatal, false, `status ${s} must be transient`);
    assert.equal(c.label, "ANTHROPIC_TRANSIENT");
  }
});

test("anthropicError() carries fatal + status on the Error; isFatalAnthropic reads it", () => {
  const e = anthropicError(400, credit);
  assert.equal(e.fatal, true);
  assert.equal(e.status, 400);
  assert.equal(isFatalAnthropic(e), true);
  assert.equal(isFatalAnthropic(new Error("plain")), false);
  assert.equal(isFatalAnthropic(anthropicError(503, { error: { message: "overloaded" } })), false);
});

test("missing/empty body does not throw; degrades to a labeled message", () => {
  const c = classifyAnthropic(400, undefined);
  assert.equal(c.fatal, true);
  assert.ok(typeof c.message === "string" && c.message.length > 0);
});
