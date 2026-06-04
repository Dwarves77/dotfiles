# Walk-away handoff, 2026-05-09

Autonomous execution log for Dispatch v2 (Wave 1a Step 1 + perf wave + Wave 1a foundation + dashboard widgets).

Operator authorized walk-away execution. This doc is the single record of all work performed and all decisions made without operator confirmation.

---

## Credentials precheck

Run at execution start. Per dispatch hard-halt rules, items 1, 2, 3, 5 must pass before any work proceeds; item 4 must pass before Phase 2.

| Item | Result | Detail |
|---|---|---|
| 1. gh auth status | PASS | Authenticated as `Dwarves77` (keyring), token scopes include `repo` |
| 2. git remote -v | PASS | origin = `https://github.com/Dwarves77/dotfiles.git`. fsi-app is a subdir of the dotfiles repo, not a separate repo. PRs target dotfiles. |
| 3a. supabase CLI | PASS | `npx supabase --version` returns 2.98.2. CLI also at `/c/Users/jason/scoop/shims/supabase`. |
| 3b. supabase project linked | PASS | `supabase/config.toml` absent but `supabase/.temp/linked-project.json` and `supabase/.temp/project-ref` exist; CLI tracks linkage via .temp. |
| 4. ANTHROPIC_API_KEY in shell | NOT SET in shell, PRESENT in `.env.local` | Phase 1 OK (no LLM calls). Phase 2 will require explicit env load before cold-start. |
| 5. cwd active | PASS | `/c/Users/jason/dotfiles/fsi-app` |

Outcome: precheck passes for Phase 1 entry. Phase 2 entry conditional on loading ANTHROPIC_API_KEY into shell.

### Soft findings surfaced before any destructive action

These are NOT hard halts but warrant documentation for operator review on return.

1. **psql not in PATH; SUPABASE_DB_URL not set anywhere.** `dotfiles/docs/wave1-step1-verification.md` uses `psql "$SUPABASE_DB_URL"` for cleanup steps and for the `NOTIFY pgrst, 'reload schema'` cache refresh. Workaround: I will issue equivalent SQL via a Node script using `@supabase/supabase-js` (already a dependency) authenticated with the service-role key from `.env.local`. The schema cache refresh after migration 051 will use the same path.

2. **STATUS.md vs dispatch ordering conflict on schema migrations.** STATUS.md project policy: "Schema migrations (DDL on runtime tables) apply via Supabase CLI BEFORE committing the dependent code, so preview deployments don't 500-error on missing columns." Dispatch: apply migration 051 AFTER PR merge to master. Master auto-deploys to Vercel, so following dispatch creates a brief noisy-log window where the deployed code logs `[agent/run] sources lookup error` against a missing column. The error path is logging-only and does not 500 the route. Following dispatch as authorized; flagging for awareness.

3. **Track 1D (Path A /market Suspense) confirmed empty in staging.** `git diff --name-only` against `fsi-app/src/app/market/*`, `src/components/market/*`, and `MarketPageView*` paths returns no matches. No /market changes exist locally. Track 1D becomes a no-op for this run; logged below.

---

## Disentanglement decisions

Ground truth: staging snapshot at `298589c` on branch `wave1-staging-2026-05-09`. Diffs read against `a62765c` (current `origin/master`).

### File-by-file allocation

