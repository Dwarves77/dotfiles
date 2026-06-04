# Workspace Aggregates RPC — Dashboard Render-Stat Fix

Date: 2026-05-10 (America/New_York)
Branch context: dashboard render-derived stats fix
Migration: 068_workspace_intelligence_aggregates.sql

## Why

`WeeklyBriefing.tsx:92`, `DashboardHero.tsx:54`, and `app/page.tsx:54` all
derived counts from `data.resources`, the output of the dashboard RPC
`get_workspace_intelligence_dashboard` (064), which caps at LIMIT 50. So the
home dashboard always reported "50 regulations tracked" regardless of true
workspace size, and the four colored priority tiles read CRITICAL=50 / HIGH=0
/ MODERATE=0 / LOW=0 because the LIMIT 50 + priority sort starves the lower
buckets. Structural fix: separate aggregates from row payloads.

## STEP 1 audit

All four DashboardHero tiles, the WeeklyBriefing summary line, and the
masthead meta string in `app/page.tsx` derive counts from the same capped
50-row payload. All four shared the bug. Scope of fix: aggregates flow into
DashboardHero, the masthead meta, and WeeklyBriefing via HomeSurface.

## Migration 068

File: `supabase/migrations/068_workspace_intelligence_aggregates.sql`

New SECURITY DEFINER function:

```sql
get_workspace_intelligence_aggregates(p_org_id UUID) RETURNS jsonb
```

Returns one jsonb scalar:

```
{
  total_items, by_priority, by_status, by_jurisdiction,
  total_jurisdictions, last_updated_at
}
```

Same active-row scope filter as 064/066 inlined here (LEFT JOIN
workspace_item_overrides + drop archived-after-overrides), no LIMIT.
`by_priority` uses the merged effective_priority so it matches what
DashboardHero filters on. The shared-scope extraction (TODO refactor) is
deferred to a separate PR per the no-modify-064/066 constraint.

Applied via `node supabase/seed/apply-pending.mjs` — clean apply, no errors,
PostgREST schema cache reloaded.

## Verified scalar values for org `a0000000-0000-0000-0000-000000000001`

```
total_items:         636
by_priority:         { CRITICAL: 52, HIGH: 143, MODERATE: 141, LOW: 300 }
by_status:           { adopted: 7, in_force: 20, proposed: 2, monitoring: 607 }
total_jurisdictions: 396
last_updated_at:     2026-05-10T22:24:48.373492+00:00
```

Cross-check: 52 + 143 + 141 + 300 = 636 = total_items. by_status sums to 636.
Dashboard payload contains 50 rows of which 50 are CRITICAL — confirms the
predicted bug pattern (capped + urgency-sorted = 50 CRITICAL, 0 in lower
buckets).

Note: total_jurisdictions=396 is high because the raw `jurisdictions[]`
column has heavy token-level fragmentation (e.g., "EU"/"eu"/"European Union"
all distinct). That is an upstream data-hygiene issue, not an RPC bug. The
aggregates report the actual cardinality of distinct non-empty tokens after
unnest+trim. Operator's >>100x guardrail not tripped (12.7x cap-to-total).

## Files touched

| Path | Change |
|---|---|
| `supabase/migrations/068_workspace_intelligence_aggregates.sql` | New: aggregates RPC + scope filter inlined to match 064/066 |
| `src/lib/supabase-server.ts` | New: `WorkspaceAggregates` type + `fetchWorkspaceAggregates(orgId)` with empty-default fallback |
| `src/lib/data.ts` | New: `cachedWorkspaceAggregates` (60s TTL, APP_DATA_TAG) + public `getWorkspaceAggregates()`; type re-export |
| `src/app/page.tsx` | Fetch aggregates in parallel with getAppData via Promise.all; masthead meta uses `aggregates.totalItems`/`totalJurisdictions`; passes aggregates to DashboardHero and HomeSurface |
| `src/components/home/DashboardHero.tsx` | New optional `aggregates` prop; tile counts read from `aggregates.byPriority` when supplied, fall back to row-derived for callers that pass un-capped rows (e.g., /regulations) |
| `src/components/home/HomeSurface.tsx` | New required `aggregates` prop; pipes through to WeeklyBriefing |
| `src/components/home/WeeklyBriefing.tsx` | New required `aggregates` prop; summary string reads `totalItems`/`totalJurisdictions` from aggregates with row-derived fallback; `briefing.newR.length` retained for "N new this week" tail per spec |

## Cache invalidation behavior

`getWorkspaceAggregates` is wrapped in `unstable_cache` keyed by orgId with
60s revalidate and `APP_DATA_TAG`. The override and staged-update mutation
routes already call `revalidateTag(APP_DATA_TAG)`, so aggregates and the
dashboard row payload invalidate in lockstep — counts and rows stay
consistent across mutation boundaries.

## Build

`npm run build` — clean. Zero TypeScript errors. Pre-existing 2MB cache
warning unrelated (concerns `cachedAppData` payload, not aggregates which
are <1KB).

## /regulations compatibility

`DashboardHero` is also rendered by `/regulations`, which uses
`getListingsOnly` (un-capped). To honor the no-touch constraint on the
four-route audit work, the aggregates prop is OPTIONAL: when omitted the
component falls back to row-derived counts (correct for /regulations) and
behavior is unchanged on that route.

## Hand-off

Ready for operator to dev-run and visually confirm: home dashboard masthead,
the four priority tiles, and the WeeklyBriefing summary should now show
real workspace totals (636 / 52 / 143 / 141 / 300 / 396) instead of the
LIMIT-50 artifacts.
