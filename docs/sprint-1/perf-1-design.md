# PERF-1: Cache Headers Design (Narrowed, Implementation-Ready)

**Date:** 2026-05-18 (revised from 2026-05-17 original)
**Status:** Implementation-ready post-narrowing
**Workstream:** Parallel to Sprint 1 chrome remediation, no phase dependency
**Operator decisions Q1-Q6:** Resolved (see § Operator Decisions Resolved below)

## Revision Note

The original design proposed both browser-cache and edge-cache layers. The edge-cache layer's cache-key composition problem (Q2 in the original) had no clean answer in the current architecture and was creating Phase 8 sequencing complexity. This revision narrows PERF-1 to browser-cache only. Edge-cache work is captured as PERF-2 below (deferred, blocked on middleware-driven cache key design).

## What PERF-1 Is (Narrowed)

Single-purpose PR: add browser-cache `Cache-Control` headers to 7 read-heavy routes so navigation-back and tab-revisit hit the browser cache instead of re-running the function. No edge cache. No shared cache. No cache key composition. No mutation invalidation hooks.

Expected wins:

- Navigation-back on `/regulations`, `/market`, `/research`, `/operations`, `/map`: instant from browser cache.
- Cold first-render and post-TTL renders: unchanged, still hits the function.
- Function invocation cost: reduced on warm-session traffic.

What PERF-1 explicitly does NOT do:

- Does not cache for shared or anonymous users (edge cache work, deferred to PERF-2).
- Does not invalidate on mutations (relies on TTL expiry).
- Does not depend on Phase 8 workspace_settings work.
- Does not change the existing `unstable_cache(getAppData)` layer, which already handles per-org server-side caching.

## The 7 Routes

| # | Route | Cache-Control |
|---|---|---|
| 1 | `/regulations` | `private, max-age=300, stale-while-revalidate=60` |
| 2 | `/regulations/<slug>` | `private, max-age=900, stale-while-revalidate=120` |
| 3 | `/market` | `private, max-age=3600, stale-while-revalidate=300` |
| 4 | `/research` | `private, max-age=300, stale-while-revalidate=60` |
| 5 | `/operations` | `private, max-age=300, stale-while-revalidate=60` |
| 6 | `/map` | `private, max-age=900, stale-while-revalidate=120` |
| 7 | `/` (dashboard) | `private, max-age=120, stale-while-revalidate=30` |

OUT of scope:

- `/login` already serves a cached response from Vercel (`X-Vercel-Cache: HIT` per PAGE-LOAD-PERF-AUDIT). No action.
- `/admin` low cache value, triage surfaces need fresh data.
- `/community*` mutate-on-action surfaces. Would need write invalidation that PERF-1 does not provide.
- `/settings` write-heavy by definition.

## Operator Decisions Resolved (2026-05-18)

**Q1, route list:** 7-route list above accepted.

**Q2, cache key strategy:** Browser-cache-only via `Cache-Control: private`. The `private` directive prevents shared-cache (edge/CDN) caching, eliminating the cross-user leak risk that option B (`Vary` on cookie) carried. The browser caches per-session-per-URL natively; no cache-key composition needed. Edge-cache work deferred to PERF-2.

**Q3, sector profile change invalidation:** Accept stale until TTL expires. Operators change sector profiles rarely, almost never within a session. Max staleness is 60-3600s depending on route. Acceptable.

**Q4, write invalidation on intelligence_items:** Accept stale until TTL expires. Caro's Ledge is briefing-driven, not real-time. 5-minute staleness on new items is acceptable for Sprint 1. Revisit only if operator UX feedback indicates otherwise.

**Q5, anonymous handling:** No change. Redirect logic in `proxy.ts` is already fast at under 50ms.

**Q6, Phase 8 sequencing:** Moot. Browser cache headers do not depend on cache key composition. Phase 8's workspace_settings changes do not affect PERF-1 behavior. Ship now, independent of Phase 8.

## Implementation Sketch

Two approaches; agent picks based on Next.js App Router patterns already in the repo.

