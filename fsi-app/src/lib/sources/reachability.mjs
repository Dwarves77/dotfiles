import { browserlessFetch, BrowserlessError } from "./canonical-fetch.mjs";

export const REACH = Object.freeze({ REACHABLE: "reachable", INCONCLUSIVE: "inconclusive", DEAD: "dead" });

// Classify ONE fetch result. errored=true => the render threw (timeout/abort/network/
// render-fail) = a non-answer. status = observed HTTP status, or null.
export function classifyReachability({ status, errored }) {
  if (errored) return REACH.INCONCLUSIVE;                  // couldn't get an answer at all
  if (status >= 200 && status < 300) return REACH.REACHABLE;
  if (status === 405) return REACH.REACHABLE;              // method policy; a GET serves
  if (status === 404 || status === 410) return REACH.DEAD; // definitive not-found = genuine negative
  return REACH.INCONCLUSIVE;                               // 403 refused / 429 limited / 5xx server = non-answer
}

// PRE-FIX mapping, retained ONLY as the mutation-check baseline — it proves the new
// stored-outcome assertion DISCRIMINATES (the assertion fails on this, passes on the fix).
// NOT for production use. Faithful to the bug: every non-2xx/405 -> DEAD.
export function classifyReachability_LEGACY_BUGGY({ status, errored }) {
  if (errored) return REACH.DEAD;                          // BUG: timeout / 429-as-throw / 5xx-as-throw -> dead
  if (status >= 200 && status < 300) return REACH.REACHABLE;
  if (status === 405) return REACH.REACHABLE;
  if (status >= 400 && status < 500) return REACH.DEAD;    // BUG: 429 / 403 / 404 all -> dead
  return REACH.DEAD;                                       // BUG: 5xx -> dead
}

// Outcome -> verification tier contribution. null = reachable, proceed with the pipeline.
export function reachabilityTier(outcome) {
  if (outcome === REACH.REACHABLE) return null;
  if (outcome === REACH.INCONCLUSIVE) return { tier: "M", rejection_reason: "reachability_inconclusive" };
  return { tier: "L", rejection_reason: "reachability" }; // DEAD
}

// HEAD-equivalent reachability via the canonical fetch. `render` is INJECTABLE (defaults to
// the SSOT browserlessFetch) so the failure mode that STILL happens post-D1 (a Browserless
// 429/5xx/timeout) can be FORCED deterministically in a test. `classify` is injectable
// ONLY for the mutation-check baseline; production always uses the default.
export async function checkReachability(url, opts = {}) {
  const {
    render = browserlessFetch,
    classify = classifyReachability,
    timeoutMs = 8000,
    backoff = [200, 800, 3200],
    maxAttempts = 3,
  } = opts;
  let last = { status: null, errored: true, error: "not attempted" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, backoff[attempt - 1] ?? 0));
    try {
      const r = await render(url, { maxTextLength: 1000, gotoTimeoutMs: timeoutMs });
      last = { status: r.status, errored: false };
    } catch (e) {
      last = { status: e instanceof BrowserlessError ? (e.status ?? null) : null, errored: true, error: e?.message ?? String(e) };
    }
    const outcome = classify(last);
    // REACHABLE and DEAD are terminal; INCONCLUSIVE (429/5xx/timeout) retries the budget.
    if (outcome === REACH.REACHABLE || outcome === REACH.DEAD) {
      return { outcome, ok: outcome === REACH.REACHABLE, finalStatus: last.status, attempts: attempt };
    }
  }
  return { outcome: classify(last), ok: false, finalStatus: last.status, attempts: maxAttempts, error: last.error };
}
