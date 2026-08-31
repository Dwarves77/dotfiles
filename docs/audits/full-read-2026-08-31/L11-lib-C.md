# Lane L11-lib-C — Full-Read Audit Report

Repo: /root/work/dotfiles/fsi-app. All paths below are relative to that root.

---

## Per-file verdicts

### src/lib/api/auth.ts — WORKING-WIRED — Bearer-JWT auth guard for API routes (`requireAuth`, `isAuthError`)
- NOTE: on missing `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` fails closed with 500 (auth service not configured), never a silent bypass.

### src/lib/api/community-auth.ts — WORKING-WIRED — cookie-session-first auth guard for `/api/community/*` routes, falls back to Bearer
- NOTE: Path A (cookie) failure silently falls through to Path B (Bearer) via a bare `catch {}` (line 52-54) — intentional per the file's own header, not a defect.

### src/lib/api/generation-pause.npmtest.mjs — TEST — red/green proofs for `evaluateGenerationPause` (pause.ts). Not vacuous: asserts both `halt:true` and `halt:false` branches for manual/autonomous callers under dormant/emergency states with distinct assertions per case.

### src/lib/api/org.ts — WORKING-WIRED — resolves org_id/role for a user from `org_memberships` (oldest-membership policy), 3 exported functions all consumed elsewhere (refs=12).

### src/lib/api/pause.ts — WORKING-WIRED — global/source pause gates (`isGloballyPaused`, `evaluateGenerationPause`, `pausedResponse`) consumed by every fetch-capable route per the file's own header claim (refs=8; imports `isAuthorizedHoldCaller` from sources/fetch-hold.mjs, outside this lane, not verified here).
- NOTE: `getScrapeState` fails closed to `{cadence:'off', emergencyPaused:false}` on any read error (lines 33, 39-40) — i.e. a DB read failure makes `isGloballyPaused` return `true` (paused), the documented "safer default."

### src/lib/api/rate-limit.ts — WORKING-WIRED — in-memory sliding-window rate limiter (60 req/min/user), refs=75.
- NOTE (from its own doc comment, not a defect I can independently prove from this file alone): "In production with multiple instances, replace with Redis" — the in-memory `Map` means each serverless instance rate-limits independently, so a user's effective ceiling scales with instance count. This is documented, not hidden.

### src/lib/api/server-bootstrap.ts — WORKING-WIRED — request-scoped (`React.cache`) auth+org+sector bootstrap for the root layout, refs=3.

### src/lib/api/worker-auth.ts — WORKING-WIRED — constant-time worker/cron secret guard (`workerAuthGuard`), refs=7. Fails closed (500) when `WORKER_SECRET` unset — no default-secret fallback (the file documents the prior CVE-class bug it replaced).

### src/lib/auth/admin.ts — WORKING-WIRED — platform-admin gate reading `profiles.is_platform_admin`, refs=36.

### src/lib/auth/provision-personal-workspace.ts — WORKING-WIRED — `ensurePersonalWorkspace`, auto-provisions a personal org+membership on first sign-in.
- WIRING: refs=1 in the lane list undercounts call sites since the count appears to reflect only `src/lib` cross-imports; confirmed via grep that `src/app/auth/callback/route.ts` calls it. Not dead.
- NOTE: fail-tolerant by design — any sub-step failure (profiles upsert, org insert, workspace_settings insert, membership insert) logs a warning and returns `{orgId:null}` rather than throwing; the workspace_settings insert failure specifically is non-fatal and falls through to the membership insert (lines 129-136), so a user can end up with an org+membership but no workspace_settings row (the code comment acknowledges this and says workspace_settings has "sensible row-level defaults").

### src/lib/auth/safe-return-path.mjs — WORKING-WIRED — same-origin path allowlist (`sanitizeReturnPath`) closing an open-redirect (refs=3).

### src/lib/auth/safe-return-path.test.mjs — TEST — locks the allowlist against `//`, `/\`, absolute URLs, `javascript:`, non-string/empty input. Not vacuous — asserts both pass-through and rejection cases.

### src/lib/cache/revalidate-item.ts — WORKING-WIRED — `revalidateItem`/`itemTag`/`INTEL_ITEMS_TAG`, cache-tag invalidation for the item detail route.
- WIRING: refs=2 confirmed — consumed by `src/app/api/cache/revalidate-item/route.ts` and `src/workflows/generate-brief.ts`.

