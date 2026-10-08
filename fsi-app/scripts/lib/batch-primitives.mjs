// batch-primitives.mjs
//
// Resilience primitives for long-running batch scripts in Caro's Ledge.
// See remediation-discipline skill Section 5 (primitive extraction patterns)
// and Section 7 worked example 1 (Q4 sources 21/22 failure) for the
// architectural rationale.
//
// Triggered by OBS-51 (Q4 sample-scale validation passed but full-batch
// hit Anthropic timeout + pg disconnect at sources 21/22).
//
// Primitives:
//   withRetry(fn, opts)               retry with backoff on retryable errors
//   withRateLimit(fn, opts)           enforce minimum interval / max concurrency
//   withIdempotency(fn, opts)         skip already-done items
//   createPgPool(opts)                configured pg.Pool factory
//
// Predicates (callers compose into withRetry):
//   isGenericRetryable(err)           generic network errors
//   isAnthropicRetryable(err)         for @anthropic-ai/sdk consumers
//   isPgRetryable(err)                for pg.Pool consumers
//
// Design notes:
//   - withReconnect is intentionally absent. pg.Pool handles reconnection
//     natively when configured correctly; a separate wrapper would reinvent.
//   - withCheckpoint (save-and-resume progress state) is intentionally absent.
//     Current batches finish in 16 min and resume cleanly via idempotency
//     alone. Add withCheckpoint if a long-running batch (multi-hour) needs it.

import pg from "pg";

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];

// ─────────────────────────────────────────────────────────────────
// withRetry
//
// Wraps an async function with retry-on-error logic. Retries on errors
// matched by isRetryable predicate. Per-attempt backoff from backoffMs
// array (last value reused for attempts past array length).
//
// Example:
//   const wrapped = withRetry(
//     () => anthropic.messages.create({...}),
//     { isRetryable: isAnthropicRetryable }
//   );
//   const result = await wrapped();
// ─────────────────────────────────────────────────────────────────
export function withRetry(fn, opts = {}) {
  const {
    maxRetries = 3,
    backoffMs = DEFAULT_BACKOFF_MS,
    isRetryable = isGenericRetryable,
  } = opts;

  return async (...args) => {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        lastErr = err;
        if (attempt === maxRetries) throw err;
        if (!isRetryable(err)) throw err;
        const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)];
        await sleep(delay);
      }
    }
    throw lastErr;
  };
}

export function isGenericRetryable(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return /timeout|econnreset|socket hang up|network|temporarily unavailable/.test(
    msg
  );
}

export function isAnthropicRetryable(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  if (
    /request timed out|network|connection|timeout|econnreset|socket hang up/.test(
      msg
    )
  ) {
    return true;
  }
  const status = err.status || err.statusCode;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  return false;
}

export function isPgRetryable(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  if (
    /connection terminated|econnreset|etimedout|server closed the connection/.test(
      msg
    )
  ) {
    return true;
  }
  const code = err.code;
  if (code === "57P01" || code === "57P02" || code === "57P03") return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────
// withRateLimit
//
// Enforces minimum interval between calls. maxConcurrent=1 (default)
// serializes execution; >1 enables limited concurrency. Stateful: the
// queue is shared across all invocations of the wrapped fn.
//
// Example:
//   const paced = withRateLimit(
//     (input) => anthropic.messages.create({ ...input }),
//     { minIntervalMs: 1200 }
//   );
// ─────────────────────────────────────────────────────────────────
export function withRateLimit(fn, opts = {}) {
  const { minIntervalMs = 1000, maxConcurrent = 1 } = opts;
  let lastCallTime = 0;
  let inFlight = 0;
  const queue = [];

  async function tryExecute() {
    if (inFlight >= maxConcurrent || queue.length === 0) return;
    const sinceLast = Date.now() - lastCallTime;
    if (sinceLast < minIntervalMs) {
      await sleep(minIntervalMs - sinceLast);
    }
    const task = queue.shift();
    if (!task) return;
    inFlight++;
    lastCallTime = Date.now();
    try {
      const result = await fn(...task.args);
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      inFlight--;
      tryExecute();
    }
  }

  return (...args) =>
    new Promise((resolve, reject) => {
      queue.push({ args, resolve, reject });
      tryExecute();
    });
}

// ─────────────────────────────────────────────────────────────────
// withIdempotency
//
// Skip-if-already-done wrapper. Caller provides isAlreadyDone(input)
// predicate and markDone(input, result) recorder.
//
// Returns { skipped: true, input } when skipped,
//   or { skipped: false, input, result } when executed.
// ─────────────────────────────────────────────────────────────────
export function withIdempotency(fn, opts = {}) {
  const { isAlreadyDone, markDone } = opts;
  if (typeof isAlreadyDone !== "function") {
    throw new Error("withIdempotency: isAlreadyDone must be a function");
  }
  return async (input) => {
    if (await isAlreadyDone(input)) {
      return { skipped: true, input };
    }
    const result = await fn(input);
    if (typeof markDone === "function") {
      await markDone(input, result);
    }
    return { skipped: false, input, result };
  };
}

// ─────────────────────────────────────────────────────────────────
// createPgPool
//
// Factory returning a configured pg.Pool. Defaults tuned for
// long-running batch operations. Pool handles reconnection on idle
// disconnects natively; no separate retry wrapper needed for the
// connection layer (use withRetry only for query-level retries).
// ─────────────────────────────────────────────────────────────────
export function createPgPool(opts = {}) {
  const {
    connectionString,
    max = 2,
    idleTimeoutMillis = 30000,
    connectionTimeoutMillis = 10000,
  } = opts;
  if (!connectionString) {
    throw new Error("createPgPool: connectionString required");
  }
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  });
  pool.on("error", (err) => {
    console.error("[pg.Pool error]", err.message || err);
  });
  return pool;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
