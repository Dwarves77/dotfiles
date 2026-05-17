# PERF-1: Cache Headers Design (Queued, Not Yet Implementing)

**Date:** 2026-05-17
**Status:** Design queued per operator direction "queue lane 3 design"
**Workstream:** Parallel to Sprint 1 chrome remediation (not blocked by phases)
**Phase 8 dependency:** Cache key must include `org_id` once `workspace_settings` make payloads org-specific. Implementation should land AFTER Phase 8 OR include the org_id key from day one to avoid a stale-cache cutover.

This doc is the implementation-ready design for PERF-1. It surfaces the decisions the operator needs to make before code lands; once those are answered, the implementation is small (header edits + cache key config). No code change here, intentionally.

## What PERF-1 is

Per the Phase 2 verification gate ("PERF-1 PR separately, cache key must include org_id post-Phase 8"), PERF-1 is the cache-header layer for hot routes. Goal: cut TTFB on the routes that serve identical or near-identical payloads to repeated requests by letting Vercel's edge cache (or a CDN-shared cache) serve the response without going back to the function.

## Current state (baseline)

From PERF-WAVE-2 perf logging targets, these are the 13 page routes that log a `[perf] <route> data <ms>ms` line per request. Each is a candidate for cache-header treatment:

| Route | Anonymous? | Currently cached? | Workspace-scoped post-Phase 8? |
|---|---|---|---|
| `/` (root dashboard) | redirects to /login | no | yes |
| `/login` | yes | yes (prerendered, `X-Vercel-Cache: HIT` per PAGE-LOAD-PERF-AUDIT) | n/a |
| `/regulations` (index) | no | no | yes (filters by org sector_profile) |
| `/regulations/<slug>` (detail) | no | no | partial (item is global, but related-items list is org-specific) |
| `/market` | no | no | yes |
| `/research` | no | no | yes |
| `/operations` | no | no | yes |
| `/map` | no | no | yes |
| `/admin` | platform-admin only | no | no (platform-wide) |
| `/community` | no | no | partial (groups are member-scoped) |
| `/community/<slug>` | no | no | partial |
| `/community/browse` | no | no | partial |
| `/settings` | no | no | yes |

## The 7 routes proposed for PERF-1 (operator confirmation required)

Recommendation: cache the 7 routes where the payload-per-org-sector tuple is stable for at least a few minutes. The other 6 are either anonymous (handled separately), platform-admin (low cache value), or mutate-on-action surfaces (community).

| # | Route | Cache scope | Cache key | TTL recommendation |
|---|---|---|---|---|
| 1 | `/regulations` | edge (s-maxage) | `(org_id, sector_profile_hash)` | 5min `s-maxage=300, stale-while-revalidate=60` |
| 2 | `/regulations/<slug>` | edge | `(slug, org_id)` | 15min `s-maxage=900, swr=120` |
| 3 | `/market` | edge | `(org_id, sector_profile_hash, week_start)` | 1hr `s-maxage=3600, swr=300` |
| 4 | `/research` | edge | `(org_id, sector_profile_hash, page)` | 5min `s-maxage=300, swr=60` |
| 5 | `/operations` | edge | `(org_id, sector_profile_hash)` | 5min `s-maxage=300, swr=60` |
| 6 | `/map` | edge | `(org_id, sector_profile_hash)` | 15min `s-maxage=900, swr=120` |
| 7 | `/` (post-Phase 8 dashboard) | edge | `(org_id, sector_profile_hash)` | 2min `s-maxage=120, swr=30` |

OUT of PERF-1 scope (handled elsewhere):
- `/login` — already cached (no action needed).
- `/admin` — small audience, low cache value, fresh data preferred for triage surfaces.
- `/community*` — mutate-on-action; would need write-invalidation strategy that does not exist yet.
- `/settings` — write-heavy by definition.

## Open questions (operator decisions blocking implementation)

### Q1: Confirm the 7-route list

Proposed: regulations, regulations/[slug], market, research, operations, map, /. Operator may want a different cut (e.g., include /community/browse since it is mostly read; or exclude /map because the map payload is already small and infrequently fetched).

### Q2: Cache key strategy for org-scoped routes

Three options. The operator picks one:

- **A. Include `org_id` in the URL** (e.g., `/regulations?org=abc`). Cleanest semantics, cache works out of the box. Cost: every internal link must include `?org=`, breaks bookmark stability across org switches.
- **B. Include `org_id` in `Vary` header along with the session cookie.** Cache differentiates per cookie. Cost: cookie values vary, lower cache hit rate; risk of leaking one org's data to another if cookie misconfigured. CDN-unfriendly.
- **C. Use Next.js route segment config `unstable_cache` keyed on `(org_id, sector_profile_hash)` server-side; emit `Cache-Control: private, max-age=60` so browser caches but edge does not.** Per-user cache, no cross-user risk, but the edge gets no benefit, and the server still runs the function on every cold request.

