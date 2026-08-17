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

// TOLERANCE, and why it is not a weakened assertion (2026-08-17).
//
// This test went red in CI at `interval 49ms should be >= 50ms` while passing locally. That is not
// a rate-limiter bug: withRateLimit sleeps via setTimeout, whose deadline is measured on libuv's
// monotonic clock, while the assertion measures Date.now() — a different clock, truncated to whole
// milliseconds. The two can disagree by ~1ms, so a correct 50ms sleep can be observed as 49.
//
// An exact boundary on a cross-clock comparison is therefore a flaky gate, and a gate that reds at
// random is worse than no gate: it trains everyone to re-run CI instead of reading it, which is how
// a REAL red gets waved through. Standing rule 15's concern is proofs that do not execute; this is
// its neighbour — a proof that executes and lies.
//
// The tolerance is 2ms, which is far below anything that could hide a real defect. The failure this
// test exists to catch is the rate limiter not pacing at all, which shows up as an interval near 0,
// not near 49. The upper bound is the other half: it proves the wrapper is not simply sleeping
// forever or serialising on something unrelated.
const TIMER_SLOP_MS = 2;

test("withRateLimit: enforces minimum interval between calls", async () => {
  const fn = withRateLimit(async () => Date.now(), { minIntervalMs: 50 });
  const t1 = await fn();
  const t2 = await fn();
  const interval = t2 - t1;
  assert.ok(
    interval >= 50 - TIMER_SLOP_MS,
    `interval ${interval}ms should be >= ${50 - TIMER_SLOP_MS}ms (50ms minus ${TIMER_SLOP_MS}ms cross-clock slop)`
  );
  // Without the limiter this would be ~0, so the lower bound is what proves pacing happened; this
  // bound proves the pacing is the 50ms one and not some much larger accidental wait.
  assert.ok(
    interval < 50 * 10,
    `interval ${interval}ms is far above the 50ms minimum — the limiter is waiting on the wrong thing`
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
