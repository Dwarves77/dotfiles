// Sprint 4 Block 1 task 1.14 + Component 7 — span-check fetch with timeout policy.
//
// When provenance validation must fetch source content to verify a FACT span
// (the Component 3 fallback path: cached agent_run_searches.result_content_excerpt
// is missing or stale), this is the fetch. Policy (operator ruling 2026-05-29):
//   - On timeout / network unreachable -> throw RetryableError so the WDK retries
//     2-3 times with backoff. A timeout means the claim is UNVERIFIED; we do NOT
//     accept it because the source was "historically reachable."
//   - On retryable HTTP (5xx, 429) -> RetryableError as well.
//   - On a permanent 4xx miss -> return { ok:false } so the caller routes the
//     claim to staging (no retry; it won't succeed).
//   - On 2xx -> return the excerpt for the substring span-check.
//
// The retry COUNT + backoff is owned by the WDK step config that wraps this in
// the workflow; on retry exhaustion the workflow routes the claim to staging.
//
// This unit is deliberately framework-light (only RetryableError from "workflow")
// so the timeout -> RetryableError behavior is unit-testable with NO dev server
// (see scripts/sprint4-114-spancheck-test.mjs).
import { RetryableError } from "workflow";

export interface SpanCheckResult {
  ok: boolean;
  excerpt: string | null;
  status: number | null;
}

export async function spanCheckFetch(url: string, timeoutMs = 8000): Promise<SpanCheckResult> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const err = e as Error;
    const isTimeout = err.name === "TimeoutError" || err.name === "AbortError";
    // Timeout OR network-unreachable = UNVERIFIED -> retry, then stage on exhaustion.
    throw new RetryableError(
      `span-check ${isTimeout ? "timeout" : "network error"} for ${url}: ${err.message}`,
      { retryAfter: "3s" }
    );
  }
  if (res.status >= 500 || res.status === 429) {
    throw new RetryableError(`span-check HTTP ${res.status} for ${url}`, { retryAfter: "3s" });
  }
  if (!res.ok) {
    // Permanent 4xx miss (except 429): not retryable; caller routes to staging.
    return { ok: false, excerpt: null, status: res.status };
  }
  const text = await res.text();
  return { ok: true, excerpt: text.slice(0, 2000), status: res.status };
}