**Approach A (recommended), `next.config.ts` `headers()` block:**

```ts
async headers() {
  return [
    { source: '/regulations', headers: [{ key: 'Cache-Control', value: 'private, max-age=300, stale-while-revalidate=60' }] },
    { source: '/regulations/:slug', headers: [{ key: 'Cache-Control', value: 'private, max-age=900, stale-while-revalidate=120' }] },
    { source: '/market', headers: [{ key: 'Cache-Control', value: 'private, max-age=3600, stale-while-revalidate=300' }] },
    { source: '/research', headers: [{ key: 'Cache-Control', value: 'private, max-age=300, stale-while-revalidate=60' }] },
    { source: '/operations', headers: [{ key: 'Cache-Control', value: 'private, max-age=300, stale-while-revalidate=60' }] },
    { source: '/map', headers: [{ key: 'Cache-Control', value: 'private, max-age=900, stale-while-revalidate=120' }] },
    { source: '/', headers: [{ key: 'Cache-Control', value: 'private, max-age=120, stale-while-revalidate=30' }] },
  ];
}
```

Pro: single file. Easy to review, easy to revert. Con: does not compose with route-segment-config patterns Next.js prefers for App Router.

**Approach B, per-route response-header helper:**

Each route file calls a small helper that sets `response.headers.set('Cache-Control', '...')` on the rendered response. More verbose; aligns with App Router idioms. Pick this only if Approach A creates friction with the existing codebase pattern.

**Recommendation:** Approach A unless the agent surfaces a specific incompatibility with the App Router setup.

## Test Plan

1. Deploy to a preview environment.
2. Hit each of the 7 routes with `curl -I` and verify `Cache-Control` header matches the spec above.
3. Hit each route twice in a browser logged in to a real org. Second hit should serve from `disk cache` per DevTools Network tab.
4. Wait `max-age` seconds, hit again. Should re-fetch (cache expired).
5. Verify `/login`, `/admin`, `/community/*`, `/settings` do NOT carry the new headers.

Estimated total time: 0.5 day for code + test.

## Cost Frame

- **One-time agent work:** Low, approximately $30. Config edit plus curl-based test script.
- **Ongoing runtime:** Net savings on function invocations for warm-session traffic on the 7 routes.
- **Ongoing infrastructure:** Zero. Browser cache is free.
- **Inheritance:** High. Pattern reusable for any future read-heavy route.
- **Value frame:** Conversion-protecting (faster navigation-back) AND cost-saving (fewer function invocations).
- **Manual gate:** N/A, caching is opt-in per route via the config block.

## PERF-2, Deferred

Edge-cache work for shared-cache acceleration. Captured here so the architectural thinking is not lost.

Requires:

1. Middleware that sets an `x-org-context` header derived from session. This is the cache key dimension.
2. `Cache-Control: public, s-maxage=N` on routes where appropriate.
3. `Vary: x-org-context` on those routes.
4. Mutation-driven `revalidatePath()` hooks for routes where TTL expiry alone is insufficient.

Blocked on:

- Middleware design for `x-org-context` derivation, including handling of session changes and org switches.
- Decision on which routes are safe for shared cache (most likely a subset of the PERF-1 7).
- Phase 8 workspace_settings shape, since `x-org-context` should encode the org_id + sector_profile_hash that Phase 8 finalizes.

Scoped as a future PR, not Sprint 1. Reasonable target: post-Phase-8, separate sprint.

## What This Doc Does NOT Do

- Does not edit any code. Implementation begins after this design is committed and dispatched.
- Does not change the existing `unstable_cache(getAppData)` server-side caching layer.
- Does not commit to fixed TTLs in production; the values above are starting points based on observed payload-stability windows in PERF-WAVE-2 and can be tuned during rollout.

## Next Steps

1. Agent implements PERF-1 per Approach A.
2. Single PR titled `perf-1/cache-headers-browser-cache-only`.
3. Test plan above runs in preview.
4. Merge.
5. PERF-2 design starts after Phase 8 ships, blocked on middleware design.
