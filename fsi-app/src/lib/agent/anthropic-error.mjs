// src/lib/agent/anthropic-error.mjs
//
// Classify a failed Anthropic Messages API response. PURE (CI-unit-tested) so the fatal-vs-transient
// decision can never silently regress and re-introduce the error-swallow (a billing/auth halt getting
// mislabeled as a per-item content failure — the defect that made "credit balance is too low" surface
// as an ambiguous "ledger call failed" / "still-quarantined").
//
//   FATAL / non-retryable + operator-actionable: HTTP 400 (out-of-credits, prompt-too-long, max_tokens,
//     malformed), 401/403 (auth/permission). Retrying cannot fix these — the batch runner HALTS with the
//     actionable cause instead of grinding every item.
//   TRANSIENT / retryable: 429 (rate limit), 500/503/529 (overload), network. The existing backoff retries.

/** @returns {{ fatal: boolean, label: string, message: string, status: number }} */
export function classifyAnthropic(status, body) {
  const err = (body && body.error) || {};
  const msg = err.message || (body ? JSON.stringify(body) : "");
  const fatal = status === 400 || status === 401 || status === 403;
  const label = /credit balance is too low|plans\s*&\s*billing|purchase credits/i.test(msg)
    ? "ANTHROPIC_OUT_OF_CREDITS"
    : fatal ? "ANTHROPIC_FATAL" : "ANTHROPIC_TRANSIENT";
  return { fatal, label, message: `${label} (HTTP ${status} ${err.type || "error"}): ${msg}`, status };
}

/** Build a thrown Error carrying the classification (so callers/runners can branch on e.fatal). */
export function anthropicError(status, body) {
  const c = classifyAnthropic(status, body);
  const e = /** @type {Error & {fatal:boolean,status:number}} */ (new Error(c.message));
  e.fatal = c.fatal; e.status = c.status;
  return e;
}

/** True when an error came from anthropicError and is fatal/non-retryable. */
export function isFatalAnthropic(e) { return !!(e && e.fatal); }
