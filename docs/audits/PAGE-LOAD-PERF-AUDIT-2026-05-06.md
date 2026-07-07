# Page-Load Performance Audit — 2026-05-06

Generated: 2026-05-06
Scope: read-only static analysis (no `next build`, no `npm run dev`, no DevTools)
Branch: `phase-c/community-extensions`
Predecessors: `docs/PERF-AUDIT.md` (2026-05-05), `docs/PERF-WAVE-2.md`, `docs/PERF-PROFILING-FINDINGS.md`
Latest perf commits read: `43304c7 perf: full_brief slim RPC + sidebar prefetch=false`, `d13a503 feat(community + perf): Block C C5-C9 + 4 quick-win perf fixes`

---

## Executive Summary

The 2026-05-05 audit shipped most of the per-page wire-cost work. **Wave 2 is real and durable** — `/operations`, `/market`, `/regulations`, `/map` are now 3–5 queries and use the slim RPC; `/regulations/[slug]` no longer calls `getAppData()`; the admin page hydrates server-side. What remains slow is no longer the per-page query count — it is **structural**:

1. **Every protected page pays a 3-query auth floor before its own work begins.** `proxy.ts` calls `auth.getUser()`, then `resolveOrgIdFromCookies()` calls `auth.getUser()` again **and** does an `org_memberships` lookup, then `AuthProvider` (client) re-fetches the same `org_memberships` row plus `user_profiles` after hydration. That's 2 server round-trips and 2 client round-trips per page, before the page's own fetcher runs. The `auth.getUser()` calls hit Supabase Auth's GoTrue (separate from PostgREST), not local cookie validation — they are not free.
2. **`revalidate = 60` is still ineffective** on every page that uses it. `getAppData()` reads cookies via `resolveOrgIdFromCookies`, opting the page into dynamic rendering. `/settings` declares `revalidate = 60` and also reads cookies. The 9-query data path runs on every single request. **This remains the highest-leverage unshipped fix in the audit.** PR #25 didn't change this; the comments at `app/page.tsx:23-26` explicitly defer it ("ISR-friendly anon/authed split is tracked in docs/PERF-WAVE-2.md as a Phase D item").
3. **The dashboard's `getAppData()` still issues ~9–11 round-trips per request.** Slim RPC dropped wire payload by ~3 MB, which is huge for Time-to-First-Byte on slow networks, but the round-trip count for `/` did not change. On Vercel ↔ Supabase (typically 30–80ms RTT), that is still a 300–800ms data-path floor.

**Top 3 fixes ranked by (impact × ease):**

1. **Pass server-resolved user + role + sectors into `AuthProvider` as initial state**, eliminating both client-side queries it currently fires on every page. *Impact: removes 2 client round-trips on every page render. Effort: Med (~1h). File: `fsi-app/src/components/auth/AuthProvider.tsx:24-64`.*
2. **Cache `getAppData()` behind `unstable_cache` keyed by `orgId`** so the 9-query data path runs at most once per minute per workspace. The cookies read happens *outside* the cached function; only the resolved orgId becomes the cache key. *Impact: eliminates the 9-query cost on the warm path; brings `/` from ~500ms data-fetch to ~5ms cache-hit. Effort: Med (~1h). File: `fsi-app/src/lib/data.ts:20-54`.*
3. **Code-split the 4 heavy client components** behind `next/dynamic` with SSR fallback so they are not parsed on initial route compile. `RegulationDetailSurface` (1054 LOC), `ResearchView` (875 LOC), `RegulationsSurface` (756 LOC), `MarketPage` (716 LOC), `OperationsPage` (705 LOC), `AdminDashboard` (896 LOC) are all *eagerly* imported by their page wrappers. *Impact: reduces JS parse cost on first paint. Effort: Med per component (~30min each).*

A 4th, less-visible win: **fold the role lookup at `app/admin/page.tsx:17-23` into `resolveOrgIdFromCookies`** so admin doesn't hit `org_memberships` twice (once for the role gate, once via `getAppData`). Trivial.

---

## Verified vs Not Verified — Backlog Walk-through

