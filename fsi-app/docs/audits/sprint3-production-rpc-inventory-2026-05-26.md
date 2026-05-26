# Sprint 3 — Production RPC Inventory + Migration Mapping

**Date:** 2026-05-26
**Status:** Steps 1 + 3 COMPLETE (code-side, lead-runnable). Steps 2 + 4 require operator-side production access.

## Vercel build log evidence (operator-supplied)

```
[perf] /market data 48ms (category-routed=0, fallback=119)
[perf] /operations data 34ms (category-routed=0, fallback=119)
[research] get_research_source_coverage error: Could not find the function
            public.get_research_source_coverage without parameters in the schema cache
[perf] /research data 117ms (pipeline=0, category-routed=0, coverage_cells=0)
```

Confirms: 3 customer-facing intelligence surfaces (/research, /market, /operations) running on the empty / seed-fallback path because the category-routing RPC layer is failing on production.

## Step 1 — Complete RPC inventory referenced by build-time code

Surfaced via grep across `src/lib/` and `src/app/`:

**Category-routing + research-coverage** (the build-log culprits):
- `get_market_intel_items`
- `get_operations_items`
- `get_research_items`
- `get_research_source_coverage` ← confirmed missing on prod per build log
- `get_source_citation_stats` (citation chips enrichment)

**Workspace intelligence variants** (the regulations control + dashboard paths):
- `get_workspace_intelligence` (full payload)
- `get_workspace_intelligence_aggregates` (totals)
- `get_workspace_intelligence_aggregates_scoped` (regulations masthead uses this; works clean per A1 verify ⇒ likely PRESENT on prod)
- `get_workspace_intelligence_dashboard` (home dashboard projection)
- `get_workspace_intelligence_listings` (regulations + map listings)
- `get_workspace_intelligence_slim` (operations/market slim)

**Adjacent RPCs** (worth confirming since the cluster of missing functions could be broader):
- `detect_intersections` (admin intersections view)
- `community_region_counts` (/community region cards)
- `admin_attention_counts` (admin queue)

## Step 3 — Migration that creates each function

Grepped `supabase/migrations/*.sql` for `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION` matching each function name. First-creating migration is the primary; subsequent ones are CREATE OR REPLACE updates (also required for the function to have its current shape on prod).

| Function | First-create migration | Update migrations (CREATE OR REPLACE) |
|---|---|---|
| `get_market_intel_items` | **070_phase1_routing_rpcs** | 071, 073, 077, 084 |
| `get_operations_items` | **070_phase1_routing_rpcs** | 071, 073, 077, 084 |
| `get_research_items` | **070_phase1_routing_rpcs** | 071, 073, 077, 084 |
| `get_research_source_coverage` | **100_research_source_coverage_rpc** | (none) |
| `get_source_citation_stats` | **088_citation_stats_rpc** | 098_get_source_citation_stats_edge_table |
| `get_workspace_intelligence` | **006_multi_tenant** | 007, 077 |
| `get_workspace_intelligence_aggregates` | **068_workspace_intelligence_aggregates** | 073, 077 |
| `get_workspace_intelligence_aggregates_scoped` | **069_workspace_intelligence_aggregates_scoped** | 073, 077 |
| `get_workspace_intelligence_dashboard` | **064_workspace_intelligence_dashboard_rpc** | 071, 073, 077 |
| `get_workspace_intelligence_listings` | **066_workspace_intelligence_listings_rpc** | 071, 073, 077 |
| `get_workspace_intelligence_slim` | **047_workspace_intelligence_slim_rpc** | 077 |

## High-confidence inference from build log + step 3

The build log shows `/regulations` works (per the A1 verify confirming aggregates 318 on production via the same code path). `/regulations` uses `get_workspace_intelligence_aggregates_scoped` (migration **069**). So 069 is applied on prod.

The build log shows `/research`, `/market`, `/operations` all returning category-routed=0. These all depend on functions created in migration **070** + updated in **071, 073, 077, 084**.

**Most likely production-state inference (operator confirms via Step 2 + Step 4):**
- Migration 069 applied (regulations works)
- Migration 070 likely **NOT applied** (or partially) → the 3 category-routing RPCs don't exist on prod → /research, /market, /operations fall to empty / seed
- Migration 100 **NOT applied** → `get_research_source_coverage` explicitly missing per build log
- Possibly missing: 071, 073, 077, 084 (the CREATE OR REPLACE updates) — if 070 is missing, these subsequent updates would fail too because they can't REPLACE a function that doesn't exist (depends on whether each migration uses OR REPLACE only or starts with DROP + CREATE)
- Production migration cliff: somewhere between 069 (applied) and 070 (missing)

This is a multi-migration gap, not a single missing function.

## Cluster of likely-missing migrations to query in Step 4

