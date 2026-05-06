# Perf Claim Investigation — Fresh Findings

Generated: 2026-05-05
Scope: 6 perf claims from external/unknown source. All work read-only (no writes to source code, no DB writes).

## Verdict Summary

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `/regulations` list query SELECT-s `full_brief` (and other large text it doesn't display) | **VERIFIED** | `supabase/migrations/007_full_brief.sql:19,53` (RPC includes `full_brief`); `supabase-server.ts:427` (mapped onto `Resource.fullBrief`); `RegulationsSurface.tsx:140-188` (renders only title/tags/id/jurisdiction/priority/timeline — never `fullBrief`). Live DB: 184 active rows × avg 17,352 chars = **3.19 MB of `full_brief` text** flushed per render |
| 2 | `revalidate=60` removed on `/`, `/regulations`, `/research` | **PARTIALLY VERIFIED** (claim is mis-summarized) | Removed on `/`, `/regulations`, `/regulations/[slug]`, `/operations`, `/market`, `/map`. **Still present** on `/research` (`research/page.tsx:4`) and on `/settings` (`settings/page.tsx:6`). The wave-2 commit message + this claim both correctly say `/research` is intentionally retained |
| 3 | `/research` does single 150-row SELECT vs 5-way concurrent fetch | **VERIFIED** (against the stale "5-way concurrent" claim) | `research/page.tsx:33-40`: one `await supabase.from("intelligence_items").select(…).limit(150)`. No `Promise.all`, no second SELECT |
| 4 | `pipeline_stage` column has missing indexes | **CONTRADICTED** | Live DB query: `idx_intelligence_items_pipeline_stage` (btree) exists. Created by `supabase/migrations/026_research_pipeline_stage.sql:29-30` |
| 5 | RSC prefetch causing 503s + connection-pool exhaustion | **UNVERIFIED** | No 503 / ECONNREFUSED / pool errors observed in live `vercel logs https://carosledge.com` stream (low-traffic window). Static signals (no `prefetch={false}` set; ~10 server-component routes; per-request Supabase client created via `createClient()` per fetch — see "Other findings") are consistent with a *theoretical* fan-out risk but no runtime evidence captured |
| 6 | Sidebar prefetch causes concurrent fan-out | **VERIFIED in static analysis** | `Sidebar.tsx`: 11 `<Link>` instances (logo + 9 nav items + 1 community), zero `prefetch={false}`. Next 16.1.6 default is auto-prefetch. Of those targets, 8 are server components that perform Supabase queries on render |

## Per-Claim Details

### Claim 1 — `/regulations` list ships data the list view doesn't render

**Verdict:** VERIFIED

**Route:** `fsi-app/src/app/regulations/page.tsx`

**Query path:**

1. `regulations/page.tsx:25` calls `getResourcesOnly()` (`src/lib/data.ts:67`).
2. `data.ts:78` calls `fetchResourcesOnly(orgId)` (`src/lib/supabase-server.ts:695`).
3. `fetchResourcesOnly` calls `fetchWorkspaceResources(orgId)` (`supabase-server.ts:368`).
4. `fetchWorkspaceResources` invokes the RPC `get_workspace_intelligence(p_org_id)` (`supabase-server.ts:378`).
5. The RPC body (current — defined by `migrations/007_full_brief.sql`) selects 31 columns from `intelligence_items`, including `full_brief`, `summary`, `what_is_it`, `why_matters`, `key_data`, `operational_impact`, `open_questions`, `reasoning`, `tags`, `jurisdictions`, `transport_modes`, `verticals`, etc.
6. `supabase-server.ts:427` maps `row.full_brief` onto `Resource.fullBrief`. The Resource then flows into `RegulationsSurface`.

**Columns SELECT-ed (verbatim — RPC return signature, `migrations/007_full_brief.sql:11-43`):**

```
id, legacy_id, title, summary, what_is_it, why_matters, key_data, full_brief,
operational_impact, open_questions, tags, domain, category, item_type, source_id,
source_url, jurisdictions, transport_modes, verticals, status, severity,
confidence, priority, reasoning, entry_into_force, compliance_deadline,
next_review_date, added_date, last_verified, is_archived, effective_priority,
effective_archived
```

(There is also an older RPC body in `006_multi_tenant.sql` with even more columns; the 007 migration replaces it. Both were applied to the same project — 007 wins for the live signature.)

**Displayed in the `/regulations` list:** `RegulationsSurface.tsx:140-188` (KanbanCard component) renders only `title`, `tags` (first 3), `id`, `jurisdiction`, `priority`, the next future timeline milestone, and `complianceDeadline`. **Not displayed:** `fullBrief`, `note`/`summary`, `whatIsIt`, `whyMatters`, `keyData`, `reasoning`, `operational_impact`, `open_questions`, `verticals`. (`note`/`summary` is used by the search filter at `RegulationsSurface.tsx:150-152` but isn't *rendered*; the others are dead weight on this surface.)

**Quantified live cost (read-only DB query against the Caro's Ledge project):**

```
SELECT count(*), avg(length(coalesce(full_brief,''))),
       max(length(coalesce(full_brief,''))), sum(length(coalesce(full_brief,'')))
  FROM intelligence_items WHERE NOT is_archived;
→ 184 rows · avg 17,352 chars · max 39,065 chars · sum 3,192,887 chars (3.19 MB)
```

The other unused-but-shipped text columns (`reasoning + operational_impact + why_matters + what_is_it + summary`) sum to **142 KB** across all rows — meaningful but ~22× smaller than `full_brief` alone. The wire payload from this RPC carries the full `full_brief` and is then shipped to the client component as part of the RSC payload (initialResources prop), since `RegulationsSurface` is `"use client"`.

**Audit of other list routes that hit the same fetcher:**

| Route | Query function | Columns SELECT-ed | Large text shipped that the list doesn't render |
|---|---|---|---|
| `/regulations` (`app/regulations/page.tsx`) | `getResourcesOnly` → RPC `get_workspace_intelligence` | 31 cols from `intelligence_items` (includes `full_brief`, `summary`, `what_is_it`, `why_matters`, `key_data`, `operational_impact`, `open_questions`, `reasoning`) | **`full_brief` (3.19 MB total)**, plus `operational_impact`, `open_questions`, `reasoning` — none rendered by `RegulationsSurface.tsx` |
| `/operations` (`app/operations/page.tsx`) | same | same | same — `OperationsPage.tsx` has no `fullBrief` reference |
| `/market` (`app/market/page.tsx`) | same | same | same — `MarketPage.tsx` has no `fullBrief` reference |
| `/research` (`app/research/page.tsx`) | inline `supabase.from("intelligence_items").select(…)` | `id, legacy_id, title, summary, pipeline_stage, transport_modes, jurisdictions, added_date, source:sources(name, url)` (`research/page.tsx:36`) | None — explicit slim projection |
| `/community` (`app/community/page.tsx`) | inline parallel queries on `community_*` tables | targeted columns (no `*`) | None |
| `/community/browse` (`app/community/browse/page.tsx`) | inline parallel queries | targeted columns | None |
| `/admin` (`app/admin/page.tsx`) | mix: `fetchSourceData(true)` + inline queries | `staged_updates select("*").limit(100)` (`admin/page.tsx:55`); `org_memberships`, `organizations` targeted | `staged_updates.proposed_data` (JSONB) + `materialization_error` shipped via `select("*")`; `staged_updates` was extended with `full_brief` in `migrations/007_full_brief.sql:7`. Bounded at 100 rows so size impact is small but technically over-fetches |

**Sources path:** `fetchSources()` in `supabase-server.ts:263` already uses an explicit 46-column projection (`SOURCE_COLUMNS`) — wave-2 fixed that one.

**Conclusion:** the `/regulations`, `/operations`, `/market` routes ship the entire `full_brief` payload (3.19 MB at current 184 rows; ~17 KB/item average, ~39 KB max) on every render, and none of those surfaces render the field. This is the largest concrete waste in the workspace fetcher. The fix needs a thinner RPC (or column projection swap on the RPC return) — `getResourcesOnly` already exists as the slim entry point but the underlying RPC payload is what controls the wire.

---

### Claim 2 — `revalidate=60` removed on `/`, `/regulations`, `/research`

**Verdict:** PARTIALLY VERIFIED. The claim's three-page list is wrong; the actual change matches the wave-2 commit message but not the claim text.

**Evidence:**

```
fsi-app/src/app/page.tsx:23-26       — revalidate REMOVED (comment confirms why)
fsi-app/src/app/regulations/page.tsx — no `revalidate`, no `dynamic` directive
fsi-app/src/app/regulations/[slug]/page.tsx:33-36 — comment confirms revalidate REMOVED
fsi-app/src/app/operations/page.tsx  — no directive
fsi-app/src/app/market/page.tsx      — no directive
fsi-app/src/app/map/page.tsx         — (not read here, but PERF-WAVE-2 doc lists it)
fsi-app/src/app/research/page.tsx:4  — `export const revalidate = 60;` STILL PRESENT
fsi-app/src/app/settings/page.tsx:6  — `export const revalidate = 60;` STILL PRESENT (not in claim)
fsi-app/src/app/community/page.tsx:5         — `export const dynamic = "force-dynamic";`
fsi-app/src/app/community/browse/page.tsx:15 — `export const dynamic = "force-dynamic";`
fsi-app/src/app/community/[slug]/page.tsx:13 — `export const dynamic = "force-dynamic";`
fsi-app/src/app/community/moderation/page.tsx:11 — `export const dynamic = "force-dynamic";`
```

**Reading vs. claim text:**

The claim says `revalidate` was removed on `/research`. The actual state is the opposite — `/research` is the one route where `revalidate=60` was *kept* because it doesn't read cookies, and `PERF-WAVE-2.md:75-76` says so explicitly. The wave-2 commit message correctly states this; the user-supplied claim text appears to have inverted that single bullet. Otherwise the change set matches the doc.

**Conclusion:** The actual change matches `PERF-WAVE-2.md` (`/`, `/regulations`, `/regulations/[slug]`, `/operations`, `/market`, `/map` had revalidate removed; `/research` retained). The claim sentence "revalidate removed on `/research`" is wrong; everything else lines up.

---

### Claim 3 — `/research` does single 150-row SELECT, not a 5-way concurrent fetch

**Verdict:** VERIFIED — current state is a single 150-row SELECT. The "5-way concurrent fetch" framing was either stale or describes a previous version.

**Evidence:** `fsi-app/src/app/research/page.tsx:17-67`

- `await` count: **1** (the `await supabase.from("intelligence_items").select(…)` at line 33).
- `.select()` calls: **1**.
- `Promise.all` batches: **0**.

The query body is a slim 9-column projection with `.eq("is_archived", false).order("added_date", { ascending: false }).limit(150)`. There's a `TODO(perf)` comment on line 31 noting the `.limit(150)` cap pending a "load more" UI cursor.

**Conclusion:** Current `/research` matches the 150-row single-SELECT pattern. No prior 5-way concurrent fetch survives in this file. If the original perf claim was generated from a snapshot before commit `d13a503` (perf wave 2), it's stale.

---

### Claim 4 — `pipeline_stage` is missing an index

**Verdict:** CONTRADICTED. The index exists in production.

**Evidence (live DB, Caro's Ledge project — `npx supabase db query --linked`):**

```sql
SELECT indexname, indexdef FROM pg_indexes
 WHERE tablename = 'intelligence_items' ORDER BY indexname;
```

Returns 24 indexes, including:

```
idx_intelligence_items_pipeline_stage
  CREATE INDEX idx_intelligence_items_pipeline_stage
    ON public.intelligence_items USING btree (pipeline_stage)
```

**Source migration:** `supabase/migrations/026_research_pipeline_stage.sql:29-30` (already applied — visible in live `pg_indexes`).

**Other indexes on `intelligence_items` (full list):**
`idx_intel_items_agent_integrity_flag`, `idx_intel_items_jurisdiction_iso`, `idx_intelligence_items_pipeline_stage`, `idx_items_archived`, `idx_items_compliance_object_tags`, `idx_items_domain`, `idx_items_format_urgency`, `idx_items_jurisdictions`, `idx_items_last_regenerated`, `idx_items_legacy`, `idx_items_op_scenario_tags`, `idx_items_priority`, `idx_items_region_tags`, `idx_items_related_items`, `idx_items_severity`, `idx_items_source`, `idx_items_status`, `idx_items_tags`, `idx_items_topic_tags`, `idx_items_transport`, `idx_items_urgency_tier`, `idx_items_vertical_tags`, `idx_items_verticals`, `intelligence_items_legacy_id_key`, `intelligence_items_pkey`.

**Conclusion:** Pipeline_stage has a btree index. Note the existing index is unconditional (no partial predicate). The actual `/research` query is `eq is_archived=false ORDER BY added_date DESC LIMIT 150` — `is_archived` already has a partial index `WHERE (is_archived = true)` (`idx_items_archived`) which doesn't help the `is_archived=false` filter, and `added_date` is NOT independently indexed. So the `/research` query likely seq-scans → sorts by added_date despite the pipeline_stage index. That is a real but *different* gap from what the claim asserted.

---

### Claim 5 — RSC prefetch causes 503s + connection-pool exhaustion

**Verdict:** UNVERIFIED. No runtime evidence either way; static signals are *consistent with* a fan-out risk but don't prove it.

**Evidence collected:**

- `package.json:21` — `"next": "16.1.6"`. Default `<Link>` prefetch in App Router 16 is "auto" (in production: prefetch on hover/viewport-enter).
- Sidebar (`fsi-app/src/components/Sidebar.tsx`): 11 `<Link>` instances, none with `prefetch={false}`. Grep across all of `src/` for `prefetch` returns zero matches.
- Per-request Supabase clients: `lib/supabase-server.ts:26-31` defines `getSupabase()` which calls `createClient(URL, ANON)` *every time it is called*. Inside `fetchDashboardData` and `fetchResourcesOnly` it is called multiple times per request (e.g. `fetchResourcesOnly` body at `supabase-server.ts:712` calls `getSupabase()` after `fetchWorkspaceResources` already did). Each `createClient` is an in-process object instantiation — it doesn't open a TCP connection by itself, but every PostgREST request goes over the same Vercel-region pgBouncer pool that Supabase exposes through the public REST URL. Under prefetch fan-out (e.g. 8 nav links each triggering a server-component render that issues 3-15 parallel Supabase queries), the per-region connection budget is the failure mode the claim describes.
- Live `vercel logs https://carosledge.com`: **no 503, ECONNREFUSED, or pool-exhaustion lines** in the streaming window I sampled (~25 s, low-traffic period). No build/deploy log lines either.

**What I could not verify:**

- Whether browser hover behavior actually triggers parallel server-component renders for 8 sidebar destinations under a real user session. (Would need a session with cookies, hover trace, and timed network panel.)
- Whether Supabase's per-region pool ceiling is actually being hit. The hint would be 503s clustered around nav-rich page loads in `vercel logs`, none seen.

**Conclusion:** Plausible theoretical risk; no captured runtime evidence in this investigation. To verify: open the production app in a browser with DevTools Network panel, hover across the sidebar, and watch for in-flight RSC prefetch requests fanning out + any 503 responses. Or run a multi-user load test against `/regulations` etc.

---

### Claim 6 — Sidebar prefetch causes concurrent fan-out

**Verdict:** VERIFIED in static analysis. (This is the structural sub-case of Claim 5 — and it's clear from the code.)

**Evidence:** `fsi-app/src/components/Sidebar.tsx`

- 11 `<Link>` instances total:
  - Line 59 — logo `<Link href="/">`
  - Lines 91-126 — `visibleNavItems.map(…)` rendering 9 nav items: `/`, `/regulations`, `/market`, `/research`, `/operations`, `/map`, `/admin` (admin-only), `/profile`, `/settings`
  - Line 137 — `<Link href="/community">`
- 0 `prefetch={…}` props set anywhere in the sidebar. Default behavior in Next 16 App Router production = auto-prefetch on hover and on viewport-entry.

**Server-component / Supabase-fetch destinations among those 10 nav targets (excluding admin-only):**

| Link | Server-side data fetch on render |
|---|---|
| `/` | yes — `getAppData()` ~15 queries |
| `/regulations` | yes — `getResourcesOnly()` ~3 queries |
| `/market` | yes — `getResourcesOnly()` ~3 queries |
| `/research` | yes — 1 query (slim `intelligence_items` SELECT) |
| `/operations` | yes — `getResourcesOnly()` ~3 queries |
| `/map` | yes — `getMapData()` ~5 queries |
| `/profile` | not investigated |
| `/settings` | yes — but `revalidate=60` set, so ISR can cache |
| `/community` | yes — `Promise.all` of 6 queries (`force-dynamic`) |

A user hovering across the sidebar in a few seconds plausibly triggers 6-8 of these RSC prefetches in parallel. Each renders its server component, which fires 3-15 Supabase queries. Worst case fan-out at the moment hover lands on every nav item: ~6 routes × ~8 average queries ≈ 48 concurrent PostgREST round-trips per user session per hover sweep.

**Conclusion:** Structurally, the fan-out exposure is real. Whether it actually causes 503s/pool exhaustion (Claim 5) depends on traffic and pgBouncer ceiling — not verifiable from static analysis alone.

---

## Other findings worth flagging

These came up while investigating but aren't in the 6-claim list.

### O1 — Multiple `getSupabase()` calls per request

`fetchResourcesOnly` (and its callers) creates a fresh Supabase client via `createClient()` *each time* it's invoked (`supabase-server.ts:26-31`). Specifically `fetchResourcesOnly` at line 712 calls `getSupabase()` after `fetchWorkspaceResources` already did at 374. Per request that's at least 2 client constructions. Cheap individually but pollutes the call site and means every helper has to call its own `getSupabase()`. A request-scoped singleton would be cleaner. (Not a perf hot-path on its own.)

### O2 — `/research` query is sub-optimally indexed

The actual query is `eq("is_archived", false).order("added_date", { ascending: false }).limit(150)`. Available indexes:

- `idx_items_archived` — partial on `is_archived = true` only. **Not used** by `is_archived = false`.
- No standalone index on `added_date`.

Live DB has only ~184 active rows so the seq-scan + sort is fast today, but as the table grows past a few thousand the absence of an `(is_archived, added_date DESC)` composite (or partial on `is_archived = false`) will bite. The pipeline_stage index exists but the query doesn't filter on `pipeline_stage` — so the index isn't reachable from this query.

### O3 — `idx_resources_*` indexes are dead weight

`migrations/003_indexes.sql` creates `idx_resources_priority`, `idx_resources_topic`, `idx_resources_jurisdiction`, etc. on the **legacy `resources` table**. `migrations/013_drop_legacy_tables.sql` exists in the migration list. Those indexes either dropped with the table (good — confirms by absence in live `pg_indexes` for `resources`, not investigated here) or persist on a stale shadow table. Worth a `\d resources` check next pass.

### O4 — `select("*")` on `staged_updates` ships JSONB + new full_brief column

`fsi-app/src/app/admin/page.tsx:55` and `AdminDashboard.tsx:129` both do `staged_updates.select("*").limit(100)`. Migration 007 added a `full_brief` TEXT column to `staged_updates` (`migrations/007_full_brief.sql:7`), and migration 034 added `materialization_error TEXT`. With the 100-row cap the absolute size is bounded but the principle (avoid `select("*")`) applies — once the table accumulates briefs, even 100 × 17 KB = ~1.7 MB.

### O5 — `getAppData()` still calls `fetchSourceData()` for the dashboard

`lib/data.ts:28` still wraps `Promise.all([fetchDashboardData(orgId), fetchSourceData()])`. The dashboard home (`/`) consumes `data.resources/archived/changelog/disputes/supersessions/auditDate/overrides` but I don't see it consume `data.sources/provisionalSources/openConflicts`. (Those are consumed by `/admin`, which has its own `fetchSourceData(true)` server fetch.) If verified, dropping `fetchSourceData()` from `getAppData()` saves 3 queries on `/` per render.

---

## Recommendations

For each claim, scoped at the level the user asked for (findings, not fixes).

| # | Verdict | Recommended scope if you decide to act |
|---|---|---|
| 1 — `full_brief` shipped to list views | VERIFIED | Real fix scope: rewrite `get_workspace_intelligence` RPC to omit `full_brief` (and ideally `operational_impact`, `open_questions`, `reasoning`) for list-view callers. Either two RPCs (slim + full) or a column-projection arg. Detail page (`/regulations/[slug]`) uses `fetchIntelligenceItem` which `select("*")`s a single row by id — keep that path full-fat. Estimated wire reduction: ~3 MB → ~150 KB on `/regulations`, `/operations`, `/market`. |
| 2 — `revalidate` removal | PARTIALLY VERIFIED (claim text wrong) | No action needed; the actual change set matches `PERF-WAVE-2.md`. Fix the claim text if it's regenerated for someone else. |
| 3 — `/research` is single-query | VERIFIED | No action. Note the `TODO(perf)` at line 31 about a load-more UI cursor — that's the next step when row count grows. |
| 4 — pipeline_stage index | CONTRADICTED | No action on pipeline_stage. **Different gap to log:** consider a partial composite index `(is_archived, added_date DESC) WHERE NOT is_archived` for the actual `/research` query shape (or any `intelligence_items` list filtered to active rows ordered by date). |
| 5 — RSC prefetch → 503 | UNVERIFIED | To verify: (a) browser DevTools Network panel under hover-sweep; (b) `vercel logs --since 24h` filtered for 503/timeouts during a known-traffic window; (c) Supabase project dashboard → API → ConnPool metrics. Until then, don't apply a sweeping `prefetch={false}` change — could regress UX without addressing the real cause. |
| 6 — sidebar fan-out | VERIFIED static signal | If acting: set `prefetch={false}` on the data-heavy nav links (or selectively on hover-distance > 1) and re-measure. Cheaper alternative: see fix scope from Claim 1 — once the per-route payload drops by 95%, 6× fan-out is much less alarming. Tackle Claim 1 first. |

---

## Most surprising finding

The single biggest concrete waste is **Claim 1**: 3.19 MB of `full_brief` text shipped on every render of `/regulations`, `/operations`, and `/market`, none of which display it. The per-row average is ~17 KB and the max is 39 KB. This is roughly 22× the size of all the other never-rendered text columns (reasoning, operational_impact, why_matters, what_is_it, summary) combined. Wave-2's `getResourcesOnly` doesn't help here because the underlying RPC `get_workspace_intelligence` defines the wire — and migration 007 added `full_brief` to that RPC body in October. The slim fetcher cuts query *count* (15 → 3) but the per-row payload weight inside those 3 queries is the dominant cost now.

---

## Stale-claim summary

- **Claim 2 sub-line:** "revalidate removed on `/research`" is *inverted from reality* — `/research` is the only page where `revalidate=60` was deliberately retained. Whoever wrote the claim either flipped a sign or read pre-wave-2 state.
- **Claim 3:** "5-way concurrent fetch" describes a state that no longer exists in `research/page.tsx`. The current code is a single 150-row SELECT — likely the change being claimed.
- **Claim 4:** "pipeline_stage missing indexes" is wrong against current production — the index has existed since migration 026.
- **Claims 1, 5, 6** are still live (or, for 5, plausible-but-unproven).