| File | Hunk(s) | Assigned to | Reasoning | Confidence |
|---|---|---|---|---|
| `fsi-app/src/app/api/agent/run/route.ts` | one hunk, lines 34-50: adds `error: sourceLookupError` to destructure + `console.warn` + post-mortem comment | `step-1-last-scanned-recovery` | Pure Step 1 error-capture fix. No Wave 1a hooks present (raw persistence, dual-write, agent_runs telemetry, access_method routing don't exist in staging — they are net-new Phase 2 work). | HIGH |
| `fsi-app/src/app/api/admin/attention/route.ts` | one cohesive change: imports `unstable_cache` and `APP_DATA_TAG`, defines `fetchAttentionCounts` cached helper, swaps inline RPC call for the cached helper, updates header comment block | `item-1-attention-cache` | Single feature: server-side caching of admin_attention_counts RPC keyed by admin userId, 30s TTL, APP_DATA_TAG-tagged for revalidation. | HIGH |
| `fsi-app/.claude/CLAUDE.md` | one new section: "agent/run error-swallow post-mortem (in force from 2026-05-08)" | `step-1-last-scanned-recovery` | Documents the Step 1 root cause and the future-agent rule. Travels with the fix. | HIGH |
| `fsi-app/supabase/migrations/051_sources_last_scanned_recovery.sql` | new file (untracked in master) | `step-1-last-scanned-recovery` | The migration the Step 1 fix depends on. | HIGH |
| `fsi-app/scripts/wave1-last-scanned-backfill.mjs` | new file | `step-1-last-scanned-recovery` | Mandatory backfill from `last_checked` per Step 1 spec. | HIGH |
| `dotfiles/docs/wave1-step1-verification.md` | new file | `step-1-last-scanned-recovery` | Verification recipe for Step 1; travels with the fix per project doc convention. | HIGH |
| `fsi-app/scripts/wave1-api-discovery.mjs` | new file | NOT a feature branch; lives on master after Track 1A refactor lands | Working file for Track 1A. After refactor, gets committed as part of Track 1A's evidence trail. | HIGH |
| `fsi-app/scripts/wave1-precheck.mjs` | new file | Stays on staging only for this run | Gate 3 evidence script; Gate 3 already complete. Not required for any pending feature branch. Will land in a future Wave 1a evidence commit if needed. | HIGH |
| `dotfiles/docs/wave1-precheck-2026-05-08.json` | new file | Stays on staging for now; promoted to Wave 1a branch in Phase 2 as evidence | Gate 3 precheck output. Not required for any Phase 1 feature branch. | HIGH |
| `fsi-app/scripts/tmp/wave1-api-discovery.err` and `.log` | new files | Renamed to `aborted-gate4-2026-05-08.{err,log}` and preserved on staging only | Halted Gate 4 run residue per dispatch. Evidence, not feature. | HIGH |
| Parent dotfiles modifications: `.perfrefresh`, `.perftoken`, `.claude/scheduled_tasks.lock`, `docs/CA-BRIEFS-RESULTS.md`, `docs/wave5-design-questions-flags-log.json`, `docs/E2E-RUNLOG.txt`, `docs/EU-BRIEFS-RUNLOG.txt`, `docs/gap2-*` | as-is | Stays on staging only | Runtime state, prior-session work products, unrelated to this dispatch. Preserved on staging branch as a safety snapshot; not promoted to any feature branch. | HIGH |
| `dotfiles/docs/walk-away-handoff-2026-05-09.md` | new file (this doc) | Lives on master directly (uncommitted operator artifact) | The handoff itself; written progressively. Will be re-created on master post-reset and committed as part of Phase 4 finalization or earlier. | HIGH |

### Soft halt list (low-confidence allocations)

None. All disentanglement decisions are HIGH confidence.

### Notes

- **Track 1D is a NO-OP** for this run. No Path A `/market` Suspense changes exist in staging. Logged here so operator knows Track 1D was acknowledged and skipped, not forgotten.
- **The route.ts diff is much smaller than the dispatch presumed.** The dispatch warned to "do NOT include any Wave 1a hooks". Those hooks don't exist yet — they are net-new Phase 2 work to be implemented. So the warning is moot but the implication is important: Phase 2 is more work than the dispatch's "Cherry-pick or rewrite Wave 1a in-progress hunks from staging" framing suggests. There are no in-progress Wave 1a hunks on staging beyond the migration 051 + script + doc + post-mortem set, all of which belong to Step 1.

---

## Per-phase outcomes

### Phase 0: git surgery, COMPLETE

- [x] Credentials precheck written above
- [x] Staging snapshot pushed at `298589c` (branch: `wave1-staging-2026-05-09`)
- [x] Disentanglement decisions written above (all HIGH confidence)
- [x] Hard reset master to `origin/master`
- [x] Re-wrote this handoff doc on master after reset
- [x] Created `step-1-last-scanned-recovery` branch
- [x] Created `item-1-attention-cache` branch
- [x] Track 1D (Path A `/market` Suspense) acknowledged as NO-OP, no branch created

### Phase 1: parallel tracks, COMPLETE

- Track 1B (Item 1 attention cache): PR #81 opened, CI green, squash-merged to master.
- Track 1C (Step 1 last_scanned recovery): PR #80 opened, CI green, squash-merged to master.
- Track 1A (Gate 4 discovery probe): refactored script ran clean over 695 sources after a noisy resume cycle. Summary at `dotfiles/docs/wave1-track1-summary.md`. See "Track 1A outcome" section below.
- Track 1D: NO-OP confirmed.
- Track 1E (widget prerequisites): three open questions answered (`actionOwner` is the canonical owner field, `user_watchlist` is new schema, no unified attention-items RPC exists). Saved at `dotfiles/docs/wave1-track5-widget-implementation-plan.md`.

### Phase 2: Wave 1a foundation, MERGED + MIGRATIONS APPLIED + COLD-START IN FLIGHT

- Build PR #83 merged at `de40816`. See "Phase 2 Wave 1a Foundation" section below for details.
- Migrations 052 to 059 applied via `apply-pending.mjs`. See "Migration apply outcome" section below.
- Cold-start backfill running in background (task id `boua6ldg7`). $200 hard halt configured. Expected wall time approximately 90 minutes; expected cost approximately $55.

### Phase 3: dashboard widgets, MERGED + MIGRATIONS APPLIED

- Build PR #84 merged at `f5b9f85`. See "Phase 3 Dashboard Widgets" section below.
- Migrations 060 + 061 applied. Migration 060 was patched (org_id reference fixed via PR #85, also merged) to point at `public.organizations` instead of `public.orgs`.

### Phase 4: handoff finalization, IN PROGRESS

This section + the consolidated PR URLs + cost meter + DO NEXT list are being written now. Cold-start is still running; cost meter will be updated when it completes.

---

## PR URLs

All PRs were squash-merged to master with branch auto-deleted.

| # | Title | Merge SHA |
|---|---|---|
| [#80](https://github.com/Dwarves77/dotfiles/pull/80) | fix(agent/run): recover swallowed sources lookup error + add last_scanned column (Step 1) | `ae2c9a2` |
| [#81](https://github.com/Dwarves77/dotfiles/pull/81) | perf(api/admin/attention): wrap RPC in unstable_cache, 30s TTL, APP_DATA_TAG (Item 1) | `ae84140` |
| [#82](https://github.com/Dwarves77/dotfiles/pull/82) | perf(shell): prefetch=false on layout-level Links (Round 3) | `1f548ec` |
| [#83](https://github.com/Dwarves77/dotfiles/pull/83) | feat(ingestion): wave 1a foundation (raw persistence + telemetry + per-source kill switch + cold-start script) | `de40816` |
| [#84](https://github.com/Dwarves77/dotfiles/pull/84) | feat(dashboard): four sidebar widgets + Housekeeping section (Layout A) | `f5b9f85` |
| [#85](https://github.com/Dwarves77/dotfiles/pull/85) | fix(migrations): 060 references public.organizations not public.orgs | `7092060` |

Master HEAD at end of orchestration: `7092060`.

---

## Cost meter

Source: SUM(cost_usd_estimated) FROM agent_runs.

- At cold-start launch (2026-05-10T02:19:41Z): $0.00, agent_runs row count 0.
- During cold-start: live, see `fsi-app/scripts/tmp/wave1-cold-start.log` for current progress. The script polls cumulative cost before each iteration and HARD HALTS at $200.
- Final value (to be filled in when cold-start completes): _pending_.

The MTD spend tile in /admin (added in Phase 2) reads the same SUM and is the operator-facing dashboard for ongoing spend.

---

## DO NEXT list (for operator on return)

In recommended order:

1. **Verify Step 1 in production** (deferred; needs admin browser session). Open the production app, log in as admin, and execute the four-step recipe at `dotfiles/docs/wave1-step1-verification.md`. Confirm:
   - Provisional source gate fires HTTP 403
   - Per-source pause check fires HTTP 409 with source-specific reason
   - Second invocation within 1h returns HTTP 429
   - last_scanned timestamp advances on successful run
2. **Visually verify dashboard widgets** at desktop wide (1280px). Open `/`, confirm the four widgets render in the right places per `design_handoff_2026-05_dashboard-sidebar/dashboard-sidebar-spec.html`. Watchlist will be empty (no UI write path in this dispatch). Coverage gaps shows the seeded Switzerland + CA SB 261 entries. By Owner shows top owners by `actionOwner`. Awaiting Review shows oldest 3 admin queue items.
3. **Verify perf Round 3** in browser. Network tab on dashboard load should show 0 duplicate `/` RSC fetches (was 2). Subjective: dashboard should mount approximately 1.2s faster on warm cache.
4. **Review cold-start outcome** by reading `fsi-app/scripts/tmp/wave1-cold-start.log` (and `.err`). Verify the auto-pause flipped on all 718 sources (`auto_run_enabled = false`). Verify cost meter total is in expected range (target approximately $55, hard halt would have triggered at $200).
5. **Run Chrome verification on Track 1A low-confidence subset** (tuning pass, optional). The 437 low-confidence routing recommendations were NOT auto-applied; they remain on `scrape`. Use Claude in Chrome to spot-check a sample of these and tune the writer script if patterns emerge. List of low-confidence items in `dotfiles/docs/wave1-track1-summary.md`.
6. **Manual un-pause priority sources** to begin DEV-cadence ingestion. Until then, the GHA cron has nothing to do (every source has `auto_run_enabled = false`). Use the admin UI or direct DB UPDATE to flip a curated subset back to TRUE.
7. **Backfill schema_migrations history** for the unregistered legacy migrations (006, 007, 026 through 050). Run `npx supabase migration repair --status applied <version>` for each. The schema is already in production; this just aligns the CLI's history table so future `db push` calls do not refuse.
8. **Optional**: send a follow-up PR to make migration 060's reference to `public.organizations` documented as a known-good schema (PR #85 fixed the file; the schema in production is correct).

---

## Track 1A outcome (Gate 4 API/RSS discovery)

- Probe ran over 695 sources. Wall clock approximately 14 minutes (after refactor; first-attempt aborted at 25 was the noisy run). Output JSONL at `dotfiles/docs/wave1-api-discovery-2026-05-09.jsonl` (one line per source).
- Summary doc at `dotfiles/docs/wave1-track1-summary.md` (markdown).
- Routing application via `wave1-api-discovery-apply-routing.mjs`:
  - 225 sources had their `access_method` and / or `rss_feed_url` updated (HIGH or MEDIUM confidence).
  - 437 LOW-confidence recommendations were NOT applied; sources kept their existing `access_method` for operator Chrome-verification tuning later.
  - 187 `rss_feed_url` values set.
  - 0 errors. 1 aborted source (timeout / 429).
  - 470 sources remain on Browserless / `scrape` after routing (67.6%). Down from 691 pre-Wave-1a.
- Routing application log at `dotfiles/docs/wave1-track1-routing-applied.json` (per-source decisions).

The probe and post-processing scripts:

- `fsi-app/scripts/wave1-api-discovery.mjs` (refactored for JSONL incremental writes + resume support; survives mid-run crashes)
- `fsi-app/scripts/wave1-api-discovery-summarize.mjs`
- `fsi-app/scripts/wave1-api-discovery-apply-routing.mjs`

---

## Migration apply outcome

Applied via `fsi-app/supabase/seed/apply-pending.mjs` (sidesteps the supabase CLI's history dispute over unregistered legacy migrations).

| Version | Name | Applied at | Notes |
|---|---|---|---|
| 052 | raw_fetches | 2026-05-10 | + storage bucket creation |
| 053 | intelligence_item_versions | 2026-05-10 | + AFTER UPDATE trigger on intelligence_items |
| 054 | sources_scoreboard_columns | 2026-05-10 | last_content_hash, last_content_fetched_at, last_intelligence_item_at |
| 055 | sources_auto_run_enabled | 2026-05-10 | DEFAULT TRUE; cold-start flips to FALSE on completion |
| 056 | sources_access_method_extension | 2026-05-10 | scrape kept as legacy alias |
| 057 | agent_runs | 2026-05-10 | telemetry table; partial index for MTD tile |
| 058 | ingestion_control_log | 2026-05-10 | append-only audit |
| 059 | ingestion_state | 2026-05-10 | current-state projection; backfilled to 783 rows on apply (all sources) |
| 060 | user_watchlist | 2026-05-10 | RLS enforced; on-master file fixed via PR #85 |
| 061 | coverage_gaps | 2026-05-10 | seeded Switzerland (high) + CA SB 261 (medium) |

PostgREST schema cache reloaded after each apply batch via `NOTIFY pgrst, 'reload schema'`.

### Carry-over from earlier orchestration

`apply-pending.mjs` is floored at MIN_VERSION 052. The legacy migrations 006, 007, and 026 through 050 are present in production schema but unregistered in `supabase_migrations.schema_migrations`. Backfilling that history is item 7 on the DO NEXT list above.

---

## Soft halts and warnings raised during execution

- 2026-05-09 — STATUS.md migration policy says schema DDL applies BEFORE commit; dispatch says AFTER merge. Following dispatch as authorized.
- 2026-05-09 — psql + SUPABASE_DB_URL absent; using @supabase/supabase-js with service-role key as equivalent SQL execution path.
- 2026-05-09 — Track 1D (Path A /market Suspense) is a NO-OP for this run. No changes exist in staging.

---

## Residue files

- Halted Gate 4 evidence: `fsi-app/scripts/tmp/wave1-api-discovery.err` and `.log` will be renamed to `aborted-gate4-2026-05-08.{err,log}` and preserved per dispatch.

---

## Perf Round 3 (2026-05-09)

Goal: eliminate the duplicate Dashboard prefetch and other layout-shell prefetch storms identified in Jason's Claude-in-Chrome session.

### Side-rail file path

- `fsi-app/src/components/Sidebar.tsx` (rendered by `fsi-app/src/components/AppShell.tsx`, mounted from `fsi-app/src/app/layout.tsx`).

### Files modified (3, 6 Links opted out)

| File | Links changed | Notes |
|---|---|---|
| `fsi-app/src/components/Sidebar.tsx` | 1 | Logo `<Link href="/">` (line 73 post-edit). NAV_ITEMS map already had per-href opt-out via `NO_PREFETCH_HREFS`; logo Link was the unguarded duplicate prefetch source. |
| `fsi-app/src/components/community/CommunitySidebar.tsx` | 4 | Back-to-Caro breadcrumb (`href="/"`), + Onboard button (`href="/onboarding"`), footer Settings (`href="/settings"`), `SidebarSection` actionHref Plus button (renders twice for Private/Public group sections, both pointing at `/community/browse?privacy=*`). The `SidebarRow` primitive already had `prefetch={false}` from Round 2. |
| `fsi-app/src/app/regulations/[slug]/page.tsx` | 1 | "← Regulations" breadcrumb (`href="/regulations"`). |

### Other layout-level Links found and intentionally left

| Link | Rationale |
|---|---|
| `IntegrityFlagsView.tsx:321` | Admin table cell with `target="_blank"`, no SPA prefetch concern. Admin surface is in the exclusion list anyway. |
| `VendorMentionsRail.tsx:72` | Page-level rail rendered inside `community/page.tsx` and `community/[slug]/page.tsx` body, not shell. Single Link to `/community/vendors`, low impact. |
| `GroupCard.tsx:110` | Page-level browse-grid card. BrowseGroupsGrid is a per-page surface. |
| `CommunityShell.tsx:406, 426, 505, 514` | Inside `CommunityDefaultBody`, only renders when no `children` are passed (the empty/landing state of `/community/`). Page-content CTAs, not shell navigation. |
| `MapView.tsx:773` | Page-level map popup callout. |

### Alternative-cause investigation

Hypothesized alternatives, all ruled out:

- `app/loading.tsx` is a static skeleton (4 stat cards + 3 accordion shells), no fetches.
- `app/error.tsx` has no Links and no auto-retry beyond the user-triggered `reset()`.
- `app/page.tsx` (Home) has a single awaited `getAppData()` call, no unawaited promises, no parallel-render storm.
- No `revalidatePath('/')` calls exist in any `app/api/**` route that would force re-renders. (`PERF-WAVE-2.md` confirms `revalidate = 60` was removed from `/` last wave because it was a no-op anyway.)
- `HomeSurface.tsx` is in the exclusion list so I did not modify it, but I reviewed enough of it to confirm the home-card Links it renders already use `prefetch={false}` (per Round 2's WhatChanged/WeeklyBriefing/Supersessions edits).
- The brief's evidence (~1567 byte duplicate Dashboard RSC fetch, ~1.2s post-FCP) matches the Sidebar logo Link pattern exactly: `NAV_ITEMS` map has Dashboard at `href="/"` opted out, but the logo Link directly above it at `href="/"` was unguarded.

### Deferred follow-ups (excluded files I did NOT touch)

None. No layout-level Links were found inside any of the hard-excluded files.

### PR + merge status

- Branch: `perf-round-3-layout-link-prefetch` (deleted on merge)
- PR: https://github.com/Dwarves77/dotfiles/pull/82
- CI: SUCCESS (Vercel Preview Comments + 2 Vercel build checks all green)
- Mergeable: CLEAN
- Merge: squash-merged to master (`1f548ec`), branch auto-deleted

### Success-criteria validation

CI alone cannot verify the perceptible improvement. Operator must verify in browser on return:

1. Network tab on dashboard load: zero duplicate `/` RSC fetch (was 2, target 1).
2. Network tab on `/regulations/[slug]` load: zero auto-prefetch of `/regulations` index.
3. Network tab on any `/community/*` load: zero auto-prefetch of `/`, `/onboarding`, `/settings`, or `/community/browse?privacy=*` triggered by the community sidebar mount.
4. Click-through on the Dashboard nav, sidebar logo, regulations breadcrumb, and community Back-to-Caro link still feels instant (Next's in-flight RSC dedupe handles click latency).
5. Subjective: Dashboard mount time drops by ~1.2s on warm cache.

## Phase 3 Dashboard Widgets (Wave 1 / Track 5)

Implements the four dashboard sidebar widgets and the Layout A reshape per `design_handoff_2026-05_dashboard-sidebar/`. Built in parallel with the Wave 1a foundation agent on a separate branch with a non-overlapping file scope.

### PR + merge

- PR: https://github.com/Dwarves77/dotfiles/pull/84
- Merge commit (squash): `f5b9f85e6a17f8cb585e32faa22ab4801776253e`
- Merged 2026-05-10 02:12:48 UTC, branch `feat/dashboard-widgets` auto-deleted
- CI: SUCCESS, 3 checks (Vercel Preview Comments, Vercel caros.ledge, Vercel carosledge), mergeable CLEAN

### Files created or modified (13 total, exactly the plan section 6 hard scope)

Created:
1. `fsi-app/src/components/home/TypesetSection.tsx`, shared shell primitive
2. `fsi-app/src/components/home/DashboardWatchlist.tsx`, rail top
3. `fsi-app/src/components/home/DashboardByOwner.tsx`, rail bottom
4. `fsi-app/src/components/home/DashboardCoverageGaps.tsx`, Housekeeping body left
5. `fsi-app/src/components/home/DashboardAwaitingReview.tsx`, Housekeeping body right
6. `fsi-app/src/components/home/HousekeepingSection.tsx`, body section wrapper, also exports `HousekeepingSkeleton` and `RailSkeleton`
7. `fsi-app/supabase/migrations/060_user_watchlist.sql`, new table
8. `fsi-app/supabase/migrations/061_coverage_gaps.sql`, new table seeded with 2 entries

Modified:
9. `fsi-app/src/app/page.tsx`, wires three new promises into HomeSurface props
10. `fsi-app/src/components/home/HomeSurface.tsx`, body grid reshape (1fr / 300px), accepts new promise props, mounts widgets in Suspense boundaries
11. `fsi-app/src/lib/data.ts`, adds `getWatchlist`, `getCoverageGaps`, `getAwaitingReview`, plus type re-exports
12. `fsi-app/src/lib/supabase-server.ts`, adds `fetchWatchlist`, `fetchCoverageGaps`, `fetchAwaitingReview`, `WatchlistItem`, `CoverageGap`, `ReviewItem` interfaces, and an inline `isPlatformAdminInline` helper
13. `fsi-app/src/app/globals.css`, appends a Dashboard sidebar widgets style block (typeset primitives, pulse dot, type tags, watchlist/owner/coverage/review item styles, Housekeeping card chrome, stale pill)

### Migrations 060 + 061 (waiting for orchestrator apply)

Both migrations were committed in PR #84 but not applied to the database. The orchestrator handles the apply step after merge per the operating protocol.

- `060_user_watchlist.sql` creates `public.user_watchlist` with RLS scoped to `auth.uid() = user_id`. `item_id` is `text` (not uuid) because resource ids in this codebase are slug-like (legacy_id || uuid).
- `061_coverage_gaps.sql` creates `public.coverage_gaps` with public-read RLS and seeds two rows: Switzerland packaging waste regulation (high) and CA SB 261 climate-related financial risk (medium).

### Try / catch boundaries that make the code safe before migrations apply

Critical safety invariant: master auto-deploys to Vercel before migrations apply, so the new fetchers must tolerate the tables being absent.

- `fetchWatchlist` (supabase-server.ts) wraps the entire query path in try/catch and returns `[]` on any throw, including the table-does-not-exist case. Returns `[]` immediately for unauthenticated users.
- `fetchCoverageGaps` wraps the query in try/catch, returns `[]` on any throw.
- `fetchAwaitingReview` wraps the parallel three-table query in try/catch, returns `[]` on any throw, returns `[]` immediately for non-admin or unauthenticated users.
- `getWatchlist`, `getCoverageGaps`, `getAwaitingReview` (data.ts) each wrap the cached fetcher call in another try/catch returning `[]`. Belt and suspenders.
- The widget components consume `[]` arrays via React 19 `use()` and render the empty-state copy. All empty-state strings are user-approved verbatim per the plan.
- The widget `use()` calls are NOT wrapped in try/catch (would break Suspense). Errors at the use-promise level would bubble to the Suspense boundary in HomeSurface, but the data layer never throws by construction.

### Three open questions, RESOLVED

The README listed three questions for the team. All resolved:

1. **Coverage gaps v1 data source**, RESOLVED. v1 is the hand-curated `coverage_gaps` table from migration 061, seeded with Switzerland packaging waste and CA SB 261. v2 (rule-based comparison against an industry-standard taxonomy) is out of scope for this PR.
2. **`user_watchlist` schema**, RESOLVED. The table did not exist in the current schema; migration 060 creates it with RLS scoped to the owning user.
3. **By Owner field name**, RESOLVED. Canonical name is `actionOwner` (TS) / `action_owner` (DB) per Track 1E investigation. Confirmed at `src/types/resource.ts:158`.

### Drift report

No drift found between the plan and reality.

- `HomeSurface.tsx` matched the JSX scaffolding shape in the plan.
- `actionOwner` lives at `src/types/resource.ts:158` exactly as the plan said.
- `data.ts` uses the `getX` / `fetchX` pattern with `resolveOrgIdFromCookies` exactly as the plan said. The new fetchers added a parallel `resolveUserIdFromCookies` helper for user-scoped (not org-scoped) caches.

One implementation note that diverged from the plan's wording: the spec HTML uses unprefixed CSS class names (`.wl-item`, `.ow-item`, `.rev-item`, `.pulse`, `.type-chip`) but the plan's globals.css block only enumerated `.cl-typeset-*`, `.cl-typetag`, `.pulse-dot`. To keep file scope tight and avoid sprinkling inline styles, the widget-specific class styling was lifted from the spec into the same globals.css append block, prefixed `cl-wl-item`, `cl-ow-item`, `cl-rev-item`, `cl-rev-chip`, plus `cov-item` (kept as-is from the spec) and Housekeeping helpers `cl-hk-card`, `cl-hk-two`, `cl-stale-pill`. All inside the file scope boundary.

One token alias was missing in `theme.css`: `--border` (the plan referenced `--border` for the Housekeeping card chrome). Substituted `--color-border` which is the canonical token. Did not introduce a new alias to keep the PR strictly additive in CSS.

### Operator-on-return checklist

When the user returns:

1. Visual fidelity check at desktop wide (1280+) against `dashboard-sidebar-spec.html`. Compare the rail (Watchlist + By Owner) and Housekeeping (Coverage gaps + Awaiting review) against the spec close-ups. Type sizes, eyebrow letter-spacing, pulse-dot position, severity-color treatment for the high-sev coverage gap, and the chip palette on Awaiting review should all match the spec.
2. Confirm migrations 060 and 061 applied. Coverage gaps widget should render the two seeded entries (Switzerland packaging waste high-sev, CA SB 261 medium-sev). Watchlist + Awaiting review will still be empty until users seed their pins or admin queue items exist.
3. Anonymous user dashboard: Watchlist and By Owner show their empty-state copy. Coverage gaps shows seeded entries (RLS is `using (true)`). Awaiting review shows the empty-state copy (non-admin path).
4. Authenticated non-admin user dashboard: same as above for Awaiting review (the widget hides itself into the empty-state copy via the fetcher's role check).
5. Authenticated admin user dashboard: Awaiting review surfaces the top 3 oldest items across provisional sources, integrity flags, and approved staged updates.
6. The `(stale)` pill on Awaiting review should appear and the affected row should get the high-sev fill if any item is older than 7 days.
7. Mobile pass is deferred. The 1024px breakpoint collapses the rail to a single-column block under the body main; that is the only responsive behaviour shipped. Full mobile pass is a follow-up.

### Notes for the orchestrator

- Migrations 060 and 061 must be applied to Supabase before any data appears in the watchlist or coverage-gaps widgets. Awaiting review will work as soon as PR #83 (Wave 1a foundation) plus the existing 048 / 050 integrity_flags + provisional_sources + staged_updates tables are present.
- No conflict was encountered with the parallel Wave 1a foundation agent. Their files (`api/agent/run/route.ts`, `lib/llm/*`, `lib/sources/api-fetch.ts`, `lib/sources/rss-fetch.ts`, `migrations/052-059`, `admin/page.tsx`, `AdminDashboard.tsx`, `MtdSpendTile.tsx`, `wave1-cold-start.mjs`, `.github/workflows/source-monitoring.yml`) and Phase 3 files were strictly disjoint. Their PR (#83) merged just before mine; my PR (#84) squash-landed cleanly on top.

---

## Phase 2 Wave 1a Foundation (2026-05-09 evening)

PR: https://github.com/Dwarves77/dotfiles/pull/83
Merge commit SHA: de4081669cf84d182b737d0949bca064c026dfe0
Branch: `wave-1a-foundation` (squash merged, auto deleted)
Status: MERGED, Vercel build SUCCESS on both targets.

### Files created or modified

Migrations (8 new, additive and idempotent):

- `fsi-app/supabase/migrations/052_raw_fetches.sql` (62 lines)
- `fsi-app/supabase/migrations/053_intelligence_item_versions.sql` (138 lines)
- `fsi-app/supabase/migrations/054_sources_scoreboard_columns.sql` (32 lines)
- `fsi-app/supabase/migrations/055_sources_auto_run_enabled.sql` (29 lines)
- `fsi-app/supabase/migrations/056_sources_access_method_extension.sql` (47 lines)
- `fsi-app/supabase/migrations/057_agent_runs.sql` (60 lines)
- `fsi-app/supabase/migrations/058_ingestion_control_log.sql` (43 lines)
- `fsi-app/supabase/migrations/059_ingestion_state.sql` (50 lines)

Code (4 new, 5 modified):

- new `fsi-app/src/lib/llm/haiku-classify.ts` (309 lines), shared module exporting `haikuVerifyCandidate` (delegated to from verification.ts) and `haikuClassify` (Wave 1a per fetch classifier).
- new `fsi-app/src/lib/sources/api-fetch.ts` (164 lines), API fetcher returning BrowserlessResult shape.
- new `fsi-app/src/lib/sources/rss-fetch.ts` (147 lines), RSS or Atom fetcher returning BrowserlessResult shape.
- new `fsi-app/src/components/admin/MtdSpendTile.tsx` (66 lines), read only month to date spend tile.
- modified `fsi-app/src/lib/sources/verification.ts`, classifyWithHaiku now delegates, Anthropic import dropped.
- modified `fsi-app/src/app/api/agent/run/route.ts`, full restructure into try catch finally envelope; raw persist; access_method routing; Sonnet cost estimation; HttpResponseError wrapper for uniform terminal state.
- modified `fsi-app/src/app/api/worker/check-sources/route.ts`, adds `auto_run_enabled` filter and column.
- modified `fsi-app/src/components/admin/AdminDashboard.tsx`, mounts MtdSpendTile between navy banner and tab strip; three new optional props.
- modified `fsi-app/src/app/admin/page.tsx`, adds `fetchMtdSpend` aggregator into existing Promise.all; soft fails to zeros when agent_runs is missing.

Operator script:

- new `fsi-app/scripts/wave1-cold-start.mjs` (335 lines), one shot backfill, concurrency 5, hard halt at 200 USD, flips kill switch on every active source at the end.

GHA workflow:

- modified `.github/workflows/source-monitoring.yml`, cron from 6h to 1h.

Total: 19 files, +2130 lines, -179 lines.

### Code paths that fall back to no op when tables absent

The Wave 1a integration in `agent/run/route.ts` and `admin/page.tsx` was wrapped in try and catch on every reference to a Wave 1a table so the merged code is safe to deploy before the migrations apply. The boundaries:

1. `agent_runs` insert at start of POST handler, try and catch around the supabase insert. On failure, agentRunId stays null and the finally block skips its update.
2. `agent_runs` finally update, try and catch around the supabase update. On failure, console warn, response still returns.
3. `raw_fetches` upload and insert wrapped inside `persistRawFetch`, returns null ids on any error. Sources scoreboard column update wrapped separately.
4. `sources` last_intelligence_item_at update at Step 11, wrapped in try and catch. On failure, falls back to the original update without the new column.
5. `intelligence_item_versions` write happens via Postgres trigger on intelligence_items UPDATE. When the trigger does not exist (migration 053 not applied), the UPDATE proceeds and the route returns success without a version row, matching pre Wave 1a behavior.
6. `admin/page.tsx` `fetchMtdSpend` returns zeros on any error, MtdSpendTile renders zeros.

The merged build was confirmed green on both Vercel targets before the migrations apply, this is the safety net working as designed.

### Operator runbook (post merge, applies now)

1. Apply migrations in numeric order against production Supabase via the SQL editor:

   ```
   052_raw_fetches.sql
   053_intelligence_item_versions.sql
   054_sources_scoreboard_columns.sql
   055_sources_auto_run_enabled.sql
   056_sources_access_method_extension.sql
   057_agent_runs.sql
   058_ingestion_control_log.sql
   059_ingestion_state.sql
   ```

2. Verification SQL (run after migrations):

   ```sql
   -- Bucket exists
   SELECT id, name, public FROM storage.buckets WHERE id = 'raw_fetches';

   -- auto_run_enabled defaulted TRUE on existing rows
   SELECT count(*), bool_and(auto_run_enabled) FROM sources WHERE status = 'active';

   -- Trigger present
   SELECT tgname FROM pg_trigger WHERE tgname = 'intelligence_items_version_snapshot';

   -- agent_runs reachable
   SELECT count(*) FROM agent_runs;
   ```

3. Dry run the cold start.

   ```
   cd fsi-app
   node scripts/wave1-cold-start.mjs --dry-run
   ```

4. Run the cold start. Expected wall time approximately 90 minutes at concurrency 5. Expected cost approximately 55 USD. Hard halt at 200 USD.

   ```
   node scripts/wave1-cold-start.mjs
   ```

5. Monitor the MTD tile on /admin during the run, the cost meter should plateau under 60 USD.

6. After completion, verify the kill switch took effect.

   ```sql
   SELECT count(*) FILTER (WHERE auto_run_enabled = true) AS still_on,
          count(*) FILTER (WHERE auto_run_enabled = false) AS now_off
     FROM sources WHERE status = 'active';
   -- expect still_on = 0, now_off = 718.

   SELECT count(*) FROM ingestion_control_log
    WHERE action = 'auto_run_disabled' AND actor = 'cold_start';
   -- expect 718.
   ```

7. Re enable per source via admin panel as operators vet each source. The hourly worker picks up newly enabled sources within an hour.

### Deviations from the plan and rationale

1. `.github/workflows/source-monitoring.yml` already existed (not greenfield as the plan stated). Updated the existing file in place rather than creating a new one. Cron updated from `0 */6 * * *` to `0 */1 * * *` per the plan, and the file comment was updated to explain why hourly is now safe (auto_run_enabled gate makes the worker no op when no source is enabled).

2. Migration 056 keeps `scrape` as a legacy alias instead of deprecating it. The plan said either is acceptable. Keeping the alias means existing 691 sources on `scrape` continue to route through Browserless without a data migration. The agent/run access_method switch maps both `scrape` and `html_scrape` to the Browserless render path.

3. Migration 053 trigger fires only when one of seven tracked columns actually changes (full_brief, severity, priority, urgency_tier, format_type, topic_tags, intersection_summary). The plan implied snapshot on every UPDATE; the WHEN clause prevents version churn for unrelated column updates (e.g. `last_scanned` timestamp bumps). If a future writer changes a column not listed, no version is created. Keep this in mind when adding new versioned columns.

4. `haikuClassify` reads the input HTML, computes its own SHA 256 content_hash, and includes that in the output. The plan listed `content_hash` as an output but did not specify where it was computed. Computing inside the helper means the cold start script and the agent/run route get matching hashes from the same algorithm.

5. The MtdSpendTile uses commas in the inline status text rather than periods to separate the three counters, matches the navy banner separator style. Per the no em dash rule, no dashes were used.

6. The cold start script inlines simplified versions of the api-fetch, rss-fetch, browserless render, persistRaw, and haikuClassify helpers rather than importing the TypeScript modules. Reason: the script is a `.mjs` ESM file and the source modules are TypeScript with `@/` path aliases that require a build step to resolve outside Next. Inlining is the operationally simplest path and the script is a one shot, the duplication does not warrant a build step.

7. CI is Vercel only, no GitHub Actions required for build verification. The plan mentioned tsc and build, both were run locally before push. ESLint reported 11 pre existing errors and 1 pre existing warning in admin/page.tsx and AdminDashboard.tsx, none in files this PR introduced. ESLint does not gate the build.

### Carry over uncommitted state

The working tree contained pre existing uncommitted changes to the Phase 3 widget surface files (home/*, lib/data.ts, page.tsx, globals.css, supabase-server.ts, migrations 060 and 061) before this Phase 2 work began. Those files were not staged, not committed, not touched (Phase 3 was being landed in parallel by another agent on `feat/dashboard-widgets`, since merged as PR #84).

## Fetch-quality filter (PR #86, merged 2026-05-10)

PR: https://github.com/Dwarves77/dotfiles/pull/86
Merge SHA: `e2f6b61ae7b1a125e3bd51346b0bc43a82abcdd9`

Files modified:
- `fsi-app/src/lib/sources/fetch-quality.ts` (new, 30-line non-LLM gate)
- `fsi-app/src/app/api/agent/run/route.ts` (calls filter after fetch, throws 412 on fail; 412 added to statusToTelemetry's `skipped` bucket)
- `fsi-app/scripts/lib/fetch-quality.mjs` (new, mirror of the .ts file for .mjs scripts)
- `fsi-app/scripts/wave1-cold-start.mjs` (calls filter, captures `intelligence_items.id` from insert, writes `intelligence_item_id` to agent_runs success UPDATE; also includes prior operator edits for Browserless 429 handling: concurrency 1, exponential backoff retries, resume-from-prior-run, stale-running cleanup)

Detects: Cloudflare/CAPTCHA gates, 404/not-found pages, maintenance pages, HTTP failures, content shorter than 500 chars. Probe window first 5 KB of body, regexes compiled at module load.

In-flight cold-start (background task `b37bz0u4z`) is unaffected. Node loaded the script into memory at process start; the new code applies only to future invocations of either the script or the runtime route.

Verification: `npx tsc --noEmit` exit 0, `npm run build` exit 0, all CI checks SUCCESS, mergeStateStatus CLEAN.

Operator-on-return: confirm `agent_runs.intelligence_item_id` is being populated on the next cold-start run; spot-check that newly-fetched garbage sources are now landing as `status='skipped'` with `errors[].reason` populated rather than producing intelligence_items rows.


---

## 2026-05-10 — Dashboard payload RPC projection (PR #90, draft)

PR: https://github.com/Dwarves77/dotfiles/pull/90 (draft, hold for operator merge).

Wave 1 perf trim, third RPC variant for the workspace intelligence read. Migration 064 adds `get_workspace_intelligence_dashboard`, drops six unrendered long-text columns on top of the four slim already excludes, caps to LIMIT 50. Loader `fetchDashboardData` now passes `{ dashboard: true }` to `fetchWorkspaceResources`, slim and full code paths unchanged.

Files: `fsi-app/supabase/migrations/064_workspace_intelligence_dashboard_rpc.sql` (new), `fsi-app/src/lib/supabase-server.ts` (loader flag).

Projected wire reduction on /: ~3.5 MB (the 184-row `full_brief` ~3.19 MB plus ~300-500 KB across `summary`, `what_is_it`, `why_matters`, `key_data`, `reasoning`). Resolves the build-time warning observed today on /, "Failed to set Next.js data cache for unstable_cache, items over 2MB can not be cached (2856598 bytes)".

TypeScript surgery: none. `npx tsc --noEmit` clean, `npm run build` exit 0. Audit reference: `docs/dashboard-payload-audit-2026-05-11.md`.

Operator gate: review PR #90, apply migration 064 to staging Supabase, confirm `/` payload drops under 1 MB on a Vercel preview, then merge. Wave 1b will use migration 065.


---

## 2026-05-10 — Wave 1b Implementation: pending_first_fetch queue + drain worker (PR #91, draft)

PR: https://github.com/Dwarves77/dotfiles/pull/91 (draft, hold for operator merge).

Closes the registry-to-ingestion handoff gap from `docs/registry-to-ingestion-handoff-design-2026-05-10.md`. Implements the design's recommended Pattern P3 (Postgres trigger plus dedicated drain worker, no `pg_net`).

### What shipped

- **Migration 065** `fsi-app/supabase/migrations/065_pending_first_fetch_queue.sql`. New `pending_first_fetch` table (id, source_id FK, queued_at, status enum {queued|fetching|done|error|skipped}, attempt_count, last_attempt_at, last_error_text). Partial unique index on `(source_id) WHERE status NOT IN ('done', 'skipped')` keeps duplicates out while letting re-enables eventually re-queue. Index on `(status, queued_at)` for the drain pickup query. RLS service-role-only. Trigger function `enqueue_pending_first_fetch()` on AFTER INSERT and AFTER UPDATE OF auto_run_enabled, gated on (active source AND not paused AND auto_run_enabled=true) AND (no existing intelligence_items row for this source). Re-enables of sources with prior history flow through the existing `/api/worker/check-sources` worker on the same hourly cron, not through this queue.

- **Drain worker** `fsi-app/src/app/api/worker/drain-first-fetch/route.ts`. Worker-secret auth via `x-worker-secret` (same WORKER_SECRET as `/api/worker/check-sources`). Picks oldest queued rows (default limit 5, env `DRAIN_FIRST_FETCH_LIMIT` override, body `{ limit }` override capped at 50). Mints a one-shot Supabase access_token via `auth.admin.generateLink` + `verifyOtp` for the worker-designated admin email (env `DRAIN_WORKER_EMAIL`, falls back to `ADMIN_EMAIL`, last-resort `jasonlosh@hotmail.com`). Seeds a stub intelligence_items row before forwarding to `/api/agent/run`, satisfying the route's pre-condition (route.ts:400-405) without modifying the route. Failure classification: 403/404/412 are terminal (mark error, no retry), 5xx and other errors retry up to 3 attempts then mark error. Re-checks source eligibility at drain time so paused sources skip terminally. Serial loop within an invocation for Anthropic concurrency safety.

- **GHA workflow** `.github/workflows/source-monitoring.yml`. New `drain-first-fetch` job on the same hourly cron, runs after `check-sources` with independent failure handling (`if: always()`).

### Auth approach picked

Option (a) from the design doc Section "Open questions" item 8: drain worker mints a one-shot Supabase access_token via `auth.admin.generateLink` + `verifyOtp`. Mirrors the proven pattern in `scripts/_smoke-run-task3.mjs`. Token in-memory only, never logged. Keeps `/api/agent/run`'s Bearer JWT contract unchanged (no route modifications). One auth event per drain tick (24/day at hourly cadence with default limit 5).

### Verification

`npx tsc --noEmit` clean, `npm run build` clean (`✓ Compiled successfully in 2.6s`, route `/api/worker/drain-first-fetch` registered).

### Smoke-test plan (operator runs post-merge)

1. Pick a Task-6-registered source with `auto_run_enabled=false`. Flip via SQL: `UPDATE sources SET auto_run_enabled = true WHERE id = '<uuid>';`
2. Confirm trigger fired: `SELECT * FROM pending_first_fetch WHERE source_id = '<uuid>';` Expect one row, `status='queued'`.
3. Manually invoke drain (do not wait for cron): `curl -X POST -H "x-worker-secret: $WORKER_SECRET" -H "Content-Type: application/json" -d '{"limit":1}' https://<APP_URL>/api/worker/drain-first-fetch`
4. Confirm downstream writes: stub `intelligence_items` row exists, `sources.last_intelligence_item_at` populated, `agent_runs.status='success'`, queue row `status='done'`.

### Open design questions surfaced

1. **`DRAIN_WORKER_EMAIL` env var is new.** Operator should set it on the deployed app to a dedicated admin email (e.g. a `worker@` alias) rather than relying on the personal-email fallback.
2. **Re-enable of a source that already has ingestion history does NOT enqueue.** Trigger gate skips when `intelligence_items` row exists. Such re-enables flow through `/api/worker/check-sources`. If operator wants re-enables to also force a fresh fetch, that becomes a Wave 1c change.

### Operator gate

Review PR #91, set `DRAIN_WORKER_EMAIL` on Vercel production, apply migration 065 to production Supabase via `npx supabase db push`, run smoke-test plan against one Task-6 source, then merge. Migration 065 is independent of the parallel migration 064 (PR #90) and can apply in either order.

---

## Cleanup audit follow-ups, 2026-05-11

Per `dotfiles/docs/cleanup-audit-2026-05-11.md` and operator approval block.

### Migration 062 (intelligence_items.hidden_reason)

**Status: write-only audit column.** Two historical UPDATEs only (NYC ICE + Latvian Saeima from Phase 2 step 2). No code path reads it. Activating a reader requires building an /admin queue surface that displays hidden items by reason.

### Migration 063 (sources classification axes)

**Status: scaffolding for Wave 1c.** All 12 columns NULL on 657 of 783 sources at write time (only the 11 Task 6 sources have values). Zero readers in production code today. The Wave 1c source-aware routing classifier (per `dotfiles/docs/source-classification-framework-2026-05-10.md` if present, otherwise per the framework operator owns) is the consumer. Do not drop these columns; the consumer is in the next wave.

The `tier` column added in 063 was a no-op due to collision with the existing integer `tier 1-7` from migration 004. Framework's Axis 2 maps to the existing integer column. The other 11 columns added cleanly.

### Cleanup actions executed

- 6 underscore-prefixed scripts moved from `fsi-app/scripts/` to `fsi-app/scripts/archive/`
- `dotfiles/docs/wave1-foundation-integration-plan.md` moved to `dotfiles/docs/archive/`
- 11 wave decision-snapshot docs prepended with a `> **Historical:**` header
- `haikuClassify` export deleted from `fsi-app/src/lib/llm/haiku-classify.ts` (never imported; cold-start carries its own local copy)