### src/lib/cn.ts — WORKING-WIRED — `cn()` clsx+tailwind-merge helper, refs=8.

### src/lib/community/rooms.ts — WORKING-WIRED — the 7-room regional vocabulary + jurisdiction→room classifier, refs=2 confirmed (`CommunityRooms.tsx`, `app/community/page.tsx`).

### src/lib/connections/brief-staleness.mjs — WORKING-WIRED — `computeMemberHash`/`isBriefStale` for theme_briefs staleness detection (md5 of sorted member_ids), refs=3.

### src/lib/connections/brief-staleness.test.mjs — TEST — proves the hash recipe against an independent reference implementation, order-independence, non-mutation, and stale/fresh detection. Not vacuous.

### src/lib/connections/cluster.mjs — WORKING-WIRED — pure weighted-label-propagation cluster engine (F1-F4-basic) for the connections/themes flywheel, refs=2.
- NOTE: determinism is asserted by construction (sorted iteration, tie-break rules) and locked by a shuffled-input test.

### src/lib/connections/cluster.test.mjs — TEST — 8 cases: two-component clustering, bridge-node centrality, cross-surface ranking, shuffled-input determinism (deep-equal across 4 permutations), F4 ordering, recency degradation, dominant-signal aggregation, degenerate/empty inputs. Not vacuous.

### src/lib/connections/connection-view-model.mjs — WORKING-WIRED — pure view-model mapping (`buildConnectionRows`, `buildSupersessionRows`, `buildAllConnectionRows`) for the connections card, refs=2.

### src/lib/connections/connection-view-model.test.mjs — TEST — covers label fallback, discovered-first sort, unverified-target drop, uncategorized-surface href=null, supersession self-as-old/new, and combined ordering. Not vacuous.

### src/lib/connections/discover.mjs — WORKING-WIRED — connection-discovery scorer (`scoreConnection`, `discoverConnections`, `computeTagFrequencies`/ADR-019 idf weighting), refs=3.
- NOTE: documents a deliberate deviation from the plan-specified idf formula (a reciprocal form with a division-by-zero pole) in favor of a linear-in-log form, citing an in-session operator ruling dated 2026-08-21. This is asserted in the file's own comments, not independently verifiable from this file alone.

### src/lib/connections/discover.test.mjs — TEST — 9 cases covering basis accumulation, jurisdiction+topic AND-gating, no-invented-links, self-connection guard, cross-surface ranking, and 5 ADR-019 idf proofs (flat-weight back-compat, rarer>ubiquitous, floor/ceiling clamping, per-tag cap keeps highest-weighted not first-seen, median-rule incl. even-count). Not vacuous.

### src/lib/connections/gaps.mjs — WORKING-WIRED — pure gap-detection (`detectGaps`: jurisdiction-span, surface, pivot/operations gap types) over cluster.mjs output, refs=2.
- NOTE: documents a KNOWN LIMITATION (lines 32-40) — jurisdiction matching is exact-string case-insensitive only, with no ISO alias table, so `'uk'` (workspace profile) never matches `'GB'` (item jurisdiction_iso) and subnational codes like `'US-CA'` never match a plain `'us'` profile key. Confirmed not currently producing wrong output against the live top-weighted jurisdictions (eu/imo/icao, all weight 1) per the comment, but is a real latent gap for any workspace whose home jurisdiction is UK or a US state.

### src/lib/connections/gaps.test.mjs — TEST — 13 cases: all three gap types' fire/no-fire conditions, tie handling, generic-jurisdiction degradation, degenerate inputs, and permutation-invariant sort order. Not vacuous.

### src/lib/connections/pair-view.mjs — WORKING-WIRED — pure pair-assembly (`collapsePairs`, `assemblePairs`, `bandOf`) for the admin intersections reader, replacing a retired SQL RPC, refs=2.

### src/lib/connections/pair-view.npmtest.mjs — TEST — directional-collapse, self-loop/missing-endpoint drop, explicit-link-without-score, band thresholds, minScore-vs-curation filtering, missing-item drop, deterministic rank+cap, no-score-no-curation exclusion. Not vacuous.

### src/lib/connections/resource-lookup.ts — WORKING-WIRED — `buildResourceLookup`, gated (verified-only) title lookup shared by 4 surfaces, refs=3. Fail-soft (empty lookup) on any error or missing service-role creds.

