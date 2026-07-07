# Hotfix 3 — Performance Audit (Investigation Only)

**Date:** 2026-05-07
**Branch:** `perf/hotfix-3-perf-audit` (worktree off `0a9f681`)
**Author:** autonomous agent per `docs/FINISHING-DISPATCH-2026-05-06.md` Hotfix 3
**Phase:** investigation only — no source code modified
**Baseline:** `docs/perf-snapshot-2026-05-06.txt` (PR #30 measurement foundation)
**Current snapshot:** `docs/hotfix-3-perf-snapshot-2026-05-07.txt`

This is the measurement-evidence dispatch the perf playbook requires before
any "perf wave" lever is pulled. Per `docs/PERF-PLAYBOOK.md` and the
`fsi-app/.claude/CLAUDE.md` "Perf Work Discipline" rule: no perf dispatch
without evidence. The deliverable below is that evidence — fixes await
explicit Jason auth.

Real-user RUM (Speed Insights / Analytics) is deferred per the playbook's
traffic threshold; this audit uses build-time bundle analysis + the
`[perf]` server-timing log scaffolding already in the codebase as the
substitute instruments.

---

## 1. Snapshot diff vs baseline

Wave 1 (PR #29) delivered the measurement foundation. Wave 2 + Wave 3 then
shipped Market Intel content pattern (#36), Regulations sector chips +
facets (#34), Regulation detail components (#38), Profile + Settings
restorations (#40), and Community Phase D (#41). Some entry-chunk growth
is expected. The table below quantifies it and flags the disproportionate
deltas.

```
Route                  | Entry baseline | Entry now | ΔEntry | Δ%    | Route-only Δ | All-client Δ
-----------------------|----------------|-----------|--------|-------|--------------|--------------
/                      |  312.1 kB      | 314.3 kB  | +2.2   | +0.7% |   0.0        | +2.2
/admin                 |  412.6 kB      | 414.9 kB  | +2.3   | +0.6% |  +0.1        | +2.3
/community             |  312.2 kB      | 314.6 kB  | +2.4   | +0.8% |  +0.2        | +2.3
/community/browse      |  319.4 kB      | 321.7 kB  | +2.3   | +0.7% |  +0.1        | +2.4
/login                 |  282.0 kB      | 284.2 kB  | +2.2   | +0.8% |   0.0        | +2.2
/map                   |  296.6 kB      | 298.8 kB  | +2.2   | +0.7% |   0.0        | +2.2
/market                |  298.3 kB      | 312.7 kB  | +14.4  | +4.8% | +12.2        | +14.4
/onboarding            |  305.1 kB      | 307.3 kB  | +2.2   | +0.7% |   0.0        | +2.2
/operations            |  299.6 kB      | 302.5 kB  | +2.9   | +1.0% |  +0.7        | +3.0
/profile               |  297.5 kB      | 309.3 kB  | +11.8  | +4.0% |  +9.6        | +11.7
/regulations           |  303.9 kB      | 325.5 kB  | +21.6  | +7.1% | +19.4        | +21.5
/regulations/[slug]    |  456.3 kB      | 471.0 kB  | +14.7  | +3.2% | +12.5        | +14.6
/research              |  297.6 kB      | 299.7 kB  | +2.1   | +0.7% |  -0.1        | +2.1
/settings              |  316.0 kB      | 337.7 kB  | +21.7  | +6.9% | +19.5        | +21.7

Shared layout chunks   |  278.6 kB      | 280.8 kB  | +2.2   | +0.8% |   —          |   —
```

### Top 3 routes by absolute Entry delta
1. **/settings** +21.7 kB (+6.9%)
2. **/regulations** +21.6 kB (+7.1%)
3. **/regulations/[slug]** +14.7 kB (+3.2%) — already the biggest route at 471 kB First Load
4. (tied) **/market** +14.4 kB (+4.8%)
5. **/profile** +11.8 kB (+4.0%)

The shared-layout chunk grew +2.2 kB, which propagates as ~+2.2 kB on
every route (visible in the unflagged routes' entry lines). This is
universal background growth, not a route-specific regression.

---

## 2. Bundle composition — why the deltas exist

`@next/bundle-analyzer` is wired (`next.config.ts` checks `ANALYZE=true`)
but does not emit HTML reports under Next 16 + Turbopack on this stack —
the analyzer is webpack-only and Next 16's default builder is Turbopack.
So composition is inferred from the source-tree layout of route entries.

### /settings (+21.7 kB)
`SettingsPage.tsx` is a tabbed shell with seven tabs:
General · Dashboard · Exports · Saved searches · Data · Archive · Help.
All seven panels are imported statically:

```ts
import { DashboardSettings } from "@/components/settings/DashboardSettings";        // 261 LOC
import { DataSummary } from "@/components/settings/DataSummary";                    //  92 LOC
import { SupersessionHistory } from "@/components/settings/SupersessionHistory";    //  79 LOC
import { ArchiveViewer } from "@/components/settings/ArchiveViewer";                // 120 LOC
import { NotificationPreferences } from "@/components/profile/NotificationPreferences"; // 337 LOC (PR-L)
import { BriefingScheduleSection } from "@/components/settings/BriefingScheduleSection"; // 465 LOC (PR-L)
import { SavedSearchesSection } from "@/components/settings/SavedSearchesSection";  // 341 LOC (PR-L)
import { HelpSection } from "@/components/settings/HelpSection";                    // 204 LOC (PR-L)
```

Only the **General** tab renders on first paint. The other six tabs'
component code sits in the entry chunk doing nothing until the user
clicks the tab. Wave 3 PR-L (#40) restored four of those sections —
exactly the size of the regression.

### /regulations (+21.6 kB)
`RegulationsSurface.tsx` (1658 LOC, "use client") added Wave 3 sector
chip system + facets (#34):
- `SectorChipFilter` (198 LOC, REGULATIONS_SECTOR_CHIPS table)
- `ConfidenceFacet` (130 LOC, AUTHORITY_LEVELS)
- `SortRow` (83 LOC) and `ViewToggles` (73 LOC)
- `BulkSelectBar` (199 LOC, watchlist + bulk actions)

All five components are statically imported and render on initial paint
(facets are visible by default). The +19.4 kB route-only delta tracks
roughly with their LOC totals. This is functional payload, not waste —
the facets aren't a tab, they're the page chrome.

### /regulations/[slug] (+14.7 kB on top of an already-471-kB route)
PR-F (#38) added right-rail components (AffectedLanesCard, OwnerTeamCard,
LinkedItemsCard) + tab content under `RegulationDetailSurface.tsx`
(1535 LOC). The detail surface is itself a 5-tab shell
(Summary · Exposure · Penalty · Timeline · Sources) where only Summary
is visible on first paint, but all five panels' JSX trees are in the
client bundle.

### /market (+14.4 kB)
PR-G (#36) Market Intel content pattern added six new sections:
KeyMetricsRow (220), CostTrajectoryChart (90, placeholder no chart lib),
PolicySignals (283), FreightRelevanceCallout (89), OwnersContent (166),
WatchlistSidebar (186). All six render on the active tab. Two-tab page
(Tech Readiness / Price Signals) — only one tab paints first.

### /profile (+11.8 kB)
PR-L (#40) Decision #15: Sector profile, jurisdictions, verifier tabs
restored. `UserProfilePage.tsx` (1002 LOC) imports SectorSelector,
AtAGlanceBlock, QuickLinksSection statically; eight tabs total but only
Personal renders on first paint.

### Shared layout (+2.2 kB)
PR `3f5d735` (#35) IA refactor added the user-footer dropdown
(`UserMenu.tsx`) and Community mid-rail wiring. UserMenu loads in the
shell on every route — propagates to every route's First Load JS.

---

## 3. Top bottlenecks ranked by impact

| # | Bottleneck | Routes | Route-only kB | Fix shape | Effort |
|---|------------|--------|---------------|-----------|--------|
| 1 | **Tab-deferred panels statically imported** | /settings, /regulations/[slug], /market, /profile | ~12–20 kB per route | `next/dynamic({ ssr: false })` from inside the client tab shell, keyed on active tab | M |
| 2 | **lucide-react not in `optimizePackageImports`** | every route (87 import sites) | unknown — needs analyzer | Add `experimental.optimizePackageImports: ["lucide-react"]` to `next.config.ts`; rebuild and remeasure | XS |
| 3 | **Uncached supabase count on /regulations** | /regulations | 0 kB (server side) | Wrap the platform-total `select id count exact` in `unstable_cache` keyed by domain or move into the existing `getResourcesOnly` cache | XS |
| 4 | **`UserMenu` in shared layout, not deferred** | every route (+2.2 kB) | ~2 kB | Audit `UserMenu` imports; defer the dropdown panel to client-only with `dynamic({ ssr: false })` while keeping the trigger SSR'd | S |
| 5 | **`RegulationsSurface` 1658 LOC monolith on entry** | /regulations | up to 19 kB | Split kanban-vs-table-vs-dense view code into separate chunks loaded on view-toggle change | L |

### Per-bottleneck recommendation

#### 1. Tab-deferred panels (M, **HIGHEST IMPACT**)
**Symptom**: a tab shell loads all N panel components on initial paint.
The user pays full bundle cost to look at one panel.
**Lever**: `next/dynamic(import("./Panel"), { ssr: false })` from inside
the client tab shell, switched on `tab === "x"`. Unlike the failed
2026-05-06 wave (which wrapped components from server pages with
`ssr: true`), this is from a `"use client"` component with `ssr: false`,
which DOES move chunks out of the entry per the playbook anti-pattern
note.
**Estimated win**: each non-default tab on /settings (~3-4 kB each × 6
tabs) → ~15-18 kB off entry. Similar leverage on /regulations/[slug],
/market, /profile.
**Risk**: deferred tabs flash a loading state on first click. Acceptable
for settings/profile-style pages where tab switching is interactive,
not on the critical path.
**Recommendation**: **AWAIT-JASON-AUTH** — proven pattern, but
architectural choice (when to defer, accepting the tab-click flash
trade-off, whether to pre-prefetch on hover).

#### 2. lucide-react `optimizePackageImports` (XS, easy win)
**Symptom**: 87 files import named icons from `lucide-react`. Without
the Next compiler hint, each import can pull the icon registry's barrel
file into more chunks than necessary.
**Lever**: one line in `next.config.ts`:
```ts
experimental: { optimizePackageImports: ["lucide-react"] }
```
Next 16 rewrites these to deep imports automatically.
**Estimated win**: unknown without analyzer (which is webpack-only
on this stack). Likely 2-8 kB shared layout reduction; possibly more.
**Risk**: low — Next 16 stable feature.
**Recommendation**: **AWAIT-JASON-AUTH** — XS effort, but per the
playbook, pilot ONE config change and remeasure before scaling. Worth
the round-trip.

#### 3. Uncached `intelligence_items` count on /regulations (XS, server-side)
**Symptom**: `/regulations/page.tsx` lines 38-56 spin up a fresh
`createClient(...)` and run `select("id", { count: "exact", head: true })
.eq("domain", 1).eq("is_archived", false)` on every render to populate a
tooltip number. Result is the same for every viewer of every workspace
until items are archived — perfect cache candidate.
**Lever**: wrap in `unstable_cache(..., ["regulations-platform-total"],
{ revalidate: 300 })` or fold into the existing `getResourcesOnly`
fetcher's cached path. Either drops one Supabase round-trip per
/regulations render.
**Estimated win**: ~1 round-trip (~50-150ms) off TTFB on /regulations
cold renders. Doesn't move bundle bytes; moves server timing.
**Risk**: very low. The number is workspace-agnostic.
**Recommendation**: **AWAIT-JASON-AUTH** — XS effort but it's a behavior
change to a server query path; worth a one-line review.

#### 4. UserMenu in shared layout (S)
**Symptom**: every route's First Load JS grew +2.2 kB after IA refactor
(#35) added `UserMenu`. The dropdown menu's full panel (state for menu
open/closed, auth-status hook, lucide icons) ships in the shared chunk.
**Lever**: extract a thin trigger button to remain SSR-rendered and
client-hydrate ONLY on user interaction. Or `dynamic({ ssr: false })`
the menu panel itself behind a `useState(false)` open guard.
**Estimated win**: ~1.5-2 kB off the shared layout (counted on every
route).
**Risk**: moderate — affects auth-state visibility on every page. Needs
care to preserve "logged in / logged out" visual cue without a flash.
**Recommendation**: **AWAIT-JASON-AUTH** — small-effort but visible to
every user every render.

#### 5. RegulationsSurface 1658-LOC monolith (L, **DEFER**)
**Symptom**: `RegulationsSurface.tsx` packs kanban + dense list + table
view + chip filters + bulk select + watchlist into one file. Splitting
across view modes would let `?view=table` not pay for kanban code etc.
**Lever**: extract per-view chunks (`KanbanView.tsx`, `TableView.tsx`,
`DenseListView.tsx`) and `dynamic`-import on view-mode change.
**Estimated win**: theoretical 8-12 kB off entry on default view, but
high architectural cost and the file is fresh (PR #34 still warm). Risk
of introducing rendering bugs in a heavily-trafficked surface.
**Recommendation**: **DEFER** to a dedicated PR with its own measurement
step. Per the dispatch's halt clause: "Fix requires architectural change
(defer to dedicated PR — surface in audit doc)." This one qualifies.

---

## 4. Server-side query profiling (read-only inspection)

The data layer (`fsi-app/src/lib/data.ts`, `supabase-server.ts`) is in
good shape post-PR #29:
- `getAppData()` is wrapped in `unstable_cache` keyed by `orgId`, 60s
  TTL, `app-data` revalidation tag for mutation invalidation.
- `getResourcesOnly`, `getMapData`, `getSettingsData` are slim fetchers
  (~3-5 queries each, vs 15 for full `getAppData`).
- `[perf]` console.log timings are present in every page entry (visible
  in dev / Vercel function logs).

**The one server-side wart found:** `/regulations/page.tsx` runs an
**uncached** `createClient` + `select("id", { count: "exact" })` on
every render to populate a tooltip number. See bottleneck #3 above.

No N+1 query shapes were found in the page entries. No unsafe
`select("*")` patterns on hot paths (the one in
`fetchIntelligenceItem` is an item-detail query for a single row, not a
list scan).

---

## 5. Hydration timing per surface

Cannot produce real-user hydration timings without RUM (deferred per
playbook). Best-effort signals from the codebase:

| Route | Top-level client component LOC | Hydration weight |
|-------|-------------------------------:|------------------|
| /settings | SettingsPage 317 + 8 sections (1880 total) | High (7-tab shell, all tabs eager) |
| /regulations | RegulationsSurface 1658 | High (single file, all views eager) |
| /regulations/[slug] | RegulationDetailSurface 1535 | High (5-tab shell, all tabs eager) |
| /market | MarketPage 747 + 6 sections (1781 total) | Med (2-tab shell, all sections eager) |
| /profile | UserProfilePage 1002 + 5 sections (1853 total) | High (8-tab shell, all tabs eager) |
| / | HomeSurface (server-shell + client sections) | Med (mixed RSC + client) |
| /map | MapView (Leaflet, dynamic ssr:false) | Low — already dynamic |

The same root cause produces both bundle waste AND hydration cost:
**eagerly-imported tab/view panels**. Bottleneck #1's fix (defer
non-default panels) addresses both.

---

## 6. Image and font loading

No analyzer view available (Turbopack), so this is best-effort from the
source tree:
- `public/` is small. No images of consequence land in route entries.
- No `next/font` calls were found to be missing — fonts are loaded via
  `app/globals.css` declarations consistent with the layout. `font-display`
  semantics are inherited from the CSS, not flagged here.

This dispatch surfaces no image/font bottleneck. **NO ACTION**.

---

## 7. Decision matrix

| ID | Lever | Recommendation | Reason |
|----|-------|----------------|--------|
| 1 | Tab-deferred dynamic imports (settings/profile/market/detail) | **AWAIT-JASON-AUTH** | Highest-impact lever (~15-20 kB reachable per affected route). Architectural choice on tab-flash trade-off. |
| 2 | lucide-react `optimizePackageImports` | **AWAIT-JASON-AUTH** | XS one-line change, but per playbook pilot-one-and-measure; worth Jason's go-ahead before scaling. |
| 3 | Cache `/regulations` platform-total count | **AWAIT-JASON-AUTH** | XS server-side change. Workspace-agnostic value, perfect cache candidate. |
| 4 | Defer UserMenu panel from shared layout | **AWAIT-JASON-AUTH** | Affects every route + visible auth cue. Small but careful. |
| 5 | Split RegulationsSurface monolith | **DEFER** | Architectural change, dedicated PR per dispatch halt clause. |

**No items recommended for APPLY-AUTONOMOUSLY.** The Hotfix 3 contract
is explicit: "perf optimization choices have real architectural
implications" — every fix here passes through Jason for go/no-go on
which to apply.

---

## 8. What was NOT done in this dispatch

Per file-scope hard constraint, no source code, components, configs, or
scripts were modified. Only two files were written:
- `docs/hotfix-3-perf-audit-2026-05-07.md` (this file)
- `docs/hotfix-3-perf-snapshot-2026-05-07.txt` (current `npm run perf:bundles` output)

No commits to source. No `next.config.ts` edits. No component
refactors. No Supabase query changes. The investigation IS the
deliverable; writes phase awaits explicit auth.

---

## 9. Suggested writes-phase dispatch shape (for Jason)

If Jason authorizes any subset, the suggested writes dispatch order is:

1. **Pilot ONE change first** (per playbook anti-pattern note). Recommend
   #2 (lucide-react optimizePackageImports) as the pilot — XS, low risk,
   measures cleanly via `npm run perf:bundles` before/after.
2. If pilot moves the metric meaningfully, scale to #1 (tab-deferred
   dynamics) on /settings only as the next pilot — measure before going
   to /profile, /market, /detail.
3. #3 (uncached count) and #4 (UserMenu) are independent and can ship in
   parallel; recommend bundling with the tab-defer work.
4. #5 (RegulationsSurface split) lives in its own PR with its own
   measurement step.

If Jason says "skip everything, current bundles are acceptable for the
pilot phase," that's also a valid outcome — the audit shows the largest
single-route entry is 471 kB on /regulations/[slug], which is in the
range Next 16 ships from many production apps. The +21.7 kB on /settings
is the biggest absolute gain and the cheapest to recover, but absolute
size is still well under the 500 kB threshold where browsers start
visibly stalling on mid-tier mobile.