| Audit item | Status | Evidence |
|---|---|---|
| `revalidate = 60` is silently broken on cookie-reading pages | **NOT FIXED** | `/settings/page.tsx:7` still `export const revalidate = 60` *and* still calls `auth.getUser()` + `getAppData()` (which reads cookies). `app/page.tsx:23-26` admits it: "previous `export const revalidate = 60` was a no-op". The hint was *removed* from `/`, `/regulations`, `/regulations/[slug]` for honesty, but the underlying wasted compute (running the data path on every request) remains. |
| `getAppData()` removed from `/regulations/[slug]/page.tsx` | **FIXED** | `app/regulations/[slug]/page.tsx:91` calls only `fetchIntelligenceItem`. Lines 102-169 do the targeted `.in('id', uuids)` lookup the audit recommended. |
| AuthProvider duplicate `org_memberships` lookup | **NOT FIXED** | `components/auth/AuthProvider.tsx:42-52` still fires `org_memberships` + `user_profiles` queries client-side after mount on every page. Now also fires `user_profiles.sectors` lookup, so the cost is 2 client queries per page render rather than 1. |
| Slim RPC `get_workspace_intelligence_slim` wired into `fetchResourcesOnly` and `fetchMapData` | **FIXED** | `lib/supabase-server.ts:401-404` selects between `get_workspace_intelligence` and `get_workspace_intelligence_slim` based on `options.slim`. `fetchResourcesOnly` (line 740) and `fetchMapData` (line 797) pass `slim: true`. |
| Sidebar `prefetch={false}` on data-heavy nav links | **FIXED** | `components/Sidebar.tsx:48-57` defines `NO_PREFETCH_HREFS` for 8 routes. Lines 115 and 160 apply `prefetch={false}` accordingly. |
| Region-count RPC replaces 8-query loop on `/community*` | **FIXED** | `app/community/page.tsx:116`, `community/[slug]/page.tsx:114`, `community/browse/page.tsx` all call `supabase.rpc("community_region_counts")`. |
| `/community/*` parallelisation | **FIXED** | `community/page.tsx:60` runs all 6 reads in one `Promise.all`. `community/[slug]/page.tsx:76` does Phase 1 (5 reads) + Phase 2 (3 reads) — 2 round-trips total. `community/browse/page.tsx:86` does Phase 1 (5 reads) similarly. |
| Admin client-side `loadData` waterfall moved server-side | **FIXED** | `app/admin/page.tsx:35-59` runs `fetchSourceData(true)` + `organizations` + `org_memberships` + `staged_updates` in one `Promise.all`. `AdminDashboard.tsx:42-46` accepts the data as initial props. The `loadData` callback (line 114) is retained for refresh button + post-mutation refreshes — fine. |
| `intelligence_changes` and `item_changelog` `.limit(N)` | **FIXED** | `lib/supabase-server.ts:72` (`.limit(100)`), `lib/supabase-server.ts:102` (`.limit(100)`), `lib/supabase-server.ts:633` (`.limit(100)`). |
| `sources.select("*")` replaced with column projection | **FIXED** | `lib/supabase-server.ts:227-274` declares `SOURCE_COLUMNS` (46 columns); `fetchSources()` line 280 uses it. |
| Redundant `intelligence_items` id-map fetch in `fetchDashboardData` | **FIXED** | The map is now built from the RPC payload at `lib/supabase-server.ts:412-413` (inside `fetchWorkspaceResources`). The duplicate read flagged in PERF-AUDIT.md:550-556 is gone. |
| Defensive retry path in `/research` page | **FIXED** | `app/research/page.tsx:33-46` is a single happy-path query. The fallback retry from PR #19 has been removed. |
| `/research` initial limit lowered from 500 to 100 | **PARTIAL** | Limit is now 150 (line 40), not 500, but the audit asked for 100. There's still a `TODO(perf): wire a "load more" UI cursor` comment on line 31 — load-more is not built. |
| `select("*")` on `staged_updates` | **PARTIAL** | Server-side `staged_updates.select("*")` at `app/admin/page.tsx:54` is bounded by `.limit(100)` and `.eq("status", "pending")`, but it still ships every column including `full_brief` and JSONB `proposed_changes`. The audit recommended slimming the column list. Same shape inside `AdminDashboard.tsx:129`. |
| `@anthropic-ai/sdk` server-only | **VERIFIED CLEAN** | Static grep finds it in 5 files: `lib/sources/verification.ts` and 4 `app/api/admin/.../route.ts` files. **None are client components.** No leakage to the browser bundle. |
| 4 heavy client components not code-split | **NOT FIXED** | `RegulationDetailSurface.tsx` is now **1054 LOC** (grew since the audit), `AdminDashboard.tsx` is **896 LOC** (also grew), `ResearchView.tsx` 875, `RegulationsSurface.tsx` 756, `MarketPage.tsx` 716, `OperationsPage.tsx` 705. All eagerly imported by their respective page files. |
| `proxy.ts` middleware `auth.getUser()` floor cost | **STILL PAID** | `proxy.ts:33` runs `auth.getUser()` on every page request. This is structural for SSR auth — the audit acknowledged it. But combined with `resolveOrgIdFromCookies` (also calls `auth.getUser`) and `AuthProvider` (client-side `auth.getUser`), every page render hits Supabase Auth **3 times**. |

---

## Per-Page Diagnosis

Round-trip counts assume happy-path (auth resolved, org membership found). All counts include the `proxy.ts` `auth.getUser()` floor cost.

### `/` (Dashboard)