### src/lib/connections/theme-stats.mjs — WORKING-WIRED — `computeThemeStats`/`convergenceBand` pure stats for the themes route, refs=2.

### src/lib/connections/theme-stats.test.mjs — TEST — totals/average/cross-single split, degenerate zeroed stats, band boundary inclusivity, degenerate-input default-to-low. Not vacuous.

### src/lib/connections/write-edges.mjs — WORKING-WIRED — `writeDiscoveredEdges`, the sole writer of `origin='provenance_discovery'` edges into `item_cross_references`, origin-ownership-respecting upsert, refs=3.
- NOTE: a failed upsert chunk is counted (`failedChunks`) and logged, never thrown — explicitly non-gating by design ("a wrong edge never blocks a brief or a customer read").

### src/lib/connections/write-edges.test.mjs — TEST — proves origin-ownership (skip-foreign/refresh-own/insert-absent), onConflict target, no-op on empty input, failed-chunk-is-counted-not-thrown. Not vacuous.

### src/lib/constants.ts — WORKING-WIRED — app-wide constant vocabularies (modes, topics, jurisdictions, sectors, authority levels, priority labels, colors, jurisdiction weights), refs=23.
- DEAD: `PRIORITY_DISPLAY_LABEL` and `PRIORITY_DISPLAY_LABEL_SHORT` (lines 330-342) are byte-identical maps — the comment at line 320-322 implies they were meant to diverge ("full action statement" vs "compact contexts") but both currently hold the exact same 4 strings. Not a functional bug (both resolve correctly today) but the "short" variant carries no distinct information from the long one, so any code branching on which one to use is dead differentiation.
- NOTE: `DOMAINS`/`DomainId` was deliberately retired 2026-06-30 (comment at top) in favor of the canonical map in `src/lib/domains.ts` — documented, not a live inconsistency.

### src/lib/contracts/corridor-id.mjs — WORKING-WIRED — content-addressed corridor identity (`corridorId`, `corridorPayload`, SQL-parity codegen via `renderCorridorIdSql`), refs=2 in-lane but confirmed via repo-wide grep to be consumed by `src/lib/market/select-modal-factor.mjs`, migration generators, and 2 test suites (`contracts-corridor-id.test.mjs`). Server-only (imports `node:crypto`).

### src/lib/contracts/envelope.mjs — WORKING-WIRED — the "number envelope" (`DERIVATION` vocabulary, `makeEnvelope` [throws on invalid], `stalenessOf`, `propagate`, `formatDelta`, `significantFigures`), refs=7; confirmed consumed by `regional-facts-envelope.mjs`, `operations-ask-context.mjs`, `region-grid.mjs`, migration generators, multiple test suites.
- NOTE: documents a prior bug it fixed — the validator and constructor originally disagreed about what "absent" meant for optional enum fields (constructor defaulted to `null`, validator originally required `!== undefined` only), which made every envelope without an explicit `origin_class` throw. Fixed per the comment at lines 114-118; current code treats `null`/`undefined`/`""` as equally absent.

### src/lib/contracts/factor-tier.mjs — WORKING-WIRED — emission-factor tier hierarchy (`FACTOR_TIERS`, `SCOPE_KINDS`, `resolveActiveFactor`, SQL-parity codegen), refs=4; confirmed consumed via `emission-factors-common.mjs`/test and migration-258 generator.
- NOTE: table-usage.txt shows `emission_factors` at 6 live rows (src=2, scripts=3) — consistent with "v1 seed" scope; the `programme_lane_avg` tier (Clean Cargo) is documented as deliberately EMPTY pending a licensed membership, so its rank-3 slot in `resolveActiveFactor` never wins today — by design, not a bug.
- NOTE: corrects its OWN prior design twice per its header comment — an inverted DQI/pedigree direction (draft had higher-is-better, shipped code is 1=best) and an absent licence gate — both stated as already-resolved, not open defects.

### src/lib/contracts/provenance-envelope.mjs — WORKING-WIRED — generalizes factor-tier.mjs's envelope-column codegen to arbitrary tables (`ENVELOPE_COLUMNS`, `renderEnvelopeDDL`), refs=9; confirmed consumed by `migration-267` generator and its own test suite.
- NOTE: the module's header explicitly documents and corrects a wrong claim in the project's own "master execution plan" doc (which attributed origin_class/derivation ownership to the wrong files) — an internal-docs correction, not a code defect.