Based on the inference above, operator's Step 4 query should at minimum cover:

```sql
SELECT version, name, executed_at FROM supabase_migrations.schema_migrations
WHERE version >= '070' AND version <= '106'
ORDER BY version;
```

Specifically focused on:
- 070 (phase1_routing_rpcs) — high-confidence missing
- 071 (deterministic_tiebreaker)
- 073 (shared_workspace_scope)
- 077 (rpc_membership_checks) — also adds auth.uid() checks; if missing, anon calls might work but recently-added behavior is gone
- 084 (sources_canonical_category) — the source.category routing taxonomy
- 088 (citation_stats_rpc) — citation chips
- 098 (get_source_citation_stats_edge_table)
- 100 (research_source_coverage_rpc) — confirmed missing per build log
- 102 (severity_band_theme_columns) — A2 commit 1 depends on this
- 103 (intelligence_item_sections) — A5 depends on this
- 104 (community_post_intelligence_refs)
- 105 (profiles_projection) — A3 backfill ran against this; if missing on prod, the A3 backfill never applied to prod data
- 106 (regions_and_facts) — A6 depends on this

## 4-column report (lead fills cols 1 + 3, operator fills cols 2 + 4)

```
| Function                                       | Present on prod | First-create migration | Migration applied on prod |
|------------------------------------------------|-----------------|------------------------|---------------------------|
| get_market_intel_items                         | [OPERATOR]      | 070                    | [OPERATOR]                |
| get_operations_items                           | [OPERATOR]      | 070                    | [OPERATOR]                |
| get_research_items                             | [OPERATOR]      | 070                    | [OPERATOR]                |
| get_research_source_coverage                   | NO (confirmed)  | 100                    | [OPERATOR]                |
| get_source_citation_stats                      | [OPERATOR]      | 088                    | [OPERATOR]                |
| get_workspace_intelligence                     | [OPERATOR]      | 006                    | YES (assumed)             |
| get_workspace_intelligence_aggregates          | [OPERATOR]      | 068                    | [OPERATOR]                |
| get_workspace_intelligence_aggregates_scoped   | YES (inferred)  | 069                    | YES (inferred)            |
| get_workspace_intelligence_dashboard           | [OPERATOR]      | 064                    | [OPERATOR]                |
| get_workspace_intelligence_listings            | [OPERATOR]      | 066                    | [OPERATOR]                |
| get_workspace_intelligence_slim                | [OPERATOR]      | 047                    | [OPERATOR]                |
```

`get_workspace_intelligence_aggregates_scoped` (migration 069) inferred PRESENT from /regulations masthead showing 318 on production matching the A1 dev reconciliation D1 count.

## Step 2 operator queries (production Supabase)

Single combined query:

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_market_intel_items',
    'get_operations_items',
    'get_research_items',
    'get_research_source_coverage',
    'get_source_citation_stats',
    'get_workspace_intelligence',
    'get_workspace_intelligence_aggregates',
    'get_workspace_intelligence_aggregates_scoped',
    'get_workspace_intelligence_dashboard',
    'get_workspace_intelligence_listings',
    'get_workspace_intelligence_slim'
  )
ORDER BY routine_name;
```

## Step 4 operator query (production Supabase)

```sql
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
WHERE version IN (
    '006', '047', '064', '066', '068', '069',
    '070', '071', '073', '077', '084', '088', '098', '100',
    '102', '103', '104', '105', '106'
  )
ORDER BY version;
```

## Likely fix shape (per operator's instruction)

If Step 4 confirms migrations 070, 071, 073, 077, 084, 100 (etc.) missing on production: **operator runs `supabase db push` against production OR applies migrations manually via dashboard**. No code change required.

After migration apply: wait 60s for `unstable_cache` TTL to clear OR trigger schema-cache reload (`NOTIFY pgrst, 'reload schema'` in SQL editor) for immediate PostgREST cache refresh. /research should recover to 13 items.

## What I am NOT doing (per operator instruction)

- Not modifying migration files.
- Not changing page.tsx fallback logic.
- Not redeploying.
- Not running schema-cache reload pre-confirmation.
- Not writing the SF-1 silent-fallback patch yet (separate dispatch after current regression resolves).

## Severity update

The hypothesis-4 confirmation **upgrades the symptom from /research-only to 3-surface intelligence platform regression**. /market and /operations are running on 119-row seed fallback. Customer's $500/mo product is currently showing seed/empty content across three of its four intelligence domain surfaces.

Priority CRITICAL. A1 status remains APPLIED-PENDING-PRODUCTION-VERIFICATION. All A-series implementation held.

## Reporting back

Steps 1 + 3 complete (this artifact). Operator runs Step 2 + Step 4 queries and pastes results back. Then I synthesize the final 4-column report and propose the migration-apply sequence.
