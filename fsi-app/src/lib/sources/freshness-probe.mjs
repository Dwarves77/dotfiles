// @ts-check
// FRESHNESS PROBE (Phase 1, operator ruling 2026-07-13, snapshot-first rebuild). Step 2 of the snapshot-first
// flow: decide whether a stored snapshot is still current WITHOUT a body fetch and WITHOUT a model call — a
// HEAD request only, comparing the server's Last-Modified against when we captured the snapshot. It NEVER
// downloads the body and NEVER spends.
//
// Outcomes (pure core compareFreshness):
//   fresh   — the source demonstrably has not changed since capture → cheap-verify against the stored snapshot.
//   changed — the source demonstrably changed since capture → still cheap-verify against STORED text, but flag
//             stale_snapshot_content_changed and queue for the (locked) paid path. Never silently pass; never
//             fetch the new body here.
//   unknown — the probe could not decide (HEAD blocked on a roadblock host, no Last-Modified header, unparseable
//             date). Record freshness_unknown and continue on the stored content (do NOT escalate to a fetch).
//
// We do not persist ETags today, so ETag equality can only CONFIRM freshness when a caller supplies a stored
// etag; absent that, the load-bearing signal is Last-Modified vs the snapshot's fetched_at.

/**
 * PURE freshness decision. No I/O.
 * @param {{ fetchedAt?: string|null, storedEtag?: string|null }} stored  snapshot capture time + optional stored etag
 * @param {{ lastModified?: string|null, etag?: string|null, ok?: boolean }} head  values read from a HEAD response
 * @returns {{ status: 'fresh'|'changed'|'unknown', reason: string }}
 */
export function compareFreshness(stored, head) {
  if (!head || head.ok === false) return { status: "unknown", reason: "HEAD unavailable or non-ok" };

  // ETag confirmation (only when we actually stored one to compare against).
  if (stored?.storedEtag && head.etag) {
    return head.etag === stored.storedEtag
      ? { status: "fresh", reason: "etag matches stored" }
      : { status: "changed", reason: "etag differs from stored" };
  }

  const lm = head.lastModified ? Date.parse(head.lastModified) : NaN;
  const cap = stored?.fetchedAt ? Date.parse(stored.fetchedAt) : NaN;
  if (Number.isNaN(lm)) return { status: "unknown", reason: "no parseable Last-Modified header" };
  if (Number.isNaN(cap)) return { status: "unknown", reason: "no parseable snapshot fetched_at" };

  // A small skew guard: treat last-modified within 1s of capture as unchanged.
  if (lm <= cap + 1000) return { status: "fresh", reason: "Last-Modified at/before snapshot capture" };
  return { status: "changed", reason: "Last-Modified after snapshot capture" };
}

/**
 * HEAD-only freshness probe. Never downloads the body, never spends. On ANY failure (roadblock, timeout,
 * network, non-2xx) it returns status:'unknown' so the caller continues on stored content per spec.
 * @param {string} url
 * @param {{ fetchedAt?: string|null, storedEtag?: string|null }} stored
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [deps]
 * @returns {Promise<{ status: 'fresh'|'changed'|'unknown', reason: string, httpStatus: number|null }>}
 */
export async function probeFreshness(url, stored, deps = {}) {
  const doFetch = deps.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) return { status: "unknown", reason: "no fetch impl available", httpStatus: null };
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 15000) : null;
  try {
    const res = await doFetch(url, { method: "HEAD", redirect: "follow", signal: ctrl?.signal });
    const head = {
      ok: res.ok,
      lastModified: res.headers?.get?.("last-modified") ?? null,
      etag: res.headers?.get?.("etag") ?? null,
    };
    const cmp = compareFreshness(stored, head);
    return { ...cmp, httpStatus: res.status ?? null };
  } catch (e) {
    return { status: "unknown", reason: `HEAD failed: ${(e && /** @type {Error} */ (e).message) || "error"}`, httpStatus: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
