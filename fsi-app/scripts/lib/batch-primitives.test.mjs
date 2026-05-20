// Unit tests for batch-primitives. Run with: node --test fsi-app/scripts/lib/batch-primitives.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withRetry,
  withRateLimit,
  withIdempotency,
  isAnthropicRetryable,
  isPgRetryable,
  isGenericRetryable,
} from "./batch-primitives.mjs";

test("withRetry: succeeds on first attempt without retrying", async () => {
  let calls = 0;
  const fn = withRetry(async () => {
    calls++;
    return "ok";
  });
  assert.equal(await fn(), "ok");
  assert.equal(calls, 1);
});

test("withRetry: retries on retryable error and succeeds", async () => {
  let calls = 0;
  const fn = withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new Error("Request timed out");
      return "ok";
    },
    { backoffMs: [5, 5, 5], isRetryable: isAnthropicRetryable }
  );
  assert.equal(await fn(), "ok");
  assert.equal(calls, 3);
});

test("withRetry: throws after exhausting retries on retryable error", async () => {
  let calls = 0;
  const fn = withRetry(
    async () => {
      calls++;
      throw new Error("Request timed out");
    },
    { maxRetries: 2, backoffMs: [5, 5], isRetryable: isAnthropicRetryable }
  );
  await assert.rejects(fn(), /Request timed out/);
  assert.equal(calls, 3);
});

test("withRetry: throws immediately on non-retryable error", async () => {
  let calls = 0;
  const fn = withRetry(
    async () => {
      calls++;
      const err = new Error("bad request");
      err.status = 400;
      throw err;
    },
    { isRetryable: isAnthropicRetryable }
  );
  await assert.rejects(fn(), /bad request/);
  assert.equal(calls, 1);
});

test("withRateLimit: enforces minimum interval between calls", async () => {
  const fn = withRateLimit(async () => Date.now(), { minIntervalMs: 50 });
  const t1 = await fn();
  const t2 = await fn();
  assert.ok(
    t2 - t1 >= 50,
    `interval ${t2 - t1}ms should be >= 50ms`
  );
});

test("withRateLimit: serializes concurrent calls when maxConcurrent=1", async () => {
  let inFlight = 0;
  let maxObserved = 0;
  const fn = withRateLimit(
    async () => {
      inFlight++;
      maxObserved = Math.max(maxObserved, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
    },
    { minIntervalMs: 0 }
  );
  await Promise.all([fn(), fn(), fn()]);
  assert.equal(maxObserved, 1);
});

test("withIdempotency: skips when already done", async () => {
  let calls = 0;
  const fn = withIdempotency(
    async () => {
      calls++;
      return "executed";
    },
    {
      isAlreadyDone: async () => true,
      markDone: async () => {},
    }
  );
  const result = await fn({ id: 1 });
  assert.equal(result.skipped, true);
  assert.equal(calls, 0);
});

test("withIdempotency: executes when not done and marks done", async () => {
  let calls = 0;
  let marked = false;
  const fn = withIdempotency(
    async () => {
      calls++;
      return "executed";
    },
    {
      isAlreadyDone: async () => false,
      markDone: async () => {
        marked = true;
      },
    }
  );
  const result = await fn({ id: 1 });
  assert.equal(result.skipped, false);
  assert.equal(result.result, "executed");
  assert.equal(calls, 1);
  assert.equal(marked, true);
});

test("isAnthropicRetryable: matches expected retryable shapes", () => {
  assert.equal(isAnthropicRetryable(new Error("Request timed out")), true);
  assert.equal(isAnthropicRetryable(new Error("ECONNRESET")), true);
  assert.equal(isAnthropicRetryable(new Error("socket hang up")), true);
  assert.equal(isAnthropicRetryable({ status: 429, message: "rate limit" }), true);
  assert.equal(isAnthropicRetryable({ status: 503, message: "service unavailable" }), true);
});

test("isAnthropicRetryable: does NOT match non-retryable shapes", () => {
  assert.equal(isAnthropicRetryable({ status: 400, message: "bad request" }), false);
  assert.equal(isAnthropicRetryable({ status: 401, message: "unauthorized" }), false);
  assert.equal(isAnthropicRetryable(new Error("invalid model")), false);
  assert.equal(isAnthropicRetryable(null), false);
});

test("isPgRetryable: matches expected retryable shapes", () => {
  assert.equal(isPgRetryable(new Error("Connection terminated unexpectedly")), true);
  assert.equal(isPgRetryable(new Error("ETIMEDOUT")), true);
  assert.equal(isPgRetryable({ code: "57P01", message: "admin shutdown" }), true);
});

test("isPgRetryable: does NOT match non-retryable shapes", () => {
  assert.equal(isPgRetryable(new Error("syntax error at or near")), false);
  assert.equal(isPgRetryable({ code: "23505", message: "unique violation" }), false);
  assert.equal(isPgRetryable(null), false);
});

test("isGenericRetryable: matches generic network errors", () => {
  assert.equal(isGenericRetryable(new Error("network timeout")), true);
  assert.equal(isGenericRetryable(new Error("ECONNRESET")), true);
  assert.equal(isGenericRetryable(new Error("bad input")), false);
});
