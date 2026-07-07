# Page-Load Performance Audit

Generated: 2026-05-05 (post-W5, Block C uncommitted in working tree)
Scope: static analysis only (no dev-server, build, or bundle analyzer)

---

## Executive Summary

The platform's slowness has one dominant cause and several amplifiers.

**Slowest pages (one-line diagnoses):**

1. `/` (Dashboard), `/regulations`, `/operations`, `/market`, `/map`, `/settings` — all share `getAppData()` which makes **9–11 sequential-ish Supabase round-trips** per render (no SWR/cache, ~500 sources × 188 items × ~24 staged × ~paginated synopses), and `revalidate = 60` is silently disabled because the function reads cookies.
2. `/regulations/[slug]` — calls `fetchIntelligenceItem()` (5 queries) **AND** `getAppData()` again (the full 9–11 queries) just to build a name lookup map. ~15 queries per detail page.
3. `/community` and `/community/browse` — issue **8 region-count queries in parallel** (one per region) on every render, plus 5 other reads. `force-dynamic` means none of this is ever cached.
4. `/admin` — server fetches sources + provisional + conflicts (3 reads), then the client component fires **another 3 reads** (`organizations`, `org_memberships`, `staged_updates`) on mount inside `useEffect` — sequential after server hydration.
5. `/research` — single 500-row select with embedded source join, **plus a defensive retry path** (PR #19) that fires a second select if the first fails. The retry is dead weight after migration 026 was applied.

**Top 5 fixes ranked by (impact × ease):**

1. **Remove the redundant `intelligence_items` id-map fetch in `fetchDashboardData`** (`fsi-app/src/lib/supabase-server.ts:550-556`). The exact same UUID/legacy_id pairs were already returned by `get_workspace_intelligence` 80 lines earlier. Drop one full-table read on every dashboard hit. (Impact: High, Effort: Low — ~5 min.)
2. **Stop calling `getAppData()` from `/regulations/[slug]`** (`fsi-app/src/app/regulations/[slug]/page.tsx:48`). Replace with a targeted `select(id, legacy_id, title, priority).in('id', xrefIds + refByIds + supersession ids)`. Cuts ~9–10 queries per detail page. (Impact: High, Effort: Low — ~10 min.)
3. **Collapse the 8-region count loop to one grouped query** (`/community/page.tsx:168-177`, `/community/[slug]/page.tsx:185-194`, `/community/browse/page.tsx:228-238`). One `select('region', { count: 'exact', head: true })` group-by, or a single SQL RPC. Today: 8 round-trips × 3 routes. (Impact: High, Effort: Low — ~15 min, ship as RPC for /community/[slug] which also needs it.)
4. **Drop the `revalidate = 60` lie or convert pages to a 60s cache.** Today every page using `getAppData()` is forced dynamic by the cookies read in `resolveOrgIdFromCookies`, so the ISR hint is misleading. Either (a) split anonymous vs. authenticated rendering and let anonymous pages cache the seed view, or (b) move the per-org overrides client-side with a `/api/me/overrides` JSON endpoint and let the heavy data path cache. (Impact: High, Effort: Med — 30–60 min.)
5. **Remove the defensive retry in `/research` page** (`fsi-app/src/app/research/page.tsx:62-86`). Migration 026 (pipeline_stage) is applied per the migrations folder. The retry adds zero benefit on the happy path but the embedded `source:sources(name, url)` join on 500 rows is genuinely expensive — page through `.range(0, 99)` to start. (Impact: Med, Effort: Low — ~10 min.)

---

## Per-Page Findings

### `/` Dashboard — `fsi-app/src/app/page.tsx`

- **Server fetches:** `getAppData()` runs `resolveOrgIdFromCookies()` (1 query: `org_memberships`) → `Promise.all([fetchDashboardData, fetchSourceData])`.
  - `fetchDashboardData` (org-scoped path): `Promise.all` of 5 (workspace RPC + changelog + disputes + xrefs + supersessions) **then sequentially** `Promise.all` of 4 more (synopses paginated, changes, sector_contexts, overrides) **then** a separate `intelligence_items` id-map fetch. **Totals: 1 + 5 + 4 + 1 = 11 queries on the dashboard data path.**
  - `fetchSourceData`: `Promise.all` of 3 (sources, provisional_sources, source_conflicts).
  - **Grand total: 1 + 11 + 3 = ~15 Supabase round-trips per dashboard load.**
- **Joins (>2 tables in one query):** The workspace RPC (`get_workspace_intelligence`) is a 2-table LEFT JOIN — fine. `item_changelog` embeds `intelligence_items!inner(id, legacy_id)` — 2 tables, fine. `item_cross_references` embeds source + target intelligence_items via aliased FKs — 3 tables joined, but small per-row payload. Acceptable.
- **Pagination:**
  - `intelligence_summaries` is paginated explicitly (`fetchAllSynopses`, batchSize=1000). After W3 (~500 sources × N sectors per item × 188 items) this could already be multi-thousand rows.
  - **Unbounded:** `item_changelog` (line 55, no `.limit()`), `item_disputes` (line 80–84), `item_cross_references` (line 109–111), `item_supersessions` (line 122–127), `intelligence_changes` (line 528-531), `sector_contexts` (line 532–534), `workspace_item_overrides` (line 535-538), and the redundant `intelligence_items` id-map (line 550-553). `sources` (line 207-217). Every one of these grows monotonically.
  - `revalidate = 60` is set, **but ineffective** — `getAppData()` reads cookies, so Next forces dynamic rendering and ignores the ISR hint.
- **Client-side:** `<HomeSurface>` (197 LOC) hydrates the resource store inside one `useEffect` keyed on `[initialResources, initialArchived]`. Fine. `urgencyScore` is computed for every resource on every change — acceptable for ~200 items but worth memoizing if the list grows.
- **Recommendations:**
  - [ ] Drop the redundant `intelligence_items` id-map fetch (`supabase-server.ts:550-556`) — UUID/legacy_id pairs already in the RPC payload — impact High, effort Low.
  - [ ] Add `.order(...).limit(50)` on `intelligence_changes` (we only show recent), and `.limit(50)` on `item_changelog` (only recent diffs render in WhatChanged) — impact Med, effort Low.
  - [ ] Either drop `revalidate = 60` or factor anon-vs-authed rendering so the heavy seed-shaped data path can ISR — impact High, effort Med.
  - [ ] Bound `intelligence_summaries` to active sectors only (we filter client-side anyway) — impact Med, effort Low.

### `/research` — `fsi-app/src/app/research/page.tsx`

- **Server fetches:** 1 happy-path query (`intelligence_items` + embedded `sources(name, url)`, `.limit(500)`). Plus 1 retry query if the embedded source join fails (no longer needed post-026).
- **Joins:** `intelligence_items` → `sources` embedded — 2 tables, OK shape. But on 500 rows this is the biggest single read in the codebase by row count.
- **Pagination:** Hard cap `.limit(500)`. Today's intel_items count (~188) is below cap so it's fine. Once we cross 500 the page silently truncates.
- **Defensive retry:** `try full select → on error, try minimal select` (PR #19). Migration 026 is in the migrations folder so the happy path always succeeds; the retry is dead code today and adds a code-path the LLM had to reason about. Impact is small, but it's noise.
- **Client-side:** `<ResearchView>` is 868 LOC of pure client filtering. No client-side fetches. No store hydration. Fine.
- **Recommendations:**
  - [ ] Lower the initial `.limit(500)` to `.limit(100)` and add an explicit "load more" — impact Med, effort Low.
  - [ ] Remove the defensive retry path now that 026 is live, OR move it behind a feature flag — impact Low, effort Low.
  - [ ] Code-split `ResearchView.tsx` (868 LOC, 1 default export, all client) — impact Med, effort Med.

### `/regulations` — `fsi-app/src/app/regulations/page.tsx`

- **Server fetches:** Same as `/`. `getAppData()` runs the full 15-query data path. Identical work, identical cost.
- **Joins / pagination / client-side:** Inherits from `getAppData`. The client component (`RegulationsSurface.tsx`, 677 LOC) only re-derives priority/topic/region groupings client-side, no fetches.
- **Recommendations:**
  - [ ] All `getAppData` recommendations apply.
  - [ ] `RegulationsSurface` doesn't use `archived`, `changelog`, `disputes`, `supersessions`, `synopses`, `intelligenceChanges`, `sectorDisplayNames` — opportunity to fetch only `resources` + `overrides` for this route. Impact: cuts ~6 queries on this page. Effort: Low–Med (factor a smaller fetcher in `lib/data.ts`).

### `/regulations/[slug]` — `fsi-app/src/app/regulations/[slug]/page.tsx`

- **Server fetches:** `fetchIntelligenceItem(id)` runs **5 sequential** queries (item, timelines, changelog, disputes, xref out, xref in, supersessions = actually 7 — see `supabase-server.ts:676-789`). Then `getAppData()` is called **again** — the entire 15-query dashboard path — only to build `resourceLookup: { id, title, priority }` for the related-items list. **~22 queries per detail page render.**
- **Joins:** `item_supersessions` query embeds two `intelligence_items` aliases per side — 3-table join, OK shape. Cross-reference reads use aliased FKs (1 table joined per side).
- **Pagination:** `fetchIntelligenceItem` reads are scoped by `item_id`, so they're naturally small. The `getAppData` portion is the heavyweight here.
- **Client-side:** `RegulationDetailSurface` is `"use client"` but no client-side fetches.
- **Recommendations:**
  - [ ] Replace `getAppData()` call at `regulations/[slug]/page.tsx:48` with a targeted lookup: `supabase.from('intelligence_items').select('id, legacy_id, title, priority').in('id', [...xrefUuids, ...refByUuids, ...supersessionUuids])`. Impact: drops ~10 queries per detail-page hit — High, effort Low.
  - [ ] Inside `fetchIntelligenceItem`, the two cross-reference queries (lines 768-774) can be one query with `.or('source_item_id.eq.X,target_item_id.eq.X')` — impact Low, effort Low.

### `/operations` — `fsi-app/src/app/operations/page.tsx`

- **Server fetches:** `getAppData()` (15 queries). The page only consumes `data.resources`. All other returned data is dead weight.
- **Client-side:** `OperationsPage.tsx` (683 LOC) is pure client filtering/grouping, no fetches.
- **Recommendations:**
  - [ ] Same as `/regulations` index — make a slim fetcher that returns just `resources` + `overrides`. Impact: drops 8–10 queries on this page. Effort Low–Med.
  - [ ] `OperationsPage.tsx` is 683 LOC — code-split if the filter/grouping work shows up in profiles.

### `/market` — `fsi-app/src/app/market/page.tsx`

- **Server fetches:** `getAppData()` (15 queries). Page consumes only `data.resources`. Same waste as `/operations`.
- **Client-side:** `MarketPage.tsx` (716 LOC) is pure client.
- **Recommendations:**
  - [ ] Same slim-fetcher fix.

### `/map` — `fsi-app/src/app/map/page.tsx`

- **Server fetches:** `getAppData()` (15 queries). Page consumes `resources, changelog, disputes, xrefPairs, supersessions`. So ~5 of the 15 queries are actually needed; ~10 are wasted (sources, provisional, conflicts, synopses, intelligenceChanges, sectorDisplayNames, overrides where the user isn't authed, the redundant id-map).
- **Joins / pagination:** Same as `/`.
- **Client-side:** `<MapView>` is `dynamic({ ssr: false })` — good. But Leaflet (`leaflet`, `react-leaflet`, `react-leaflet-cluster`) will still be loaded on every map page hit. Leaflet's CSS + JS is ~150KB gzipped; cluster plugin adds another ~40KB.
- **Recommendations:**
  - [ ] Slim the data fetch — drop sources/provisional/conflicts (admin only), drop synopses/changes/sectors. Impact: drops ~8 queries on this page. Effort Low.
  - [ ] No realtime subscription on this page — good (verified).

### `/admin` — `fsi-app/src/app/admin/page.tsx`

- **Server fetches:** `supabase.auth.getUser()` (1 query → middleware-style auth check), `org_memberships` lookup (role gate), then `fetchSourceData(true)` (3 queries: sources unfiltered, provisional, conflicts).
- **Client fetches on mount:** `AdminDashboard.loadData` runs `Promise.all([organizations, org_memberships, staged_updates])` → 3 more queries on mount inside `useEffect`. Sequential after server-rendered HTML arrives.
- **Joins / pagination:**
  - `organizations.select("*")` — unbounded. Currently small (handful of rows) but wide select.
  - `org_memberships.select("*")` — unbounded. Single tenant today, so small.
  - `staged_updates.select("*")` filtered by `status=pending`.
  - Server-side `sources.select("*")` is unbounded — ~500 rows after W3.
- **Client-side:** `AdminDashboard.tsx` (740 LOC) and `SourceHealthDashboard.tsx` (541 LOC) are big — `SourceHealthDashboard` does pure client filtering of ~500 sources, fine. Both use `useMemo` defensively.
- **B2ProgressBanner:** Polls `/api/...` every 30s while admin sources tab is mounted (`B2ProgressBanner.tsx:68`). Acceptable while user is in the source registry; not page-load critical.
- **Recommendations:**
  - [ ] Move admin client-side fetches (`organizations`, `org_memberships`, `staged_updates`) into the server component so initial paint has the data. Impact High, effort Low (one `Promise.all`).
  - [ ] `sources.select("*")` returns ~50 columns × 500 rows. Slim to columns the dashboard renders (~15 of them). Impact Med, effort Low.
  - [ ] `organizations.select("*")` and `org_memberships.select("*")` should specify columns, not `*`. Impact Low, effort Low.

### `/community` — `fsi-app/src/app/community/page.tsx`

- **Server fetches:** `auth.getUser()` (1), then **5 reads in series**:
  1. `community_group_members` w/ embedded `community_groups(...)`
  2. `community_group_invitations` w/ embedded `community_groups(...)`
  3. `community_topics` w/ embedded `community_topic_groups(group_id)`
  4. **8 parallel** `community_groups` head-counts (one per region) — `Promise.all` of 8
  5. `user_profiles`
  6. `org_memberships` w/ embedded `organizations(name)`
- **Total: 1 + 3 sequential + 8 parallel + 2 sequential = 14 queries.** All on a `force-dynamic` route, so no caching.
- **Joins (>2 tables in one query):** `community_group_invitations` → `community_groups` (2 tables, OK). `community_topics` → `community_topic_groups` (2 tables, OK). `org_memberships` → `organizations` — OK.
- **Pagination:** `community_group_members` joined with embed — RLS limits to caller's own rows, so naturally small (a user has tens of memberships, not thousands). Acceptable.
- **The 8-region count loop is the headline cost.** Each is a HEAD count query with `count: 'exact'` — Postgres has to plan and execute each. With round-trip latency on Vercel ↔ Supabase typically 30–80ms, this alone is ~250–600ms wall-clock if the planner serializes them.
- **Client-side:** `CommunityShell` mounts `useEffect` to set `body[data-side="community"]` and inject a `<style>` block — cheap. `CommunityMasthead` adds a global `keydown` listener. No realtime subscriptions yet.
- **Recommendations:**
  - [ ] Replace the 8-region count loop with **one** grouped query — `select('region', { count: 'exact' })` doesn't quite work in PostgREST, so write a tiny RPC `community_groups_region_counts()` that returns `{region, count}[]`. Impact: drops 7 queries → 1. Effort Low (one migration + one client edit). Applies to all 3 community pages.
  - [ ] The `org_memberships → organizations(name)` lookup duplicates work the global `AuthProvider` already does on every page — consider stashing in the workspace store and reading from there. Impact Low, effort Med.

### `/community/[slug]` — `fsi-app/src/app/community/[slug]/page.tsx`

- **Server fetches:** `auth.getUser()` (1), then **9 reads in series + 8 region counts**:
  1. `community_groups` by slug (1)
  2. caller's `community_group_members` for this group (1)
  3. caller's all memberships embedded with groups (1) — same as `/community`
  4. caller's invitations embedded (1)
  5. caller's topics embedded (1)
  6. **8** region counts
  7. `user_profiles` (1)
  8. `org_memberships → organizations(name)` (1)
- **Total: ~15 queries.** Worse than `/community` because we add the slug + own-membership lookups.
- **Recommendations:**
  - [ ] Same shell-context fixes as `/community` (region-count RPC, etc).
  - [ ] Combine "fetch group by slug" + "fetch my membership for that group" into one query: `select(*, community_group_members!inner(role, starred, muted)).eq('slug', slug).eq('community_group_members.user_id', user.id)`. Impact Low, effort Low.

### `/community/browse` — `fsi-app/src/app/community/browse/page.tsx`

- **Server fetches:** `auth.getUser()` (1), then:
  1. `community_groups` filtered to public + region (1)
  2. `community_group_members.eq(user_id).in(group_id, [...])` (1) — bulk, NOT N+1 — well done
  3. `community_group_invitations.eq(invitee).in(group_id, [...])` (1) — bulk
  4. caller's all memberships embedded (1)
  5. caller's invitations embedded (1)
  6. caller's topics embedded (1)
  7. **8** region counts
  8. `user_profiles` (1)
  9. `org_memberships → organizations(name)` (1)
- **Total: ~16 queries.**
- **Pagination:** `community_groups.eq('region', X)` has no `.limit()`. Could matter in EU/Global at scale — today not a problem.
- **Recommendations:**
  - [ ] Same region-count RPC.
  - [ ] Add `.limit(50)` on the public-groups query and a "load more" UI. Impact Low today, High at scale.

---

## Cross-cutting Issues

### Middleware / proxy

- `fsi-app/src/proxy.ts` runs Supabase `auth.getUser()` on every page load (line 33). That's **one Supabase round-trip per page request**, on top of whatever the page itself does. Not avoidable for protected routes, but worth knowing — it's why even a "static" page like `/login` redirect path costs 1 round-trip.
- The matcher excludes `_next`, `api`, static assets — correct.
- **Recommendation:** None. This is necessary for SSR auth. Just be aware it's the floor cost.

### `revalidate = 60` is broken on every page that uses it

Every page using `getAppData()` declares `export const revalidate = 60`. But `getAppData()` calls `resolveOrgIdFromCookies()` which calls `cookies()` from `next/headers`. Reading cookies opts the page into dynamic rendering and **disables ISR**. So `revalidate = 60` is silently ignored.

This means the 15-query data path runs **on every single request**. There is no caching layer between the user and Supabase.

**Recommendations:**
- [ ] Either (a) move org-resolution out of the data path and into a client-side fetch, letting anonymous server-side rendering be the cacheable view, or (b) keep the cookies read but gate the heavy data path behind an explicit `unstable_cache` keyed by `orgId`. Impact: 60s of cache hits would eliminate the 15-query cost for any page after the first hit per minute. **Highest leverage fix in this audit.**

### Bundle weight

- **lucide-react** is imported in **73 files**. This is fine if Next 16 + Turbopack tree-shakes named imports correctly (it does, per Next docs), but worth verifying with `next build`'s tree output. Each call site imports specific icons (`{ Bell, Search, ... }`) — the import shape is correct, no `import * as` patterns found.
- **gsap** + **@gsap/react** — heavy (~70KB gzipped). Search confirms it's only imported in places that use it for card-expansion animations.
- **leaflet** + **react-leaflet** + **react-leaflet-cluster** — only imported in `MapView.tsx`, dynamically. Good.
- **react-markdown** + **remark-gfm** — used for the briefing render. Heavy (~30KB) — fine if only loaded on the briefing surface, worth verifying.
- **@anthropic-ai/sdk** — import location matters. **Critical:** if this lands in any `"use client"` file or any server file imported by a client component, it will be in the client bundle. Worth a one-time `grep` to confirm.

### Database indexes

The migrations folder shows comprehensive indexing on `intelligence_items` (priority, jurisdictions GIN, transport_modes GIN, tags GIN, status, severity, source_id, archived) and on the embedded-FK relationships. **No obvious missing indexes** for the read patterns I observed.

One potential concern:
- `intelligence_changes.detected_at DESC` is indexed — good.
- `intelligence_summaries(item_id, sector)` — indexes exist per migration 009. The `range(from, from+1000)` paginated read is full-table scan-friendly.
- `community_groups(region)` — indexed (migration 028:62). The 8-query region-count loop is fine on the index but pays round-trip overhead.

### Polling / global components

- `NotificationsBell` polls every **60s** when document is visible. Currently NOT mounted in any `AppShell` — it lives in `community/` only. Once it gets wired into `AppShell` (from the C7 spec), every signed-in user will fire `/api/community/notifications?unread_only=true&limit=1` every 60s. That's fine, but it WILL be on every page in the future. Watch the API endpoint cost.
- `B2ProgressBanner` polls every **30s** but only when `/admin` → Source registry tab is mounted. Bounded.
- No `setInterval` patterns elsewhere in pages. No realtime subscriptions imported (verified — `useCommunityPostsRealtime` and `useCommunityNotificationsRealtime` exist but are unused).

### AppShell / global components

- `AppShell` is small — renders `<Sidebar>` + `<main>` + footer. No data fetching.
- `Sidebar` reads `useWorkspaceStore` for role; no fetches.
- `AuthProvider` runs `auth.getUser()` + `org_memberships` lookup **on the client** at mount (lines 28-46). This duplicates the work `proxy.ts` already does on the server, AND duplicates the `org_memberships` lookup that `getAppData()` does on the server. **3× the same query** on every page load.
- **Recommendation:** Have the server pass user + role into `AuthProvider` via initial props instead of re-fetching client-side. Impact: 1 fewer client query on every page; eliminates a layout-shift when role-gated UI appears. Effort Med.

---

## Prioritized Fix List

1. **Drop the redundant `intelligence_items` id-map fetch** — `fsi-app/src/lib/supabase-server.ts:550-556` — impact High — effort Low — ~5 min. The same UUID/legacy_id pairs were already returned by the workspace RPC at line 317; build the map there instead.
2. **Stop calling `getAppData()` from the regulation detail page** — `fsi-app/src/app/regulations/[slug]/page.tsx:48` — impact High — effort Low — ~10 min. Replace with `select('id, legacy_id, title, priority').in('id', uuidsFromXrefAndSupersessions)`.
3. **Replace 8-query region-count loop with one RPC** — `fsi-app/src/app/community/page.tsx:168-177`, `/community/[slug]/page.tsx:185-194`, `/community/browse/page.tsx:228-238` — impact High — effort Low — ~15 min including a tiny migration. Same fix lands in 3 routes.
4. **Make `revalidate` actually work, or remove the lie** — `fsi-app/src/lib/data.ts:19` — impact High — effort Med — ~30–60 min. Either gate cookies reads behind a more granular cache key (preferred), or split anon-vs-authed rendering paths so anon can ISR.
5. **Slim `getAppData` callers that don't need the full payload** — `/operations`, `/market`, `/regulations` index — impact High — effort Med — ~30 min. Each only uses `resources` (+ `overrides` on /regulations); factor a `getResourcesOnly()` that runs the workspace RPC only.
6. **Move `/admin` client-side mount fetches to server** — `fsi-app/src/components/admin/AdminDashboard.tsx:65-82` — impact Med — effort Low — ~10 min. The 3 queries (`organizations`, `org_memberships`, `staged_updates`) belong in `/admin/page.tsx` so initial paint isn't blank.
7. **Bound unbounded reads with `.limit(N)`** — multiple sites — impact Med — effort Low — ~15 min. `intelligence_changes` (no limit), `item_changelog` (no limit), `sources` (no limit, ~500 rows × ~50 columns), `community_groups` browse (no limit). Each gets `.order(...).limit(N)`.
8. **Eliminate `AuthProvider` client-side `org_memberships` fetch** — `fsi-app/src/components/auth/AuthProvider.tsx:28-46` — impact Med — effort Med — ~30 min. Pass server-resolved user + role as props to a server-rendered version, or hydrate from cookie-readable session JSON.
9. **Remove dead retry path in `/research`** — `fsi-app/src/app/research/page.tsx:62-86` — impact Low — effort Low — ~5 min. Migration 026 is applied; the retry is noise.
10. **Lower research initial-load to `.limit(100)` + load more** — `fsi-app/src/app/research/page.tsx:41,68` — impact Med — effort Low — ~10 min. 500-row select with embedded `sources(...)` join is the largest single read in the codebase.
11. **Slim `sources.select("*")`** — `fsi-app/src/lib/supabase-server.ts:209-217` — impact Med — effort Low — ~10 min. Source rows have ~50 columns; the registry UI uses ~15 of them.
12. **Consolidate the two cross-reference reads in `fetchIntelligenceItem`** — `supabase-server.ts:766-774` — impact Low — effort Low — ~5 min. One `.or('source_item_id.eq.X,target_item_id.eq.X')` instead of two queries.
13. **Code-split heavy client components** — `ResearchView.tsx` (868 LOC), `OperationsPage.tsx` (683 LOC), `MarketPage.tsx` (716 LOC), `RegulationsSurface.tsx` (677 LOC) — impact Med — effort Med — ~30 min each. These render on first paint of routes used in mobile; lazy-loading the filter/sort logic would speed Time-to-Interactive.
14. **Confirm `@anthropic-ai/sdk` is server-only** — manual grep — impact High if it's client-bundled, else Low — effort Low — ~5 min. If a client component imports any module that pulls the SDK, the whole SDK lands in the client bundle.
15. **Index audit for community_topics → community_topic_groups** — review migration 031 — impact Low — effort Low — verify `idx_community_topic_groups_topic_id` exists. The embedded-array fetch on `/community*` pages joins these tables for every signed-in user.

---

## Open Questions

- Is `@anthropic-ai/sdk` actually in the client bundle? (Static analysis can't tell — needs `next build` output.)
- What's the actual row count of `intelligence_summaries` after W3? The pagination loop is sized for ≥1000 — if real-world is 200–300 it's fine; if it's 5000+ this becomes a measurable cost on every page using `getAppData`.
- Does the production Supabase project have connection pooling (PgBouncer transaction mode) tuned for the 15-query bursts? Without it, each page load opens 15 Postgres connections briefly.
- Are the `revalidate = 60` declarations intentional aspiration (waiting for the cookies-fix) or oversight? If aspiration, that's the single highest-leverage perf fix.
- The community pages are `force-dynamic`. Was that intentional (RLS-sensitive) or copy-paste? If RLS is the reason, the region-count RPC fix still applies.
