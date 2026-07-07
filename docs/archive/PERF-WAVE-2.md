# Perf Wave 2 — Page-Load Reduction

Date: 2026-05-05
Branch: `phase-c/community-extensions`
Predecessor: `docs/PERF-AUDIT.md` (15 prioritized fixes — wave 1 shipped 4)

## Summary

Wave 2 attacks the dominant cost surfaced by the audit: every page-using `getAppData()` runs ~15 Supabase queries per render with no cache. Wave 2 cuts that to ~3 for pages that consume only resources, and adds server-side timing instrumentation so wave 3 can be data-driven.

## Fixes shipped in this wave

### A — Slim per-page fetchers

`fsi-app/src/lib/data.ts` gains two new exports:

- `getResourcesOnly()` → `{ resources, archived, overrides }`. Backed by `fetchResourcesOnly()` in `lib/supabase-server.ts`. Cost: workspace RPC + timelines + workspace_item_overrides = 3 queries.
- `getMapData()` → `{ resources, archived, changelog, disputes, xrefPairs, supersessions }`. Backed by `fetchMapData()`. Cost: workspace RPC + 4 relationship reads = 5 queries.

Switched to slim variants:
- `/operations` — was 15 queries, now 3.
- `/market` — was 15 queries, now 3.
- `/regulations` (index) — was 15 queries, now 3.
- `/map` — was 15 queries, now 5.

`/` (dashboard), `/regulations/[slug]`, `/research`, `/admin`, `/community*` retained their existing fetcher because they consume the heavier payload or aren't using `getAppData` to begin with.

### B — Admin client-side fetches moved to server

`fsi-app/src/app/admin/page.tsx` now runs `organizations`, `org_memberships`, and `staged_updates` server-side in the same `Promise.all` as `fetchSourceData(true)`. `AdminDashboard.tsx` accepts these as `initialOrgs`, `initialMembers`, and `initialStagedUpdates` props and seeds them into local state at first render. The previous `useEffect → loadData` waterfall (which fired 3 sequential queries after server HTML arrived) is gone; the manual `loadData` callback is retained for the Refresh button + post-mutation refreshes.

Net effect: first paint of `/admin` no longer has a blank Organizations / Staged-updates tab.

### C — Bounded unbounded SELECTs

In `fsi-app/src/lib/supabase-server.ts`:
- `item_changelog` — added `.limit(100)` on top of the existing date sort.
- `item_disputes` — added `.limit(100)` (still scoped to `is_active=true`).
- `intelligence_changes` — added `.limit(100)` on top of `detected_at DESC`.
- `sources` — replaced `select("*")` with an explicit 46-column projection (`SOURCE_COLUMNS`) covering every field `mapSourceRow()` reads. Drops payload size on the admin path (`includeAdminOnly=true`, ~500 rows).

Server-side `staged_updates.select("*")` in `/admin/page.tsx` already has `.limit(100)`. The client-side `loadData` in `AdminDashboard.tsx` mirrors the same limit.

`workspace_item_overrides` is already bounded (`.eq("org_id", orgId)`).

### D — Server-timing instrumentation

Added `console.log("[perf] <route> data <ms>ms")` to every server-component data fetch path. Surfaces in Vercel function logs and `npm run dev` output. Tags:

- `[perf] getAppData <ms>ms` — top-level shared fetcher (lib/data.ts).
- `[perf] getResourcesOnly <ms>ms` — slim variant (lib/data.ts).
- `[perf] getMapData <ms>ms` — map slim variant (lib/data.ts).
- `[perf] / data <ms>ms` — root dashboard.
- `[perf] /regulations data <ms>ms` — regulations index.
- `[perf] /regulations/<slug> data <ms>ms` — regulation detail.
- `[perf] /operations data <ms>ms`
- `[perf] /market data <ms>ms`
- `[perf] /map data <ms>ms`
- `[perf] /research data <ms>ms`
- `[perf] /admin data <ms>ms`
- `[perf] /community data <ms>ms`
- `[perf] /community/<slug> data <ms>ms`
- `[perf] /community/browse data <ms>ms`

Grep tip: `npm run dev | grep "\[perf\]"`.

### E — Removed `revalidate = 60` lies

