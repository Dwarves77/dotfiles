# Perf Hotfix — Slim Workspace RPC + Sidebar Prefetch

Branch: `perf/full-brief-slim-and-prefetch`
Date: 2026-05-05
Refs: `docs/PERF-PROFILING-FINDINGS.md` Claims 1 + 6.

## Two changes

### 1. Slim workspace RPC for list views

New migration `fsi-app/supabase/migrations/047_workspace_intelligence_slim_rpc.sql`
adds `get_workspace_intelligence_slim(p_org_id UUID)` — a sibling of the
existing `get_workspace_intelligence` RPC that omits four wide TEXT/array
columns the list surfaces never render:

| Column | Reason dropped |
|---|---|
| `full_brief` (TEXT) | Avg ~17 KB / row, sum ~3.19 MB across 184 active rows. Rendered only on `/` Dashboard + `/regulations/[slug]`. |
| `operational_impact` (TEXT) | Not referenced by any list surface. |
| `open_questions` (TEXT[]) | Not referenced by any list surface. |
| `reasoning` (TEXT) | Not referenced by any list surface. |

Kept on the slim variant: `summary` (used by client search filter on
`/regulations`), `what_is_it`, `why_matters`, `key_data` (preview blocks
some surfaces still render), all jurisdiction/transport/vertical/
status/severity/priority/date columns, and the `effective_*` workspace-
override merge.

`fetchWorkspaceResources(orgId, { slim: true })` now selects between the
two RPCs at call time. Resource mapping leaves `Resource.fullBrief`
undefined when called slim — list components never read it. The full RPC
path is unchanged for the Dashboard home and the regulation detail page.

### 2. Sidebar prefetch disabled on data-heavy nav targets

`fsi-app/src/components/Sidebar.tsx` adds `prefetch={false}` on the eight
nav targets whose server components fire Supabase queries on render:
`/`, `/regulations`, `/market`, `/research`, `/operations`, `/map`,
`/admin`, `/community`. The remaining links (logo, `/profile`, `/settings`)
keep Next.js's auto-prefetch default — `/settings` is ISR-cached
(`revalidate = 60`) and `/profile` was not flagged as data-heavy.

This stops a hover-sweep across the sidebar from triggering 6-8 parallel
RSC renders (each fan-out: 3-15 Supabase round-trips). Click latency is
preserved by Next's in-flight RSC handling.

## Wired call sites

| Function | RPC selected |
|---|---|
| `fetchDashboardData` (`/`, `/regulations/[slug]` via `getAppData`) | full |
| `fetchResourcesOnly` (`/regulations`, `/operations`, `/market` via `getResourcesOnly`) | **slim** |
| `fetchMapData` (`/map` via `getMapData`) | **slim** |
| `fetchIntelligenceItem` (`/regulations/[slug]`) | direct `intelligence_items` SELECT (unchanged — needs `full_brief`) |

## Estimated payload reduction

Per `PERF-PROFILING-FINDINGS.md`: 184 active rows × avg 17,352 chars of
`full_brief` = **3.19 MB** removed from the wire on every render of
`/regulations`, `/operations`, `/market`, `/map`. Plus ~142 KB from the
other three dropped columns combined. Total savings: ~3.33 MB per render
on those four surfaces.

## Verification

1. Apply migration 047 to Supabase (CI / `npx supabase db push`).
2. Verify RPC exists: `SELECT proname FROM pg_proc WHERE proname LIKE 'get_workspace_intelligence%';` should return both `get_workspace_intelligence` and `get_workspace_intelligence_slim`.
3. Smoke `/regulations`, `/operations`, `/market`, `/map` — cards should render identically (priority, jurisdiction, tags, timeline, deadline).
4. Smoke `/` and `/regulations/[slug]` — full_brief content should still render where it always has.
5. DevTools Network panel: hover-sweep across sidebar should no longer fire RSC prefetches for the 8 data-heavy targets.
