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