Removed `export const revalidate = 60` from pages that read cookies (which forces dynamic rendering and silently disables ISR):
- `/` (root dashboard) — `getAppData` reads cookies via `resolveOrgIdFromCookies`.
- `/regulations` (index) — same path.
- `/regulations/[slug]` — keeps consistent posture; `fetchIntelligenceItem` doesn't read cookies but the targeted-lookup query path uses an anon createClient that's still dynamic by virtue of being inside a cookies-aware route tree.
- `/operations`, `/market`, `/map` — slim fetchers still call `resolveOrgIdFromCookies`, dynamic.

Left intact:
- `/research` — does NOT read cookies; the only Supabase read is via `createClient(URL, ANON)` with no auth context. ISR can actually cache here.

## Files modified (8) + files created (1)

Modified:
1. `fsi-app/src/lib/data.ts`
2. `fsi-app/src/lib/supabase-server.ts`
3. `fsi-app/src/app/page.tsx`
4. `fsi-app/src/app/operations/page.tsx`
5. `fsi-app/src/app/market/page.tsx`
6. `fsi-app/src/app/map/page.tsx`
7. `fsi-app/src/app/regulations/page.tsx`
8. `fsi-app/src/app/regulations/[slug]/page.tsx`
9. `fsi-app/src/app/research/page.tsx`
10. `fsi-app/src/app/admin/page.tsx`
11. `fsi-app/src/app/community/page.tsx`
12. `fsi-app/src/app/community/[slug]/page.tsx`
13. `fsi-app/src/app/community/browse/page.tsx`
14. `fsi-app/src/components/admin/AdminDashboard.tsx`

Created:
1. `docs/PERF-WAVE-2.md` (this file)

## Phase D — deferred work

The audit's highest-ranked open item is "make `revalidate` actually work, or remove the lie." Wave 2 took the honest route (removed the lie). The cache-friendly refactor remains:

### D1 — Anonymous vs. authenticated rendering split

The cookies read in `resolveOrgIdFromCookies()` is what disables ISR for every page using `getAppData()`. Two paths to fix:

**Option A — Two trees:** Hoist anon rendering into static pages (`/` could be a server component that takes no auth) and add an `<AuthOverlay>` client component that fetches `/api/me/overrides` and applies workspace overrides on the client. Trade-off: a brief render-flash when the overrides load (mitigatable with a skeleton on the priority badges that resource cards depend on).

**Option B — `unstable_cache` keyed by orgId:** Keep the cookies read but isolate it. Build a cached fetcher that takes `orgId` as input and is `unstable_cache`'d with that as the cache key. Per-org cache hits eliminate the 15-query cost for pages within the 60s window. Trade-off: cache-invalidation discipline becomes a project-wide concern.

Either path is 30-60 min focused work; gating wave 2 on it is wrong because (a) the slim fetchers are already a 4-5x query reduction, and (b) the timing instrumentation will tell us which routes still feel slow after wave 2 ships.

### D2 — Eliminate AuthProvider client-side org_memberships fetch

Per audit fix #8: `AuthProvider` re-fetches `org_memberships` on the client even though `proxy.ts` already has the user and `getAppData` already does the same lookup. Pass server-resolved user + role as props. Saves 1 client query per page; eliminates the role-gated UI flash.

### D3 — Code-split heavy client surfaces

Per audit fix #13: `ResearchView.tsx` (868 LOC), `OperationsPage.tsx` (683 LOC), `MarketPage.tsx` (716 LOC), `RegulationsSurface.tsx` (677 LOC) all default-export single client components. Lazy-loading the filter/sort logic with `React.lazy` would speed Time-to-Interactive on mobile.

### D4 — Verify @anthropic-ai/sdk is server-only

Per audit fix #14: a one-time grep + `next build` output check. If the SDK leaked into the client bundle it's a meaningful bundle-size hit.

### D5 — Fan-out: dedup the two cross-reference reads in fetchIntelligenceItem

Per audit fix #12: `xrefOut` + `xrefIn` could be one `.or('source_item_id.eq.X,target_item_id.eq.X')` query. ~5 min change once we have the bandwidth.

## How to validate wave 2 perf gain

1. Run `npm run dev` from `fsi-app/`.
2. Hit `/operations`, `/market`, `/map`, `/regulations`, `/`, `/admin`, `/community`, `/community/<slug>`, `/community/browse`, `/research`.
3. Watch the dev console — every page logs its `[perf] <route> data <ms>ms`.
4. Wave 1 baseline: ~3-4s per page-load including data fetch. Wave 2 expectation: `/operations`, `/market`, `/regulations` should drop to under 1s each on a warm Supabase connection.

If a route still logs >2s after wave 2, Phase D1 (cache the workspace RPC payload) is the next lever.