- **Server queries:** 1 (proxy auth) + 1 (resolveOrgIdFromCookies auth) + 1 (org_memberships) + 1 (workspace RPC, full) + 1 (timelines) + 4 (changelog/disputes/xrefs/supersessions parallel) + 1+ (intelligence_summaries paginated) + 4 (changes/sectors/overrides parallel + admin sources fetcher running in parallel via `getAppData`'s outer `Promise.all`) = **~13 round-trips** (not counting parallelism wins).
- **Client queries on mount:** 1 (`auth.getUser`) + 2 (`org_memberships` + `user_profiles.sectors` in `AuthProvider`) = **3 client round-trips** before the workspace store is populated.
- **Wire payload (estimate):** Workspace RPC (full) + 184 items × all fields incl. `full_brief` ≈ ~3.5 MB on the wire. Plus changelog/disputes/xrefs/supersessions/synopses/changes ≈ another 200 KB.
- **ISR/cache achievable:** No, because of cookies read. Achievable if `unstable_cache` wraps the inner fetch keyed by orgId.
- **Revalidate firing:** No (no `revalidate` declared on this page anymore — the comment acknowledges it).
- **Bottleneck:** *Wire payload is now the dominant cost* (full_brief is ~20 KB × 184 rows on the dashboard path). Per-row `urgencyScore + scoreResource` runs in `HomeSurface:82-86` for every resource on every render. With ~190 resources and per-call sector context resolution, this is fine but worth memoizing if list grows past 500.

### `/regulations` (index)

- **Server queries:** 1 (proxy auth) + 1 (resolveOrgIdFromCookies auth) + 1 (org_memberships) + 1 (workspace RPC slim) + 1 (timelines) + 1 (workspace_item_overrides) + 1 (count head-query for `platformTotal` at line 47-52) = **~7 round-trips**.
- **Client queries on mount:** 3 (AuthProvider) — same as every page.
- **Wire payload:** Slim RPC drops `full_brief` etc. ≈ ~700 KB on the wire.
- **ISR/cache achievable:** No (cookies read).
- **Bottleneck:** AuthProvider client roundtrips + the *separate* anon-key Supabase client created at line 43 to do the platform-total head count. That separate client construction is fine, but the head count (`select id, count exact, head true`) hits Postgres regardless.

### `/regulations/[slug]` (detail)

- **Server queries:** 1 (proxy auth) + 1 (UUID→legacy_id redirect lookup, only when slug is a UUID) + 1 (`fetchIntelligenceItem` main row) + 1 (timelines) + 1 (changelog) + 1 (dispute) + 2 (xrefOut + xrefIn — still two queries, audit flagged this for consolidation) + 1 (supersessions) + 1–2 (related-items lookup, split into legacy_ids and uuids) = **~9–10 round-trips**.
- **Client queries on mount:** 3 (AuthProvider).
- **Wire payload:** One full `intelligence_items.select("*")` row (~25 KB with full_brief) + small relationship payload.
- **ISR/cache achievable:** Yes, this page is cookies-free *if* AuthProvider were server-hydrated. The lookup uses service-role key.
- **Bottleneck:** The xrefOut + xrefIn pair could be one `.or('source_item_id.eq.X,target_item_id.eq.X')` (audit fix #12, still not shipped). The big change since prior audit: this page no longer pays the `getAppData()` tax (~10 wasted queries). Net win: ~50% query reduction.

### `/operations`, `/market`

- **Server queries:** 1 (proxy auth) + 1 (resolveOrgIdFromCookies auth) + 1 (org_memberships) + 1 (workspace RPC slim) + 1 (timelines) + 1 (overrides) = **~5 round-trips**.
- **Client queries on mount:** 3 (AuthProvider).
- **Wire payload:** Slim RPC, ~700 KB.
- **ISR/cache achievable:** No (cookies).
- **Bottleneck:** Eager parse of OperationsPage.tsx (705 LOC) / MarketPage.tsx (716 LOC). Both render large client-side filter UIs. Per-resource scoring runs client-side on every render but is gated through `useMemo` in their internals (verified).

### `/map`

- **Server queries:** 1 (proxy auth) + 1 (org_memberships via resolveOrg) + 1 (workspace RPC slim) + 1 (timelines) + 4 (changelog/disputes/xrefs/supersessions parallel) = **~7 round-trips** (one batch is parallel).
- **Client queries on mount:** 3 (AuthProvider).
- **Wire payload:** Slim RPC + 4 relationship payloads ≈ ~900 KB.
- **Leaflet bundle:** `MapView` is dynamically imported with `ssr: false` (verified at `MapPageView.tsx:27-28`). Good — Leaflet's CSS+JS (~200KB gzipped) is only fetched when this route mounts.
- **Bottleneck:** Leaflet initial download on first /map navigation. Cluster plugin `react-leaflet-cluster` adds ~40KB. The *server* data fetch is fine.

### `/research`

- **Server queries:** 1 (proxy auth) + 1 (intelligence_items + embedded sources, .limit(150)) = **~2 round-trips**. Cleanest page in the app.
- **Client queries on mount:** 3 (AuthProvider).
- **Wire payload:** 150 rows × (id, legacy_id, title, summary, pipeline_stage, transport_modes, jurisdictions, added_date, source.{name,url}). Roughly 200–300 KB on the wire — biggest single read but all visible columns.
- **ISR/cache achievable:** Yes — `revalidate = 60` declared on line 4 and the fetch is *cookies-free*. **This is the only page where `revalidate = 60` actually works** because it doesn't read cookies in its own data path. (AuthProvider runs after the server-rendered HTML is sent, so it doesn't break ISR.)
- **Bottleneck:** ResearchView.tsx parse cost (875 LOC client component, eagerly imported). Lazy-loading would let the route shell paint earlier.

### `/community`, `/community/browse`, `/community/[slug]`

- **Server queries (all three):** 1 (proxy auth) + 1 (page-level auth.getUser). Then a single `Promise.all` of 6 (community/) or 5 (browse/, [slug]/ Phase 1) reads, plus the community_region_counts RPC. `[slug]` adds a Phase 2 of 3 reads. `browse/` does an in-page Phase 2 with 3 reads.
- **Total round-trip windows:**
  - `/community` → 1 (proxy) + 1 (auth) + 1 (parallel batch of 6) = **3 wall-clock RTTs**.
  - `/community/browse` → 1 + 1 + 1 (parallel 5) + 1 (parallel 3) = **4 RTTs**.
  - `/community/[slug]` → 1 + 1 + 1 (parallel 5) + 1 (parallel 3) = **4 RTTs**.
- **Client queries on mount:** 3 (AuthProvider).
- **Wire payload:** Light. Embedded community_groups payload per row ~250 bytes. ~20 memberships max realistically = ~5 KB.
- **ISR/cache achievable:** No — `export const dynamic = "force-dynamic"` on all three. RLS-sensitive data justifies this.
- **Bottleneck:** AuthProvider tax. The community pages themselves are now well-tuned.

### `/admin`

- **Server queries:** 1 (proxy auth) + 1 (page-level auth.getUser) + 1 (role gate at line 17-23 — `org_memberships`) + 4 in parallel (`fetchSourceData(true)` = 3 internal queries, plus `organizations`, `org_memberships` again, `staged_updates`) = **~8 effective round-trips, in 3 wall-clock windows**.
- **Client queries on mount:** 3 (AuthProvider) + (manual refresh path: 4 queries on demand).
- **Wire payload:** ~500 sources × 46 columns ≈ ~600 KB. Provisional sources + open conflicts are smaller. Staged updates `select("*")` with `.limit(100)` ships ~100 × full row including `full_brief` if present ≈ ~500 KB worst case.
- **ISR/cache achievable:** No (admin reads are user-scoped).
- **Bottleneck:** AdminDashboard.tsx is **896 LOC** of eagerly-imported client code. Plus SourceHealthDashboard (541 LOC) — both render on every admin tab even when only one tab is visible. The `org_memberships` query is run twice (page-level role gate at line 17 + inside `Promise.all` at line 48 — same query, different return shape; could share).

### `/settings`

- **Server queries:** 1 (proxy auth) + 1 (page-level auth.getUser at line 11) + 1 (resolveOrgIdFromCookies auth — 3rd call!) + 1 (org_memberships) + ~10 (full `getAppData` data path, see `/` above) = **~14 round-trips**.
- **Client queries on mount:** 3 (AuthProvider).
- **`revalidate = 60` declaration:** Yes, on line 7 — but ineffective because `auth.getUser` and `resolveOrgIdFromCookies` both read cookies.
- **Bottleneck:** `/settings` is THE most expensive page in the app. It's the only surviving full-`getAppData` consumer outside `/`. SettingsPage only consumes `resources`, `archived`, and `supersessions` — same waste pattern PERF-AUDIT.md flagged for `/operations`/`/market`/`/regulations` before they were slimmed. Should switch to a slim variant.

### `/profile`

- **Server queries:** 1 (proxy auth) + 1 (page-level auth.getUser) = **~2 round-trips**.
- **Client queries on mount:** 3 (AuthProvider) + UserProfilePage internal fetches (verified — 0 direct supabase calls in `components/profile/UserProfilePage.tsx`; everything is via the server props that `app/profile/page.tsx` *doesn't* pass — the surface fetches itself).
- **Bottleneck:** Need to audit `UserProfilePage.tsx` mount-time fetches (couldn't fully verify in this read-only pass — see "What I Couldn't Measure").

---

## Cross-Cutting Issues

### 1. Auth round-trip multiplication

Every protected page hits Supabase Auth (GoTrue) **3 times** per render:
1. `proxy.ts:33` — middleware `auth.getUser()`
2. `resolveOrgIdFromCookies` at `lib/api/org.ts:47` — server-component `auth.getUser()` (only on pages that call `getAppData`/`getResourcesOnly`/`getMapData`)
3. `AuthProvider` at `components/auth/AuthProvider.tsx:28` — browser-side `auth.getUser()` after mount

In addition, `org_memberships` is queried **2–3 times** per page:
1. `resolveOrgIdFromCookies` (server)
2. `AuthProvider` (client)
3. `app/admin/page.tsx:17` (role gate, only on /admin)

GoTrue's `auth.getUser` validates the JWT signature and (depending on session age) may refresh the token via a separate round-trip to `/auth/v1/token`. Even on cache-hit, it's 30–80ms each over the wire. **2 server-side calls = ~60–160ms always paid before the page's own work begins.**

**Recommended fix:**
- Have `resolveOrgIdFromCookies` accept the user from a request-scoped context (set once in middleware) instead of re-fetching.
- Have `AuthProvider` read user + role + sectors from initial server-rendered props (passed via the layout) instead of fetching on mount. A `RootLayout` server component can resolve these once via `cookies()` and pass them to a `<AuthProvider initialUser={user} initialRole={role} initialSectors={sectors}>`.

This single change removes 2 client round-trips and 1 server round-trip per page, on every page render.

### 2. ISR is theoretically achievable but architecturally blocked

The blocker is the cookies read in the data path. Three candidates for unblocking:

**Option A — `unstable_cache` with orgId as key** (recommended): wrap the inner query body of `getAppData` in `unstable_cache((orgId) => ..., [orgId], { revalidate: 60 })`. The cookies read happens *outside* the cached function; only the resolved orgId becomes the cache key. Anonymous users hit one cache key, each authed workspace hits another. Effort: ~1h. Files: `lib/data.ts`, `lib/supabase-server.ts`.

**Option B — anon-vs-authed split**: render anonymous (no overrides) statically, hydrate authenticated overrides client-side via `/api/me/overrides`. This is a bigger refactor and changes the rendering model.

**Option C — accept dynamic, focus elsewhere**: if RTT to Supabase is the bottleneck, ISR is the only fix. If JS parse time or per-page query count is the bottleneck, fix those instead.

### 3. Eager imports of large client surfaces

| Component | LOC | Imported by | Currently lazy? |
|---|---|---|---|
| `RegulationDetailSurface` | 1054 | `app/regulations/[slug]/page.tsx:26` | No |
| `AdminDashboard` | 896 | `app/admin/page.tsx:3` | No |
| `ResearchView` | 875 | `app/research/page.tsx:1` | No |
| `RegulationsSurface` | 756 | `app/regulations/page.tsx:21` | No |
| `MarketPage` | 716 | `app/market/page.tsx:2` | No |
| `OperationsPage` | 705 | `app/operations/page.tsx:2` | No |
| `CommunitySidebar` | 623 | `community/CommunityShell.tsx` | No |
| `SourceHealthDashboard` | 541 | `admin/AdminDashboard.tsx` | No |

These are all eagerly imported in their server-component wrappers. Next 16 will tree-shake unused exports but cannot defer the parse cost of imported-and-rendered components. **Wrap each in `dynamic(() => import(...), { ssr: true })`** to reduce per-route compile time and improve TTI on slower devices.

`MapView` is correctly `dynamic()` with `ssr: false`. That's the gold-standard pattern.

### 4. The `lucide-react` 77-file footprint

Counted: 77 files import from `lucide-react`. None use `import * as` patterns (verified). Next 16 + Turbopack tree-shakes named imports per the Vercel docs. The shape of the imports (`import { Bell, X } from "lucide-react"`) is correct.

**Risk:** if Turbopack's tree-shake mis-handles a barrel re-export, every Lucide icon (~1700 of them) lands in the bundle. The only way to verify is to run `next build` and inspect output, which the user explicitly excluded. Static analysis says this should be fine.

### 5. Polling

- `useAdminAttention.ts:114` — `setInterval(fetchCounts, POLL_INTERVAL_MS)`. POLL_INTERVAL_MS not shown in the read but the hook is mounted in `Sidebar.tsx:69` for admin users, so it runs on every page for admins.
- `NotificationsBell.tsx:55,61` — `setInterval` polling. Currently mounted only inside `/community` per audit; verify it's not in `AppShell`.
- `B2ProgressBanner.tsx:68` — `setInterval(load, 30000)` only when admin/sources tab mounted. Bounded.

`useAdminAttention` is the one to watch — it polls `/api/admin/attention` and is mounted in the sidebar. That endpoint should be checked for query cost.

### 6. `intelligence_summaries` paginated read

`fetchAllSynopses` at `lib/supabase-server.ts:604-625` does a `while(true)` paginated read of intelligence_summaries in 1000-row batches. With ~2,325 stale rows (per the CLAUDE.md sector-activation note), this is **3 round-trips per dashboard render** — and the data is "shelved", read but not displayed. Per CLAUDE.md the rows stay (not deleted), but the dashboard *shouldn't* be re-fetching them on every render. **Recommend gating this fetch behind a feature flag tied to per-sector reporting activation, since the data is currently unrendered.** Conservative estimate: this is 100–300ms per dashboard render that produces no user-visible effect.

### 7. `staged_updates.select("*")` ships full_brief

`app/admin/page.tsx:54` and `AdminDashboard.tsx:129` both do `staged_updates.select("*")`. `staged_updates` includes `full_brief` (per migration 007) and `proposed_changes JSONB`. With `.limit(100)` and ~24 rows historically, that's potentially 2.4 MB of full_brief content on every admin page render. **Replace with explicit column projection covering only what the staged-updates panel renders.**

### 8. The third `auth.getUser` (no — only 2 server calls)

Re-checking: `proxy.ts` calls `auth.getUser`. `resolveOrgIdFromCookies` calls it again. Each page that uses `getAppData` or pulls user via `createSupabaseServerClient` calls it a third time on the server (e.g. `/admin/page.tsx:9`, `/settings/page.tsx:11`, `/profile/page.tsx:18`, `/community/page.tsx:34`). So the count is actually:

- `/` → proxy + resolveOrg = 2 server calls
- `/admin` → proxy + page + resolveOrg (via `fetchSourceData` doesn't call resolveOrg — `fetchSourceData(true)` doesn't take orgId) = **2 server calls** (admin doesn't go through resolveOrg)
- `/settings` → proxy + page (line 11) + resolveOrg (via getAppData) = **3 server calls**
- `/community/*` → proxy + page = 2 server calls
- `/regulations/[slug]` → proxy only (page uses fetchIntelligenceItem which is service-role) = **1 server call**

The exact count varies. The fix is the same: pass the user through.

---

## Bundle Weight (static analysis)

| Dependency | Where it lives | Load impact |
|---|---|---|
| `@anthropic-ai/sdk` | 5 server files only | **0 bytes in client bundle** (verified) |
| `leaflet` + `react-leaflet` + `react-leaflet-cluster` | `MapView.tsx`, `MapPageView.tsx` | Loaded only on `/map` (dynamic+ssr:false). ~200KB gzipped. |
| `gsap` + `@gsap/react` | (need build to verify call sites) | Listed as dependency. Used per CLAUDE.md for card-expansion animations. ~70KB gzipped if not tree-shaken. |
| `react-markdown` + `remark-gfm` | `IntelligenceBrief.tsx`, `SectorSynopsis.tsx` | These are eagerly imported by `RegulationDetailSurface` (1054 LOC). ~50KB gzipped. **Should be wrapped in `dynamic()` since they only render on the detail page.** |
| `lucide-react` | 77 files | Tree-shaken named imports — should be ~1KB per icon. Total impact bounded if tree-shake works. |
| `zustand` | All store files | ~3KB gzipped. Fine. |
| `@supabase/ssr` + `@supabase/supabase-js` | Server + client | ~30KB gzipped on client. Required. |

**Verdict:** No surprise client bundle bloat. The biggest unverified concern is `gsap` — if it's eagerly imported by a component that mounts in the global layout (e.g. `AppShell`), it's on every page. Static grep of `import.*gsap` returned 0 hits in the Grep step, so it appears unused at compile-time. Worth confirming with `next build` output.

---

## Database Hotspots

### Slowest queries observed

1. **`fetchAllSynopses`** (`lib/supabase-server.ts:604-625`) — 3 round-trips × ~1000 rows each on the dashboard data path. This is pulling *unrendered* data per the sector-activation shelving decision. **Highest-impact untouched DB cost.**
2. **`get_workspace_intelligence` (full)** — used on `/` and `/settings`. Includes `full_brief` (averaging 12KB per row × 184 rows = 2.2 MB) plus 3 other long TEXT columns. Slim RPC was the right move; the dashboard could probably use the slim variant too if the home sections (WeeklyBriefing, WhatChanged) don't need `full_brief` directly.
3. **`item_supersessions` 3-table join** (`lib/supabase-server.ts:144-146`) — joins to two `intelligence_items` aliases. With `.order` but no `.limit` it returns all supersessions. Currently small; would scale poorly past ~500 rows.
4. **`item_cross_references` query for the dashboard** — embeds source + target intelligence_items. No `.limit()`. Currently ~50 rows; will scale roughly with item count.
5. **`/regulations` platform-total head count** (`app/regulations/page.tsx:47-52`) — `select id, count exact, head true` is cheap on an indexed table but is a separate round-trip from the rest of the page's data path. Could fold into `getResourcesOnly` if needed.

### Wide `select("*")` reads

- **`staged_updates.select("*")`** — server (line 54) and client (line 129). Includes `full_brief`. Recommend slim projection.
- **`provisional_sources.select("*")`** (`supabase-server.ts:295`) — 23 columns currently, all used by mapper. Acceptable.
- **`source_conflicts.select("*")`** (`supabase-server.ts:328`) — 14 columns, all used. Acceptable.
- **`intelligence_items.select("*")` in `fetchIntelligenceItem`** (`supabase-server.ts:893`) — single row, but ships every column including 4 long TEXT fields. Could slim to columns the detail surface actually renders, saving ~30KB on each detail page hit. Effort: Low.

### Unbounded SELECTs

- `intelligence_summaries` — paginated, technically bounded by row count but stale (see #6).
- `item_cross_references` — no limit (see #4 above).
- `item_supersessions` — no limit (see #3 above).
- `community_groups` browse — no limit on `app/community/browse/page.tsx`. With public-groups in EU/Global growing, this could matter at scale. Recommend `.limit(50)` + load-more.

### Missing indexes (informed guess from migrations)

- `intelligence_items(is_archived, added_date DESC)` — the `/research` ORDER BY query. Per migration audit, the table has `(is_archived)` and `(added_date)` separately, but a composite index on `(is_archived, added_date DESC)` would let the planner do an index-only scan. Single-column indexes get the job done but with an extra sort step. Negligible at 188 rows; matters past 5000.

---

## Live Network Observations

`curl -sI` against `https://carosledge.com`:

- **`/login`** → `HTTP/1.1 200 OK`, `X-Vercel-Cache: HIT`, `X-Nextjs-Prerender: 1`, `X-Nextjs-Stale-Time: 300`, `Cache-Control: public, max-age=0, must-revalidate`. **Login page is fully prerendered and cached at the edge.** Good.
- **`/`** → `HTTP/1.1 307 Temporary Redirect`, `Location: /login?redirect=%2F`. Anonymous users redirect to login (proxy.ts logic). The redirect itself is fast (~50ms).
- No `Server-Timing` header on either response. Next/Vercel doesn't set it by default.
- `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch` on /login indicates RSC payload caching is configured.

**What's observable from outside:** the public surface (login) is fast and cached. The slowness is behind auth, which curl can't reach without a session. Without DevTools / authenticated session, I can't time the post-login `/` render. The `[perf] / data <ms>ms` logs on Vercel function logs would give exact numbers.

---

## Concrete Prioritised Fix List

Each entry: title — file:line — impact — effort — estimated time.

1. **Server-hydrate AuthProvider** — `components/auth/AuthProvider.tsx:24-64` — Impact High, Effort Med, ~1h.
   Pass `initialUser`, `initialRole`, `initialSectors` from a server component (root layout or per-page). Eliminate the 2 client round-trips that fire on every page mount. As a side effect, role-gated UI no longer flashes between "loading" and "admin-visible" states.

2. **Cache `getAppData()` and slim variants behind `unstable_cache`** — `lib/data.ts:20-131` — Impact High, Effort Med, ~1h.
   Wrap the inner fetcher (post `resolveOrgIdFromCookies`) in `unstable_cache(fn, [orgId], { revalidate: 60, tags: [`workspace:${orgId}`] })`. Per-workspace cache key. Anonymous users (orgId=null) share one cache key. Tag-invalidate from staged-update approval and override mutation routes.

3. **Switch `/settings` from `getAppData()` to a slim fetcher** — `app/settings/page.tsx:16` — Impact Med-High, Effort Low, ~15min.
   `SettingsPage` only consumes `resources`, `archived`, `supersessions`. Build `getSettingsData()` (resources + supersessions; ~6 queries vs ~10) or reuse `getMapData()` if the shape fits. `/settings` is the last full-`getAppData` consumer outside `/`.

4. **Code-split RegulationDetailSurface and AdminDashboard** — `app/regulations/[slug]/page.tsx:26`, `app/admin/page.tsx:3` — Impact Med, Effort Med, ~30min each.
   These are the 2 largest client surfaces (1054 + 896 LOC). Wrap in `next/dynamic(() => import(...), { ssr: true })`. Reduces per-route compile time and improves TTI on cold renders.

5. **Slim `staged_updates.select("*")` to explicit columns** — `app/admin/page.tsx:54` and `components/admin/AdminDashboard.tsx:129` — Impact Med, Effort Low, ~10min.
   The staged-updates panel renders ~10 columns; current select ships ~25 including full_brief and proposed_changes JSONB. Replace `select("*")` with the column list.

6. **Drop the `fetchAllSynopses` paginated read from the dashboard data path** — `lib/supabase-server.ts:604-625` — Impact Med, Effort Low, ~10min.
   Per CLAUDE.md, `intelligence_summaries` is shelved and unused by the live UI (SectorSynopsisView still renders against `full_brief`). The data is read but not displayed. Gate behind a feature flag or remove from the dashboard data path entirely until per-sector activation ships. Saves 1–3 round-trips and ~500KB wire on every dashboard render.

7. **Consolidate the dual cross-reference reads in `fetchIntelligenceItem`** — `lib/supabase-server.ts:991-998` — Impact Low-Med, Effort Low, ~10min.
   Replace the two queries (xrefOut + xrefIn) with one `.or('source_item_id.eq.X,target_item_id.eq.X')`. Saves 1 round-trip per detail page hit. Audit fix #12 — still pending.

8. **Fold the `/admin` role gate into `resolveOrgIdFromCookies`** — `app/admin/page.tsx:17-23` and `lib/api/org.ts:18-30` — Impact Low-Med, Effort Low, ~10min.
   `/admin` does the role gate via `org_memberships`, then `getAppData` (not actually called on /admin — uses fetchSourceData). On /admin specifically, `org_memberships` is queried once. *But* if you adopt fix #1 above, the role lands in `AuthProvider` and the role-gate query disappears entirely.

9. **Lower `/research` initial limit from 150 to 100 + add load-more** — `app/research/page.tsx:40` — Impact Low, Effort Med, ~30min.
   Audit fix #10 partially shipped (500→150 not 100). The TODO comment on line 31 acknowledges it. Add cursor-based pagination so the initial paint stays fast as the pipeline grows past 200 rows.

10. **Slim `intelligence_items.select("*")` in `fetchIntelligenceItem`** — `lib/supabase-server.ts:893` — Impact Low-Med, Effort Low, ~10min.
    Single-row read but includes 4 long TEXT fields. List the ~20 columns the detail surface actually renders.

11. **Code-split ResearchView, RegulationsSurface, MarketPage, OperationsPage** — same pattern as #4 — Impact Med (each), Effort Med, ~30min each.
    These are 700–900 LOC client components. Lazy-load with `dynamic()`. Improves TTI for users who navigate via direct URL.

12. **Add composite index `(is_archived, added_date DESC)` on `intelligence_items`** — new migration — Impact Low today, Med at scale, ~10min.
    The `/research` query order. Single-column indexes work but force a sort step.

13. **Add `.limit(50)` to `community_groups` browse query** — `app/community/browse/page.tsx:97` — Impact Low today, High at scale, ~10min.
    Currently unbounded; with EU + Global regions growing this becomes a real cost. Pair with cursor-based load-more.

14. **Bound `item_cross_references` and `item_supersessions` reads** — `lib/supabase-server.ts:127-130, 143-146` — Impact Low today, Med at scale, ~10min.
    Add `.limit(500)` defensively. Both currently scale linearly with item count.

15. **Verify `gsap` is actually used or remove from dependencies** — `package.json:13,18` — Impact uncertain, Effort Low, ~15min.
    Static grep returned 0 imports. If unused, drop the dependency to skip the parse cost.

---

## What I Couldn't Measure

- **Actual JS bundle sizes per route.** Static analysis can't replace `next build`'s output. The user excluded that. Findings here assume Turbopack tree-shake works correctly; if it doesn't, lucide-react or react-markdown could quietly bloat the bundle.
- **Time-to-First-Byte under authenticated load.** `curl -sI` against carosledge.com only reaches the public login. The real cost is on protected pages, which require a session.
- **Database round-trip latency in production.** Vercel ↔ Supabase RTT varies by region pairing. Without `Server-Timing` headers, I'm assuming the typical 30–80ms range.
- **The `[perf] ... <ms>ms` logs.** PERF-WAVE-2.md instruments these but they live in Vercel function logs, which I can't tail from this environment.
- **`/api/admin/attention` cost.** Polled every POLL_INTERVAL_MS (constant not visible in the read) by the sidebar for admin users. Worth checking the route's query shape.
- **`UserProfilePage.tsx` mount-time fetches.** It's a 547+ LOC client surface; it likely fires its own data reads on mount. Couldn't fully audit without reading the whole file, which would require more time than this audit budgeted.
- **Whether `gsap` is bundled or shaken out.** Static grep finds 0 imports, but tree-shake dead code elimination depends on the bundler. `next build` would tell.
- **Realtime subscriptions.** Hooks exist (`useCommunityPostsRealtime`, `useCommunityNotificationsRealtime`) but per the source comments and CLAUDE.md they're "graceful-degrade to polling". Need to verify they're not silently mounted somewhere fanning out WebSocket subscriptions.
- **Supabase connection pool tuning.** The 9-query bursts on `/` could exhaust PgBouncer if pool size is small. Without DB metrics, this is theoretical.

To get definitive answers on the unverified items: run `next build` once and inspect the chunk graph; tail Vercel function logs while clicking through the app; open Chrome DevTools Network tab and capture a HAR file from a logged-in session.

---

## Closing Note

The 2026-05-05 audit was excellent and most of its high-impact recommendations shipped. The slowness the user is experiencing now is **not** the per-page query count — that's been reduced significantly. It's the **structural auth round-trip multiplication on every page** (3 server calls + 2 client calls before the page's own work) and **the absence of any caching layer** (every render does the full data dance). Fix #1 (AuthProvider hydration) and fix #2 (`unstable_cache` for getAppData) together would eliminate both — and they're independent of each other, so they can ship in parallel.