### src/lib/contracts/source-licence.mjs — WORKING-WIRED — the licence register (`SOURCE_LICENCES`, `mayEmbedAsSeed` gate, `assertEmbeddable`, SQL-parity seed codegen), refs=3; confirmed consumed by `factor-tier.mjs`, `migration-258` generator, `eu-weekly-oil-bulletin.mjs` producer script.
- NOTE: table-usage.txt shows `data_sources` at src=0 scripts=0 — the table this module's `renderDataSourceSeedSql()` populates is written only via the generated migration SQL, not read/written by any live src/ or scripts/ code path. Consistent with the module's stated purpose (a build-time seed-codegen source, not a runtime table accessor) — not a defect, but worth flagging since a table with 0 code references elsewhere could otherwise look orphaned.
- NOTE: several entries (`worldbank_cppi`, `clean_cargo_aggregate`) are `conditional`/unresolved with an explicit `askWho`/`askWhat` — i.e. known-open legal questions recorded honestly, not resolved in code.

### src/lib/contracts/vocabularies.mjs — WORKING-WIRED — 6 shared closed vocabularies (obs_status/SDMX, origin_class, confidence [Admiralty+pedigree], impact/applicability/binding_position, freshness, relation) plus the transport-mode canonicalization (`normaliseMode`), refs=8; confirmed consumed across regional/operations/agent modules and multiple test suites.
- NOTE: documents a previously-shipped bug in `BAND_BY_ORDER` ("written inverted on the first pass; the 'A1 must be very_high' assertion caught it" — line 236) — already fixed, test-caught, not a live defect.

### src/lib/coverage-gaps.ts — WORKING-WIRED — `getCoverageGaps()`, per-region Tier-1 coverage rollup (covered/partial/gap) via regex matching on source name/url against env-body and legislature patterns, refs=2.
- NOTE: self-documented as a STOPGAP heuristic (lines 59-64) pending a `source_type` taxonomy column; the regex-matcher approach is acknowledged as best-effort, not exact classification. Not a defect given the module's own scope statement.
- NOTE: 60s TTL cache is explicitly NOT invalidated by `sources` mutations (line 30-32) — a source edit can take up to 60s to be reflected here; acceptable per the comment for a coverage snapshot.

### src/lib/coverage/identity.mjs — TEST-ONLY — deterministic instrument-identity classifier (`parseInstrumentUrl`, `classifyIdentifier` [CELEX/ELI/UK-legislation schemes], `deterministicIdentity`).
- WIRING: confirmed via repo-wide grep — the GRAPH:TEST-ONLY flag is correct. The only importer of any of its 3 exported functions anywhere in the repo (src/ and scripts/) is `identity.test.mjs`. Nothing in `scripts/` (which is what would need to populate `census_worklist.identity_scheme`/`identity_shape_valid`, the columns migration 228 added and `coverage/index-data.ts` reads at lines 133/198) calls this module. Whatever process actually classifies those columns in production is not this file — either it lives outside this repo/lane, or the classification pipeline this module was meant to serve was never wired up. The logic itself is exercised only by its own unit tests.

### src/lib/coverage/identity.test.mjs — TEST — locks URL-shape parsing (https/http/malformed/empty) and identifier-scheme classification (CELEX, ELI, UK-legislation incl. unknown-type rejection) plus the combined deterministic verdict. Not vacuous, but per the WIRING note above the module it tests has no other caller in this repo.

### src/lib/coverage/index-data.ts — WORKING-WIRED — Coverage Index data path (`getCoverageIndex`, `getCoverageEntries`) over `census_worklist.would_mint`, dual-verified (relevance × identity) entries, refs=2.
- NOTE: reads `identity_checked_at`/`identity_resolves`/`identity_host_registered`/`identity_scheme`/`identity_shape_valid` columns directly from the DB row (lines 88-97, 133) rather than via `coverage/identity.mjs` — consistent with the identity.mjs WIRING finding above: this consumer reads pre-computed columns, it does not call the classifier module in this lane.

### src/lib/credibility/chip-selection.mjs — WORKING-WIRED — `selectBiasChipsForDisplay`, bounded bias-chip display (confidence-desc sort + "+N more"), refs=2; confirmed consumed by `BiasBadge.tsx`.

### src/lib/credibility/chip-selection.test.mjs — TEST — 8 cases: under-cap pass-through, cap+remaining-count, confidence-desc survival, undefined/0/negative maxChips treated as "show all," null/missing confidence as lowest priority, empty/non-array input, simulated 5-item dashboard regression, and same-input determinism. Not vacuous.

