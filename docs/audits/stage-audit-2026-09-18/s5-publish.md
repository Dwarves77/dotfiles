# s5-publish: stage audit 2026-09-18

Method: read code in `C:\Users\jason\dotfiles\.worktrees\wt-session-c` (repo HEAD `806c0c48910c`, 2026-09-18,
master `3da30b22` plus one docs commit, per the common brief); ran read-only SELECT/`pg_get_functiondef`
queries against the live Supabase project via `scripts/lib/pg-conn.mjs`; ran plain HTTP GETs against
`https://carosledge.com`. No writes, no build, no test suite, no browser render, no agents spawned.

## The table

| Component | Where (file / workflow / table) | 1 Reachable | 2 Run | 3 Populated | 4 Visible | 5 Gated | 6 Documented | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Regulations list | `src/app/regulations/page.tsx` -> `RegulationsLedger.tsx` -> `get_workspace_intelligence_listings`/`_slim` | YES [CONFIRMED] file read | YES [CONFIRMED] `GET https://carosledge.com/regulations` = 200 | YES [CONFIRMED SQL] 1,321 verified non-archived `regulations`-surface items | PARTIAL [HYPOTHESIS] `StateNote`/`ListSurfaceShell` honest-empty pattern present in code; not screenshot-confirmed this session (no browser opened) | YES [CONFIRMED SQL] RPC chain resolves through `_workspace_active_items`, which filters `ii.provenance_status = 'verified'` (see cross-cutting row below) | YES [CONFIRMED] `caros-ledge-platform-intent`, CLAUDE.md ratified five-surface model | PARTIAL | `pg_get_functiondef` on both RPCs; SQL count above; HTTP GET above |
| Regulations detail | `src/app/regulations/[slug]/page.tsx` -> `RegulationDetailSurface.tsx` | YES [CONFIRMED] | YES [CONFIRMED] production 200 (route exists per file read; slug not independently fetched) | YES [CONFIRMED SQL] same 1,321 | PARTIAL [HYPOTHESIS] detail fetchers use `select("*")` direct against `intelligence_items`, same provenance gate applied client-side per `supabase-server.ts` comments | YES [CONFIRMED] | YES [CONFIRMED] | PARTIAL | file read, SQL count |
| Market Intel list | `src/app/market/page.tsx` -> `fetchMarketSeriesBoard`/`get_market_intel_items` | YES [CONFIRMED] | YES [CONFIRMED] 200 | YES [CONFIRMED SQL] 54 verified non-archived `market`-surface items | PARTIAL [HYPOTHESIS] same pattern as Regulations | YES [CONFIRMED SQL] `get_market_intel_items` def contains `provenance_status`+`verified` | YES [CONFIRMED] | PARTIAL | `pg_get_functiondef`, SQL count, HTTP GET |
| Market Intel detail | `src/components/pages/MarketSignalDetailSurface.tsx` | YES [CONFIRMED] | YES [CONFIRMED] 200 | YES [CONFIRMED SQL] same 54 | PARTIAL [CONFIRMED, file read] uses `isRecord = r.itemGrade === "record"` (line 274) to gate section content, but never renders `RecordGradeBadge` (grep for `<RecordGradeBadge` in this file = 0 matches) | YES [CONFIRMED] | YES [CONFIRMED] | PARTIAL | grep + SQL |
| Research list | `src/app/research/page.tsx` -> `get_research_items` | YES [CONFIRMED] | YES [CONFIRMED] 200 | YES [CONFIRMED SQL] 39 verified non-archived `research`-surface items | PARTIAL [HYPOTHESIS] same pattern | YES [CONFIRMED SQL] via `_workspace_active_items` | YES [CONFIRMED] | PARTIAL | SQL, HTTP GET |
| Research detail | `src/components/research/ResearchFindingDetailSurface.tsx` | YES [CONFIRMED] | YES [CONFIRMED] 200 | YES [CONFIRMED SQL] same 39 | PARTIAL [HYPOTHESIS] `isRecord` gating present, no `<RecordGradeBadge` render (grep = 0 matches, only a header-comment mention) | YES [CONFIRMED] | YES [CONFIRMED] | PARTIAL | grep, SQL |
| Operations list | `src/app/operations/page.tsx` -> `OperationsLedger.tsx` -> `get_operations_items` | YES [CONFIRMED] | YES [CONFIRMED] 200 | YES [CONFIRMED SQL] 26 verified non-archived `operations`-surface items | PARTIAL [HYPOTHESIS] `StateNote`+`Absence` present in `OperationsLedger.tsx`/`RegionDimensionMatrix.tsx`; no `RecordGradeBadge` (see cross-cutting row) | YES [CONFIRMED SQL] via `_workspace_active_items` | YES [CONFIRMED] | PARTIAL | grep, SQL |
| Operations detail | `src/components/operations/OperationsDetailSurface.tsx` | YES [CONFIRMED] | YES [CONFIRMED] 200 | YES [CONFIRMED SQL] same 26 | NOT [CONFIRMED, grep] zero references to `itemGrade`, `item_grade`, or `RecordGradeBadge` anywhere in this file, unlike all three sibling detail surfaces | YES [CONFIRMED] | PARTIAL | PARTIAL | `grep -n "itemGrade\|isRecord\|RecordGrade" OperationsDetailSurface.tsx` = no matches |
| Community | `src/app/community/page.tsx` (+ `/community/[slug]`, `/benchmarks`, `/browse`, `/directory`, `/discover`, `/moderation`, `/profile`) | YES [CONFIRMED] | YES [CONFIRMED] 200 | PARTIAL [CONFIRMED SQL] `community_groups` = 7 rows, all pre-window regional seed rows (unchanged since the 2026-09-05 audit); `community_member_profiles` = 0 (not re-queried this session, carried from prior audit as [HYPOTHESIS]) | YES [CONFIRMED, file read] page's own comment: "Non-verified intelligence items never reach this surface (`getListingsOnly` is verified-gated + org-scoped)" | YES [CONFIRMED, code read] `getListingsOnly` verified-gated per its own comment | YES [CONFIRMED] | PARTIAL | file read line 39-40 |
| Dashboard | `src/app/page.tsx` -> `get_workspace_intelligence_dashboard`, `get_workspace_due_next`, `get_workspace_recent_changes` | YES [CONFIRMED] | YES [CONFIRMED] 200 | YES [CONFIRMED SQL] draws from the same verified pool | PARTIAL [HYPOTHESIS] not independently screenshot-confirmed | YES [CONFIRMED SQL] all three RPCs route through `_workspace_active_items` (`pg_get_functiondef` ILIKE match = true for all three) | YES [CONFIRMED] | PARTIAL | `pg_get_functiondef` check, HTTP GET |
| Map | `src/app/map/page.tsx` -> `getListingsMapData` -> `fetchListingsMapData` -> `fetchWorkspaceResources(orgId, {listings:true})` -> `get_workspace_intelligence_listings` | YES [CONFIRMED] | YES [CONFIRMED] 200 | YES [CONFIRMED SQL] same 1,321+54+39+26 pool, region-rolled | PARTIAL [HYPOTHESIS] `375px` exemption for `map` recorded in `exemptions-375.mjs`, expired at wave 58 (measured 2026-09-08, guard now passes with nothing suppressed per that file's own header) | YES [CONFIRMED] same RPC as Regulations list | YES [CONFIRMED] | PARTIAL | file read chain, `exemptions-375.mjs` read |
| Watchlist | `src/app/watchlist/page.tsx` -> `getWatchlistFull` -> `fetchWatchlist` -> direct `.from("intelligence_items").eq("provenance_status","verified")` | YES [CONFIRMED] | YES [CONFIRMED] 200 | PARTIAL [CONFIRMED SQL] `user_watchlist` = 1 row, `org_watchlist` = 0 rows live | YES [CONFIRMED, file read] the page's own comment explains its dedicated bounded read, honest-cap reporting via `WATCHLIST_PAGE_LIMIT` passed to the client so the surface never silently truncates | YES [CONFIRMED, file read] `.eq("provenance_status","verified")` on both the legacy-id and uuid lookups, lines 4485/4495, commented "Sprint 4 task 1.10: customer read gate" | YES [CONFIRMED] | PARTIAL | file read `supabase-server.ts:4393-4499` |
| `item_grade` in the 11 customer listing RPCs (migration 310 / finding 3, RPC half) | `310_listing_rpcs_item_grade.sql`; live `pg_proc` | YES [CONFIRMED] | YES [CONFIRMED SQL] all 11 named RPCs (`_workspace_active_items`, both `get_workspace_intelligence_slim[_public]`, both `..._listings[_public]`, both `get_market_intel_items[_public]`, both `get_operations_items[_public]`, both `get_research_items[_public]`) project `item_grade` today, `pg_get_functiondef(...) ILIKE '%item_grade%'` = true on all 11 | YES [CONFIRMED SQL] `intelligence_items.item_grade`: 983 `record` / 535 `brief` (non-archived) | see the `RecordGradeBadge` row below, the data reaches the RPC layer but is not rendered | n/a | PARTIAL, the 2026-09-05 finding text is not updated in place | **COMPLETE (data half only)** | migration 310 IS applied live; **[REFUTED]** vs the 2026-09-05 audit's "migration 310 unapplied at audit time", see Prior claims section |
| `RecordGradeBadge` mounted on a reachable row/section anywhere in the app | `src/components/shell/RecordGradeBadge.tsx` + 4 list ledgers + 4 detail surfaces | YES [CONFIRMED] component exists, exported, typed | **NOT** [CONFIRMED, grep] `grep -rn "<RecordGradeBadge" src` returns exactly ONE hit, `OperationsItemsView.tsx:158`, and `OperationsItemsView.tsx` is imported by NO route or component in the tree (`grep -rn "import.*OperationsItemsView\|<OperationsItemsView" src` = zero matches). `OperationsLedger.tsx` (the component `/operations/page.tsx` actually mounts) uses `ListSurfaceShell` instead and does not import `OperationsItemsView` | n/a | **NOT** [CONFIRMED] zero live renders of the badge anywhere reachable from a route today | n/a | NOT, no doc reflects that the 2026-09-06 `ListSurfaceShell` rewrite silently dropped every row-chip mount | **BUILT-DORMANT (regressed)** | see Prior claims, this is a worse state than the 2026-09-05 audit found, not the same gap persisting |
| Customer-visible RPC dependence on provenance ("customer RPCs do not gate on provenance", the open decision named in the dispatch) | `public._workspace_active_items(p_org_id)` | YES [CONFIRMED] | YES [CONFIRMED SQL] `WHERE NOT COALESCE(wo.is_archived, ii.is_archived) AND ii.provenance_status = 'verified';`, comment reads `-- Sprint 4 task 1.10: customer read gate (ADDED)` | YES [CONFIRMED SQL] every RPC checked (dashboard, due-next, recent-changes, both listings variants, both slim variants, market/research/operations + their `_public` twins, plus the direct `.eq()` calls in watchlist) either routes through this function or carries its own `provenance_status = 'verified'` predicate | n/a (a gate, not a rendered surface) | YES, this IS the gate | PARTIAL, not documented as closed anywhere this session found; the memory line "customer RPCs don't gate on provenance (open decision)" reads as still-open | **COMPLETE, decision resolved, not yet recorded as such** | live `pg_get_functiondef` reads, see method above |
| Rendering / layout guard (F35 + `.discipline/rendering/layout-guard/`) | `.discipline/rendering/layout-guard/run-layout-guard.mjs`, `baseline.mjs`, `baseline.json`, `results.json`, wired into `.github/workflows/discipline.yml` | YES [CONFIRMED] | PARTIAL [CONFIRMED] `layout-guard.test.mjs` (the pure detector, fixture-based) runs in the REQUIRED "Discipline-engine-unit-tests" CI job; the real-browser capture that produces `results.json`/`baseline.json` runs in a SEPARATE `rendering-guard` CI job marked `continue-on-error: true` (non-blocking) as of the 2026-07-11 comment in `discipline.yml`, gated to become required only "after 3 consecutive green runs on master post-merge", whether that has since happened was **not verified this session** (would need branch-protection/Actions API access, out of the read-only SQL/HTTP scope this stage was given) [HYPOTHESIS] | YES [CONFIRMED] `results.json`: 622 findings, last run 2026-09-09 (9 days before this audit); `baseline.json`: 792 keys, written 2026-09-08 | n/a (a gate) | PARTIAL, see discrepancy below | YES [CONFIRMED] `baseline.mjs` header cites the 2026-09-09 operator ruling verbatim, expiry 2026-10-15 | **PARTIAL** | see "What the operator must rule on", `baseline.json` (792 keys, written 09-08) was never regenerated after the 09-09 run that measured only 622 findings, so the checked-in baseline is looser than the last real measurement by 170 keys, and neither artifact has been refreshed in 9 days |
| Admin, Coverage tab | `src/app/api/admin/coverage/route.ts` -> `coverage_matrix()` RPC; tab in `AdminDashboard.tsx` | YES [CONFIRMED] | YES [CONFIRMED SQL] `coverage_matrix` exists live (`pg_proc` count = 1) | YES [CONFIRMED] route reads tier-1/tier-2 jurisdiction lists plus live RPC rows | PARTIAL [HYPOTHESIS] not screenshot-confirmed; wiring is real (file read) | YES, `requireAdminRoute` gate, rate-limited | YES [CONFIRMED] route file is self-documented | PARTIAL | file read, SQL existence check |
| Admin, Corpus-turn requests tab | `src/app/api/admin/corpus-turn-requests/route.ts` -> `corpus_turn_requests`, `intelligence_items` tables; `CorpusTurnPanel` in `AdminDashboard.tsx` | YES [CONFIRMED] | YES [CONFIRMED] route reads/writes real tables (`grep .from("corpus_turn_requests")` x4, `.from("intelligence_items")` x2) | Not re-queried live this session [HYPOTHESIS] | PARTIAL [HYPOTHESIS] | YES, admin-gated | YES | PARTIAL | grep of route file |
| Admin, Platform flag resolver | `src/app/api/admin/integrity-flags/route.ts` -> `integrity_flags` table; `PlatformIntegrityFlagsView.tsx` | YES [CONFIRMED] | YES [CONFIRMED] route reads/writes `integrity_flags` (grep x3) | Not re-queried live this session [HYPOTHESIS] | PARTIAL [HYPOTHESIS] | YES, admin-gated | YES [CONFIRMED, CLAUDE.md doctrine section documents the two-flag-surface contract in full] | PARTIAL | grep of route file, CLAUDE.md doctrine read |

## Prior claims re-checked

Mapped from `docs/audits/plan-completion-audit-2026-09-05/W5-W6-W7-surfaces-community-discipline.md`
("W5, Surfaces") and the README's finding 3.

1. **Finding 3, RPC half ("migration 310 unapplied, item_grade absent from all 11 RPCs")**, **[REFUTED]**,
   no longer true. Live `pg_get_functiondef` on all 11 named RPCs shows `item_grade` present in every one
   today. Migration 310 is applied (the README's own "note for the next reader" already flagged this as
   likely fixed via the MIG310-FIX rewrite; this session independently re-confirms it against live
   function bodies, not against the migrations inventory doc alone).
2. **Finding 3, row-chip half ("RecordGradeBadge mounted in Regulations/Operations rows, not Market/
   Research")**, **still not true, but in a different and worse shape than either the 2026-09-04 or
   2026-09-05 audit found.** The 2026-09-05 lane found the badge live in `RegulationsLedger.tsx:1748`
   (row) and `OperationsItemsView.tsx:158` (row). On this tree, `RegulationsLedger.tsx` is 350 lines (was
   1,891+ before the UILISTS rewrite, per its own header comment) and mounts `ListRow` from
   `src/components/list-surface/`, which carries **no** grade reference anywhere (`grep -rn "itemGrade\|
   RecordGradeBadge" src/components/ui/ListRow.tsx src/components/list-surface/*.tsx` = 0 matches).
   `OperationsLedger.tsx` (the component `/operations/page.tsx` actually renders) similarly moved to
   `ListSurfaceShell` and never imports `OperationsItemsView.tsx`, the file the badge still lives in is
   now unreachable from any route. **[CONFIRMED]**: the row-chip rewrite (UILISTS lane, 2026-09-06/07)
   silently dropped the row-level grade chip from all four list surfaces, including the two the prior
   audit found working. This is a regression the 2026-09-05 audit could not have caught (it postdates that
   audit) and it has gone unnoticed through at least two more UI lanes (FOLD-56, MOBILE-60) that touched
   these same files for unrelated 375px work.
3. **W5 row "RecordGradeBadge (row-level, all four surfaces)", verdict PARTIAL**, **worse today**: 0 of 4
   surfaces carry a live row-level mount (was 2 of 4). Detail-surface mounts are also gone: on 2026-09-05
   the lane found the badge "on all four intelligence detail surfaces" (refuting an even earlier claim);
   on this tree, zero of the four detail surfaces render `<RecordGradeBadge`, though two of them
   (`RegulationDetailSurface.tsx`, `MarketSignalDetailSurface.tsx`) still carry `isRecord`/`itemGrade`
   logic that gates section content without a visible badge, and `OperationsDetailSurface.tsx` carries
   no grade reference of any kind. **[CONFIRMED, grep]**.
4. **W5 "Spec-09 CSV upload flow", "oem_tech_roadmaps"/"grid_connection_queues"/"reroute_events" rows-file
   paths**, out of this stage's start list (spec-09 panels are Operations-surface content, not the
   customer-surface/RPC/rendering-guard/admin-ops scope this dispatch names); not re-checked. Flagged as
   **NOT VERIFIED, carried forward** rather than assumed unchanged.
5. **"customer RPCs do not gate on provenance" (open decision named in the dispatch, from memory
   `project_sprint4_provenance_gate_failclose.md`)**, **[REFUTED as currently stated]**. Live SQL shows
   `_workspace_active_items`, the shared base every checked customer RPC either calls or duplicates , 
   carries `AND ii.provenance_status = 'verified'` with an inline comment "Sprint 4 task 1.10: customer
   read gate (ADDED)". Every customer-facing read this session traced (dashboard, due-next, recent-changes,
   both listings variants and their `_public` twins, market/research/operations and their `_public`
   twins, both slim variants, watchlist's own direct `.eq()` calls) is gated. This session did not find
   the counter-evidence the open-decision framing implies (a customer RPC that reads `intelligence_items`
   un-gated); if one exists it was not in the 11 RPCs + watchlist + dashboard set checked here.
6. **Closure gate / STALE-NEXT seven-entry cliff (finding 10, W7 not W5, but the "gate runs" section)** , 
   out of scope for s5 (belongs to s6-gates-harness); not re-checked here.

## What the operator must rule on

1. **`RecordGradeBadge` row-chip regression.** The UILISTS rewrite (2026-09-06/07) removed the only two
   working row-level mounts without anyone flagging it, and `OperationsItemsView.tsx`, the file carrying
   the one remaining `<RecordGradeBadge` call in the entire tree, is now dead code (imported by nothing).
   Recommendation: either re-add the chip to `ListRow`/`ListSurfaceShell` once (one shared component, all
   four surfaces inherit it, matching the reuse-before-construction doctrine) and delete
   `OperationsItemsView.tsx`, or make an explicit ruling that the row-chip is retired in favor of some
   other grade signal and delete the now-orphaned component and its dead import in
   `RegulationDetailSurface.tsx`. Either way this needs a decision, not another silent drop.
2. **`baseline.json` vs `results.json` drift (792 vs 622).** The committed baseline (written 2026-09-08)
   was never regenerated after the 2026-09-09 run that measured only 622 findings, so 170 baselined keys
   may no longer correspond to any real finding. Not a safety risk (a looser baseline hides nothing new),
   but it violates the file's own stated convention ("a lane that fixes its findings commits the SHRUNKEN
   file; the diff is the proof"). Recommendation: regenerate with `--write-baseline` and commit the diff,
   or rule that this is deferred with the rest of the 622/792 backlog until after the "UI round" per the
   2026-09-09 ruling already on file.
3. **Rendering-guard CI required-check status unconfirmed.** As of the code comment this session read
   (2026-07-11), the real-browser `rendering-guard` job is non-blocking pending 3 consecutive green runs.
   Whether that threshold has since been met and the job promoted to required was not checkable read-only
   from this stage's tools. Recommendation: a session with Actions/branch-protection API access confirms
   current status; until then this is a genuine known-unknown, not an assumed-fine.
4. **Prior claim 4 (Spec-09 panels) not re-checked.** If the operator wants spec-09 recoverage as part of
   "the customer surfaces and what operates them," it needs a follow-up read against
   `docs/audits/plan-completion-audit-2026-09-05/W5-W6-W7-surfaces-community-discipline.md`'s spec-09 rows
  , this stage's start list did not name it and time was spent on the RPC/badge/gate findings instead.

## Counts

Verdict totals across the 19 scored rows:
- COMPLETE: 2 (`item_grade` data-half; customer RPC provenance gate)
- PARTIAL: 15 (Regulations list/detail, Market list/detail, Research list/detail, Operations list,
  Community, Dashboard, Map, Watchlist, rendering/layout guard, Admin Coverage, Admin Corpus-turn,
  Admin Platform-flags)
- BUILT-DORMANT: 1 (Operations detail, no grade reference at all)
- BUILT-DORMANT (regressed): 1 (`RecordGradeBadge` mount)
- NOT BUILT: 0
- COULD NOT VERIFY: 0 standalone (several PARTIAL rows carry a COULD-NOT-VERIFY sub-claim, listed inline)

Rows added beyond the plan's start list (five surfaces + dashboard/map/watchlist + admin tabs): 3 , 
the `item_grade`-in-RPCs cross-cutting row, the `RecordGradeBadge`-mount cross-cutting row, and the
customer-RPC-provenance-gate cross-cutting row, each broken out separately because the plan's own dispatch
text named them as distinct open questions ("whether item_grade reaches the 11 listing RPCs", "the
customer-visible RPCs' dependence on provenance") rather than folding them into the per-surface rows.