Recommendation: **A** if the operator accepts URL-included org_id; otherwise **C**. Option B's leak risk makes it not viable without extra hardening.

### Q3: Sector profile change invalidation

When an org admin changes `workspace_settings.sector_profile`, the cached pages for that org are stale until TTL expires. Options:

- **A. Accept stale until TTL.** Operator sees old filtering for up to 5 minutes after sector change. Acceptable for a setting that is rarely touched.
- **B. Webhook-on-write invalidation via Vercel API or `revalidatePath()`.** Mutation handler in `/api/workspace/sector-profile` calls `revalidatePath('/regulations'); revalidatePath('/market'); ...` for the affected org. Cleaner UX, more moving parts.
- **C. Include `sector_profile_hash` in cache key** (already in the table above). Each profile permutation gets its own cache entry; old entries expire naturally; new requests after a profile change miss cache once and rebuild. No invalidation needed.

Recommendation: **C**. The cache-key hash makes invalidation a non-issue.

### Q4: Write invalidation on intelligence_items mutations

When new intelligence_items arrive (via ingest, classifier, community-promote), cached `/regulations`, `/market`, `/research`, `/operations` go stale. Options:

- **A. Accept stale until TTL.** Operator sees new items appear within 5min. Acceptable for an asynchronous ingest model.
- **B. Per-org revalidation hook on ingest commit.** Hits Vercel `/api/revalidate` for every org whose sector profile matches the new item. Cost: O(N orgs) revalidation calls per ingest; for 100s of orgs this is real load.
- **C. Per-org revalidation via a queue (e.g., ingest writes to a "pending revalidations" log; a cron flushes every 60s).** Cost: extra moving parts.

Recommendation: **A** for Sprint 1. Revisit if operator feedback says 5-minute staleness on new items is unacceptable.

### Q5: Anonymous / unauthenticated handling

Most routes redirect to `/login` for anonymous users. The redirect itself is fast and uncached. Question: do we want to cache the redirect response itself?

Recommendation: **no, leave as-is.** Redirect logic in proxy.ts already serves <50ms.

### Q6: Phase 8 sequencing

PERF-1 implementation needs to know the cache key format upfront. Two timing options:

- **A. Ship PERF-1 NOW with cache key `(org_id, sector_profile_hash)` assuming Phase 8 lands as planned.** If Phase 8 changes the workspace_settings shape, cache key may need adjustment.
- **B. Wait for Phase 8 merge, then ship PERF-1 with the final cache key.** Safer but blocks PERF-1 on Phase 8.
- **C. Ship PERF-1 NOW with a feature flag.** Default OFF until Phase 8 lands, then flip ON in a single PR.

Recommendation: **B or C**. The cost frame favors C (it ships the infrastructure ahead of time so the Phase 8 cutover is just a flag flip).

## Implementation sketch (post-decisions)

Once Q1-Q6 are answered, implementation is ~3 files:

1. `next.config.ts` — add `headers()` block for the cache headers per route.
2. Per-route `generateMetadata` or a shared `_cache.ts` helper computing the cache key from `(org_id, sector_profile_hash, ...)`.
3. Mutation handlers (Q4 option B/C) — add `revalidatePath()` calls.

Estimated effort: 0.5 day for code + 0.5 day for end-to-end test + production cache hit rate validation.

## Cost frame (per `rule-cost-weighted-recommendations`)

- **One-time agent work:** Low (~$30-80). Config edits + cache key helper + a test script that hits the routes with different `org_id` values and validates cache hits.
- **Ongoing runtime:** Net SAVINGS. Reduces Vercel function invocations on cache hits. Estimated saving depends on cache hit rate; at 50% hit rate on the 7 routes, ~50% reduction in function execution time on those paths.
- **Ongoing infrastructure:** Zero (Vercel edge cache is included in the existing plan).
- **Inheritance:** High. Cache key + header pattern is reusable for every future read-heavy route.
- **Value frame:** Conversion-protecting (faster TTFB on hot paths) AND cost-saving (fewer function invocations).
- **Manual gate:** N/A — caching is opt-in per route via the config block.

## What this doc does NOT do

- Does not edit any code. Implementation begins after Q1-Q6 are answered.
- Does not change the verification approach to existing routes (no caching applied to /admin, /community, /settings; existing fetch / DB query behavior unchanged).
- Does not commit to a particular cache TTL — recommendations are anchored on the observed payload-stability windows in PERF-WAVE-2 but can be tuned during rollout.

## Next steps

Operator answers Q1-Q6. Implementation lands as a single PR in the gating window of the next phase.