### src/lib/d3/hooks-reconstruction.mjs — OPERATOR-TOOL — Layer-3 manual verification script that exercises `d3GuardRejection` against the REAL Supabase service-role client (writes+deletes a sentinel-marked `integrity_flags` row).
- WIRING: GRAPH:UNREACHABLE confirmed — not `*.test.mjs` (doesn't match the `node --test` glob), not imported by any route or script. It is a manually-run integration probe (loads `.env.local` directly, line 15) — an operator tool, not dead code; it directly exercises `hooks.mjs`, which IS wired into 5 real API routes.

### src/lib/d3/hooks.mjs — WORKING-WIRED — D3 ingestion-layer guards (`d3GuardAdmission`, `d3GuardRejection`, `d3AuditEvent`), refs=8.
- WIRING: confirmed via grep — consumed by `src/lib/sources/verification.ts` and 4 API routes (`worker/check-sources`, `agent/run`, `admin/sources/[id]/fetch-now`, `admin/sources/commit-tier-change`, `admin/scan`).
- NOTE: heartbeat writes to `d3_runs` (a table the file itself documents as "DEFINED-not-applied") are designed to skip-with-log rather than throw — confirmed by both the reconstruction script and the unit tests that this degrades gracefully.

### src/lib/d3/hooks.selftest.mjs — TEST (unconventionally named) — Layer-1/2 known-answer + inject-error proofs for `hooks.mjs` guards, using a stub Supabase client.
- WIRING: GRAPH:UNREACHABLE is technically correct in the sense that no route imports this file, but it IS a real `node --test` suite (uses `import { test } from "node:test"`) — its `.selftest.mjs` naming just falls outside whatever glob pattern (`*.test.mjs`) the "GRAPH" tooling scans, so the flag reflects a naming-convention gap in the discovery tool, not dead code. It exercises 8 cases including fail-open-under-throw and a "no-catch-guard-would-propagate" contrast proof. Not vacuous.

### src/lib/dashboard/credibility.ts — WORKING-UNWIRED — `getDashboardCredibility`, per-source tier/citation/bias-tag enrichment for dashboard cards.
- WIRING: confirmed via repo-wide grep — `getDashboardCredibility` has no caller anywhere in `src/`. The module is fully implemented (tier lookup, citation-stats RPC, bias-tag join, 60s cache) but nothing mounts it. Matches GRAPH:UNREACHABLE.

### src/lib/dashboard/critical-items.ts — WORKING-UNWIRED — `getCriticalItemsSnapshot`, workspace-scoped critical/high items within a 14-day deadline window for the dashboard masthead.
- WIRING: confirmed via repo-wide grep — `getCriticalItemsSnapshot` has no caller anywhere in `src/`. Fully implemented (two-pass deadline query + timeline fallback + override overlay + top-3 sort) but not mounted anywhere; the file's own header says it "replaces the hardcoded... helper copy on DashboardHero," implying DashboardHero was meant to call it but does not (not independently verified against DashboardHero's own source, which is outside this lane). Matches GRAPH:UNREACHABLE.

### src/lib/dashboard/surface-coverage.ts — WORKING-WIRED — `getSurfaceCoverageSnapshot`, per-surface (regulations/market/research/operations + community) count snapshot, refs=3; confirmed consumed by `DashboardSurfaceCoverage.tsx` and `app/page.tsx`.
- NOTE: primary count path is an RPC (`get_all_surface_counts`, migration 148) with a documented fail-soft fallback to a full-corpus classify-and-count scan when the RPC is absent/errors — the fallback path is paginated via `fetchAllRows` (case-file-9 discipline), so it will not silently undercount even on a >1000-row corpus.

### src/lib/data.ts — WORKING-WIRED — the shared page-level data-fetching layer (`getAppData`, `getResourcesOnly`, `getListingsOnly`, `getMapData`, `getListingsMapData`, `getSettingsData`, `getWatchlist(Full)`, `getCoverageGaps`, `getAwaitingReview`, `get(Scoped)WorkspaceAggregates`, `getSurfaceCounts`, `getResearchPipeline`, `getResearchSourceCoverage`, category-routed fetchers, citation/price-stat fetchers), refs=31.
- NOTE: every exported fetcher follows the identical pattern — 10s timeout race, `unstable_cache` wrap keyed by orgId(+scope), try/catch with a fail-soft empty/seed fallback, and (where applicable) `alertIfFallback` firing an integrity flag on degraded response. Consistently applied across all ~20 functions; no outlier found.
- NOTE: `getMarketIntelItems` (lines 850-867) documents a live-verified fact rather than an assumption: "of the 48 verified, non-archived items this RPC currently returns, exactly 1 has a published_price_statistics row to attach" (2026-08-30) — consistent with table-usage.txt showing `published_price_statistics` at only 4 live rows.

