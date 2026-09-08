/**
 * fallback-guard — a data fetcher's FAILURE payload must never be written
 * into the Next.js data cache.
 *
 * THE DEFECT THIS REMOVES (lane rsc503, 2026-09-08, production).
 *
 * `fetchDashboardData` and its four siblings never throw on failure. On a
 * Supabase timeout, an empty RPC result, or any caught exception they
 * RESOLVE with an all-empty payload carrying `_error: SEED_FALLBACK_ERROR`
 * (supabase-server.ts, the `emptyFallback` branches). `lib/data.ts` then
 * hands that fetcher to `unstable_cache`.
 *
 * Reading next@16.1.6's own `unstable_cache` implementation
 * (`dist/server/web/spec-extension/unstable-cache.js`): the cache callback's
 * RESOLVED value is passed to `cacheNewResult` unconditionally, which
 * `incrementalCache.set`s it under the entry's key and tags. There is no
 * "don't cache this" return value. So ONE transient failure wrote the
 * failure payload into the cache entry, and every later request was served
 * that payload from cache without touching Supabase at all.
 *
 * That is the whole observed production symptom: the dashboard rendering
 * `DUE NEXT · 0 ITEMS`, `no detection pass on record` and
 * `Data temporarily unavailable. Refresh to retry.` together (the three
 * surfaces of one empty payload), on repeated cold loads, still in that
 * state 79 seconds later. `revalidate: 60` makes it worse rather than
 * better: it is a stale-while-revalidate window, so past 60 s the request
 * is served the STALE (failure) payload immediately while the refresh runs
 * behind it, and if that refresh also fails the poison is rewritten.
 *
 * It also made the copy a lie. "Refresh to retry" cannot retry, because the
 * refresh is answered from the poisoned entry.
 *
 * THE FIX, once, for the class. Same source file, the same `const result =
 * await ...run(innerCacheStore, cb, ...args)` line: if `cb` REJECTS, the
 * await rejects and `cacheNewResult` is never reached, so nothing is
 * written. `refuseToCacheFallback` therefore turns a fallback payload into
 * a rejection on the way out of the cache callback, and
 * `readThroughFallbackGuard` turns that rejection back into the same
 * payload on the way in to the caller. The caller sees byte-identical
 * behaviour; the cache sees only healthy payloads.
 */

/** Any fetcher payload that carries `lib/data.ts`'s fail-soft sentinel. */
export interface MaybeFallbackPayload {
  _error?: string;
}

export const FALLBACK_NOT_CACHEABLE = "FallbackNotCacheable";

/**
 * Carries the fallback payload through the cache callback's rejection path.
 * Never surfaces to a caller: `readThroughFallbackGuard` unwraps it.
 */
export class FallbackNotCacheableError extends Error {
  readonly payload: unknown;

  constructor(payload: unknown) {
    super(FALLBACK_NOT_CACHEABLE);
    this.name = FALLBACK_NOT_CACHEABLE;
    this.payload = payload;
  }
}

/** True when a resolved fetcher payload is a fail-soft fallback, not live data. */
export function isFallbackPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return Boolean((value as MaybeFallbackPayload)._error);
}

/**
 * Wrap the function handed to `unstable_cache`. A healthy payload passes
 * through and is cached as before; a fallback payload is thrown instead of
 * returned, so the cache entry is left untouched and the next request runs
 * the real read again.
 */
export function refuseToCacheFallback<A extends unknown[], R>(
  inner: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const result = await inner(...args);
    if (isFallbackPayload(result)) {
      throw new FallbackNotCacheableError(result);
    }
    return result;
  };
}

/**
 * Wrap the call to the cached function. Restores the fallback payload the
 * guard threw; every other rejection (a real timeout, a real bug) keeps
 * propagating to the caller's own catch, unchanged.
 */
export async function readThroughFallbackGuard<R>(run: () => Promise<R>): Promise<R> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof FallbackNotCacheableError) {
      return e.payload as R;
    }
    throw e;
  }
}
