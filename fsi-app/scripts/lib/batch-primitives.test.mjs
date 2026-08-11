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

// CI, 2026-08-11: this assertion failed with "interval 49ms should be >= 50ms" — a single sample against a
// hard wall-clock floor. Diagnosed rather than re-run. The limiter stamps its reference instant just before
// it invokes fn; the caller reads the clock just after. When that sub-millisecond crossing lands on a
// millisecond boundary, the two Date.now() reads round to different integers and the OBSERVED gap reads one
// low. Measured over 400 paced calls: exactly one 1ms undershoot, and a top-up-in-a-loop implementation
// undershoots identically — so the limiter is not the defect and "fixing" it would have been a no-op.
//
// What the limiter actually owes the caller is (a) a floor it never misses by more than clock granularity
// and (b) NO ACCUMULATING drift, because drift is what turns a paced batch into a 429. Both are asserted
// below, over enough samples that a single unlucky rounding cannot pass OR fail the suite by luck.
const CLOCK_GRANULARITY_MS = 1; // Date.now() truncates; the two reads can straddle one tick.

test("withRateLimit: every gap holds the floor to within clock granularity", async () => {
  const fn = withRateLimit(async () => Date.now(), { minIntervalMs: 20 });
  const stamps = [];
  for (let i = 0; i < 12; i++) stamps.push(await fn());
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
  const short = gaps.filter((g) => g < 20 - CLOCK_GRANULARITY_MS);
  assert.deepEqual(short, [], `no gap may fall a full tick below the floor; got ${gaps.join(", ")}`);
});

test("withRateLimit: pacing error does NOT accumulate — the property a 429 actually depends on", async () => {
  // The failure mode that matters is a limiter that runs slightly fast and compounds it, so call 50 fires
  // far earlier than the floor implies. Total elapsed must be at least (n-1) intervals, minus one tick.
  const fn = withRateLimit(async () => Date.now(), { minIntervalMs: 20 });
  const stamps = [];
  for (let i = 0; i < 12; i++) stamps.push(await fn());
  const elapsed = stamps[stamps.length - 1] - stamps[0];
  const floor = 20 * (stamps.length - 1) - CLOCK_GRANULARITY_MS;
  assert.ok(elapsed >= floor, `11 gaps at a 20ms floor must span >= ${floor}ms; spanned ${elapsed}ms`);
});

test("withRateLimit: a longer floor is honoured, not just the default", async () => {
  const fn = withRateLimit(async () => Date.now(), { minIntervalMs: 50 });
  const t1 = await fn();
  const t2 = await fn();
  assert.ok(t2 - t1 >= 50 - CLOCK_GRANULARITY_MS, `interval ${t2 - t1}ms should be >= 50ms (±1 tick)`);
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