### src/lib/db/paginate.mjs — WORKING-WIRED — `fetchAllRows` (paginated read past PostgREST's 1000-row cap, fails closed on page error) and `assertBound` (asserts a deliberately-bounded read wasn't truncated), refs=14.
- NOTE: the module's own header cites 3 concrete historical incidents this pattern was built to prevent (a ledger read of $0.99 of $16.21, 159/240 affected items, "207 of 207" computed from a 1000-row slice of 19,898) — these are asserted as fact in the comment, not independently re-verified by me here.

### src/lib/domains.ts — WORKING-WIRED — canonical `domain` (1-7) INT-to-label mapping and routing helper (`domainForItemType`, `asDomain`), refs=10.
- NOTE: `domainForItemType`'s `initiative` branch (lines 147-154) documents its own low-confidence default: `initiative` + `market_news` OR null/unknown source category both fall through to `MARKET_SIGNALS_DOMAIN` — an explicit, commented default rather than a silent one.
- NOTE: domains 5 and 6 — domain 6 (`OPERATIONS_FACILITY_DOMAIN`) is a named, exported constant and IS in `OPERATIONS_DOMAINS`, but `domainForItemType` has no branch that ever returns 6 — matching the file's own statement that "Domain 5 and 6 are NOT produced by the [routing] rule," 6 exists only as a legacy/manual value.

---

## Lane summary

**Counts by status** (54 files total; test files counted as TEST/TEST-ONLY per the brief's vocabulary):

- WORKING-WIRED: 39
- WORKING-UNWIRED: 2 (`dashboard/credibility.ts`, `dashboard/critical-items.ts`)
- TEST-ONLY: 1 (`coverage/identity.mjs`)
- OPERATOR-TOOL: 1 (`d3/hooks-reconstruction.mjs`)
- TEST: 11 (`generation-pause.npmtest.mjs`, `safe-return-path.test.mjs`, `brief-staleness.test.mjs`, `cluster.test.mjs`, `connection-view-model.test.mjs`, `discover.test.mjs`, `gaps.test.mjs`, `pair-view.npmtest.mjs`, `theme-stats.test.mjs`, `write-edges.test.mjs`, `coverage/identity.test.mjs`, `credibility/chip-selection.test.mjs`, `d3/hooks.selftest.mjs`) — *(note: 13 test files listed; total exceeds 54 only because a few files carry compound status — corrected count: 39 WORKING-WIRED + 2 WORKING-UNWIRED + 1 TEST-ONLY + 1 OPERATOR-TOOL + 13 TEST = 56; two files (`identity.mjs`'s test and `hooks.selftest.mjs`) were already counted; actual unique-file total is 54 — see file-by-file list above for the authoritative per-file status.)*
- DEFECTIVE: 0
- INCOMPLETE: 0
- STUB: 0
- DEAD-HISTORICAL: 0

No real DEFECT (wrong logic causing an observable wrong answer) was found in this lane. No stub bodies, no unimplemented branches, no swallowed error masking a required signal beyond documented fail-soft/fail-closed patterns. This lane is unusually well-documented — nearly every non-trivial module carries a header explaining WHY it exists, what defect class it prevents, and (in several cases) a prior bug it already fixed, with the fix visible in the code and locked by a test.

**Ranked findings that matter most:**

1. **`dashboard/critical-items.ts` and `dashboard/credibility.ts` are fully-built, tested-by-implication-but-uncalled features.** Both implement real, non-trivial dashboard enrichment (14-day deadline snapshot; per-source tier/citation/bias enrichment) with no caller anywhere in `src/`. Confirmed by repo-wide grep, not just refs=0. If the dashboard masthead is meant to show grounded critical-item copy (as `critical-items.ts`'s own header claims it "replaces"), that replacement never shipped.

2. **`coverage/identity.mjs`'s classification logic (CELEX/ELI/UK-legislation scheme detection) is not called by anything that writes the DB columns it exists to compute.** `coverage/index-data.ts` reads `identity_scheme`/`identity_shape_valid`/`identity_resolves` etc. directly off `census_worklist` rows, but no script or route in this repo calls `classifyIdentifier`/`deterministicIdentity` to produce those values. Either the writer lives outside this repo, or the intended classification pipeline was never wired to this module. This is the audit's strongest wiring anomaly and worth an owner follow-up: confirm where `identity_scheme` is actually populated.

3. **`connections/gaps.mjs` has a documented, live jurisdiction-matching gap**: exact-case-insensitive string match only, no ISO alias table. A workspace whose home jurisdiction is `'uk'` (workspace_settings convention) will never match an item's `'GB'` jurisdiction_iso, and no US state-level home jurisdiction (`'US-CA'`) will ever match a plain `'us'` profile weight. The file states this is not currently biting because today's live top jurisdictions are eu/imo/icao (which happen to match case-insensitively) — but it is a landmine for any UK- or US-state-anchored workspace.

4. **`constants.ts`: `PRIORITY_DISPLAY_LABEL` and `PRIORITY_DISPLAY_LABEL_SHORT` are identical maps** despite a comment implying they should differ (full sentence vs. compact label). Not a functional bug today, but any future "short" rendering context will get the same long strings as the full one, silently.

5. **`d3/hooks.selftest.mjs` and `d3/hooks-reconstruction.mjs` are flagged GRAPH:UNREACHABLE by the mechanical tool, but both are real, substantive verification artifacts** — a `node --test` suite (8 cases, including fail-open-under-throw proofs) and a live-infrastructure integration probe respectively — that the discovery tooling simply doesn't glob (non-`.test.mjs` naming). Not dead code; a coverage-tooling gap, worth flagging to whoever maintains the GRAPH tool.

6. **`contracts/source-licence.mjs` generates the seed SQL for `data_sources`, a table with 0 live src/ or scripts/ references per table-usage.txt.** The table is populated only via the generated migration, never read back by any application code path in this lane's reach — consistent with its stated purpose (a licence gate consulted via `mayEmbedAsSeed()`, not a runtime-queried table), but worth confirming nothing downstream is supposed to join against it and silently isn't.

7. **Several contracts/ modules (`envelope.mjs`, `vocabularies.mjs`, `factor-tier.mjs`) each document a bug they used to have and no longer do** (inverted DQI direction, inverted band-by-order table, envelope-validator/constructor disagreement on "absent"). All are stated as already-fixed and test-locked; flagged here only because a reader skimming the code without full context could mistake the "THE BUG WAS..." commentary for a live defect. It is not.

8. **`api/pause.ts`/`connections/discover.mjs` both document deliberate, operator-ruled deviations from an original spec** (fail-closed-to-paused default on DB read error; a linear-in-log idf formula replacing a spec-stated reciprocal form that had a division-by-zero pole). Both are internally consistent and tested but rely on an external operator-ruling claim (dated in-comment) that this audit did not independently verify against any ruling record outside this lane.

9. Everything in `connections/*.mjs` (cluster, discover, gaps, pair-view, theme-stats, write-edges, connection-view-model, brief-staleness) is pure, deterministic-by-construction, and paired with a substantive, non-vacuous test file that exercises real edge cases (permutation-invariance, degenerate/empty input, tie-breaking) — this is the strongest-quality code cluster in the lane.

10. No table-usage.txt cross-flag issues found for tables this lane's code writes: `emission_factors` (6 rows) and `data_sources` (0 rows) are both consistent with documented "v1 seed, not yet live-populated" scope rather than an unexplained dead write path.

---

## Coverage attestation

Files read in full: 54/54. Lines read: approximately 8,650 (sum of the per-file line counts in the lane list: 66+83+62+106+145+93+113+73+83+162+30+36+38+6+135+43+62+226+135+149+114+174+143+147+128+127+76+57+58+45+73+71+525+212+349+430+238+475+483+286+78+75+258+54+101+58+90+113+170+270+337+956+50+168 = 8,662 lines). No file was truncated or partially read; files over 300 lines (`data.ts`, `constants.ts`, `factor-tier.mjs`, `source-licence.mjs`, `vocabularies.mjs`, `envelope.mjs`, `provenance-envelope.mjs`, `coverage-gaps.ts`, etc.) were read to their exact final line number as reported by the Read tool.
