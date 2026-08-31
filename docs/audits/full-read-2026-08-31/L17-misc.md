# Lane L17-misc — Full-Read Audit Report

Repo: /root/work/dotfiles/fsi-app. 46 files, all read in full (no file exceeded 2000 lines; largest was 659).

---

## Per-file verdicts

### `src/__tests__/contracts-assumption-register-migration.test.mjs` — TEST — anti-drift proof for migration 271 (assumption_register)
Pins: migration 271 on disk is byte-identical to `renderMigration()` from `scripts/gen/migration-271-assumption-register.mjs`; the narrowed 9-column envelope subset excludes `currency`/`reference_period`; schema-only (no INSERT/UPDATE/DELETE); no envelope column is NOT NULL; `assumption_key` is the sole UNIQUE key; status CHECK; self-referential FK; RLS read-only. Not vacuous — every assertion reads real migration SQL text or real generator output, none is a tautology.
  - NOTE: `assumption_register` (table-usage.txt) has 0 live rows, src=0, scripts=3 — this table is schema-only in production; no code path has ever written a row (matches this test's own "schema-only" pin).

### `src/__tests__/contracts-corridor-id.test.mjs` — TEST — proof for deterministic corridor identity (`src/lib/contracts/corridor-id.mjs`)
Pins determinism, case/whitespace normalization, three named collision classes (routing/via-order, null-ordinal, delimiter-injection), multi-byte byte-length hashing, non-canonical-mode refusal, degenerate-corridor refusal, and JS/SQL parity of the generated SQL twin. Substantive, non-vacuous.

### `src/__tests__/contracts-envelope.test.mjs` — TEST — proof for the number envelope (`src/lib/contracts/envelope.mjs`)
Pins the three required fields, zero-fill guard (a missing observation may not carry a value — the "silent 0" defect class), range bracketing, derivation/statutory ordering, freshness state machine (current/ageing/stale/frozen/unknown), significant-figures rounding, pp-vs-% formatting, and weakest-link propagation. Substantive.

### `src/__tests__/contracts-licence-and-tier.test.mjs` — TEST — proof for the source-licence register + factor-tier resolver
Pins the licence gate (permitted/conditional/unverified/prohibited), the four confirmed-blocked sources and three assumed-safe-but-not sources, unregistered-source fail-closed, DQI direction (pedigree 1=best), tier resolution order, and that a licence-blocked candidate is skipped with the skip reported (never swallowed). Non-vacuous; several tests are explicitly written to catch "the register changed under me" false positives (structural assertions rather than pinning today's membership).

### `src/__tests__/contracts-market-series-migration.test.mjs` — TEST — anti-drift proof for migration 268 (market_series)
Same class as the assumption_register proof: byte-identical to generator, full envelope shape, schema-only, `UNIQUE(series_key, reference_period)`, RLS read-only. Non-vacuous.
  - NOTE: `market_series` has 6 live rows, src=6, scripts=5 — the table is populated and actively read/written, unlike assumption_register.

### `src/__tests__/contracts-provenance-envelope.test.mjs` — TEST — proof for the shared envelope-column DDL generator
Pins re-export identity (never a second array), the exact 7 origin_class / 9 derivation values, byte-identity against migration 258's CHECK expressions, migration 267 byte-identity, determinism, column-order fidelity, and that every envelope column carries a real COMMENT. Non-vacuous.

### `src/__tests__/contracts-vocabularies.test.mjs` — TEST — proof for the 11 shared vocabularies
Pins frozen/immutable, code===key, ordering, `weakestOriginClass` propagation (commutative, idempotent, unknown-fails-weakest), Admiralty vs pedigree confidence bands landing in one shared band vocabulary, ICD-203 likelihood/confidence separation, impact×applicability independence, and relation involution/symmetry. Non-vacuous.

### `src/__tests__/domain-laundering.test.mjs` — TEST — regression guard for the `row.domain || 1` coalesce trap
Source-text-greps `src/lib/supabase-server.ts` for the reintroduced pattern, and pins `surfaceOf()`'s honest no-data behavior (`uncategorized`, never `regulations`). Non-vacuous, narrow, well-targeted.

### `src/__tests__/jurisdiction-iso-mapping.test.mjs` — TEST — proof for `normalizeJurisdictionIsoColumn` + regression lock on 3 mapper call sites
Pins array pass-through (incl. empty array ≠ undefined), undefined/null/scalar degrade, and source-text-counts exactly 3 call sites of the guard in `supabase-server.ts` (was 1 before the fix this test locks in). Non-vacuous.

### `src/__tests__/leakage-fix-classifier.test.mjs` — TEST — proof for `src/lib/domains.ts` domain routing + drain seedRow contract
Pins `domainForItemType` routing table against migration 101's CASE, `asDomain` never silently coercing garbage to 1, and (via a historical/superseded local mirror of `seedStubIntelligenceItem`, explicitly marked as no longer tracking a live file) that domain flows through to an insert payload honestly. Non-vacuous.
  - NOTE (self-documented in the file, lines 143-148): section 4's `buildSeedRow` no longer mirrors a live route — the seed path it modeled was retired in favor of `applyStagedUpdate → mintIntelligenceItem`. The test still exercises the classifier contract itself, which is live, so it is not vacuous, but its claim to be verifying the drain worker's actual insert shape is outdated. This is documented honestly in the file's own comment, not a hidden defect.

### `src/__tests__/lineage-backfill.test.mjs` — TEST — proof for `src/lib/entities/lineage-backfill.mjs`
Pins the 4-way partition (insert/upgrade/unchanged/skip-foreign) for `item_cross_references` origin=`entity_extraction` writes, non-`entity_extraction` origins never clobbered, deterministic pair-sorted output. Non-vacuous.

### `src/__tests__/market-carbon-overlay-composition.test.mjs` — TEST — seam proof, `select-modal-factor.mjs` → `carbon-overlay-view.mjs`
Composes the two modules end to end (real selector output flowing into the view builder) and pins that `figure` is populated iff `state === "resolved"` across all 7 branch states. Non-vacuous; explicitly documents (in its header) that the mechanized F27 gate does not actually cover this seam (glob scope limitation), so this proof exists by manual diligence, not enforcement.

### `src/__tests__/market-eu-oil-bulletin-parser.fixtures.mjs` — TEST-ONLY (fixture) — committed CSV fixtures for the parser test
Explicitly labeled illustrative, not real published prices. Correctly placed under `__tests__/` to dodge F25's module-liveness false-positive (documented in its own header). refs=1 (its sibling test).

### `src/__tests__/market-eu-oil-bulletin-parser.test.mjs` — TEST — proof for `src/lib/market/parsers/eu-weekly-oil-bulletin.mjs`
Pins full-envelope+origin_class on every row, series_key format, dual-unit convention, `n_observations`, error-as-warning-never-throw for every malformed input class, and the closed PRODUCTS vocabulary. Non-vacuous.

### `src/__tests__/market-producer-composition.test.mjs` — TEST — seam proof, parser → planner → live-constraint check
Feeds real (documented-as-production-verified) CSV through the parser then the planner, and asserts every planned CREATE satisfies the *live* `market_series` constraints (not just the planner's own shape) — explicitly framed as closing the exact "WO-9 defect class" gap (a row that satisfies each layer in isolation but not the live table). Also proves idempotency and the no-reference-period skip path. Non-vacuous, well-reasoned.

### `src/__tests__/market-refresh-published-price-statistics.test.mjs` — TEST — proof for `src/lib/market/refresh-published-price-statistics.mjs`
Pins that `SERIES_ITEM_MAP` is empty today (line 24-26) and that with the default empty map `deriveDisplayRows` produces zero rows — i.e., this pipeline has never populated `published_price_statistics` in production. Also proves the transform against a synthetic (explicitly-marked-non-real) mapping. Non-vacuous.
  - NOTE (cross-checked against table-usage.txt): `published_price_statistics` has 4 live rows, src=3, scripts=2. Since this test proves the map is empty and therefore this module writes zero rows, **the 4 live rows were written by a different path**, not this market_series → refresh pipeline. Worth flagging so nobody assumes this module is the producer of record for that table's current contents.

### `src/__tests__/market-series-board-view-model.test.mjs` — TEST — proof for `src/lib/market/series-board-view-model.mjs`
Pins currency-symbol honesty (never fabricates a symbol for an unknown code), latest-per-series reduction, registry-order grouping, `unregistered` bucket (never silently dropped), empty-table honest state (`registered_unpopulated` vs `not_built`), and `id` passthrough for watch-mount identity. Non-vacuous.

### `src/__tests__/market-series-registry.test.mjs` — TEST — proof for `src/lib/market/series-registry.mjs`
Pins the 4-entry registry order, that stubs carry no `producerScript`/`parserModule`, and `isImplementedSeriesKey`. Non-vacuous.

### `src/__tests__/market-write-market-series.test.mjs` — TEST — proof for `src/lib/market/write-market-series.mjs`
Pins create-vs-update keyed on `(series_key, reference_period)`, idempotent re-run behavior, immutable identity columns in the UPDATE patch, and no-reference-period skip. Non-vacuous.

### `src/__tests__/oil-bulletin-workbook.fixtures.mjs` — TEST-ONLY (fixture) — committed XLSX-XML fixtures, primary-verified structure
Header explicitly documents this fixture replaced a prior revision whose shape did not match the real file (caused a live CI failure, exit 2, 2026-08-30) and states values are illustrative, not real. refs=1.

### `src/__tests__/oil-bulletin-workbook.test.mjs` — TEST — proof for `src/lib/market/oil-bulletin-workbook.mjs` (401 lines, read in full)
Extensive coverage: shared-string/entity decoding, sheet-name resolution by rId (not position), machine-id-based EU-block header resolution (never confused with EUR_/country blocks or the legend string), row-1/row-2 disagreement detection, Excel-serial and ISO date parsing, newest-first extraction that is provably not fooled by document order (explicit shuffled-order test), and footer/legend/"Notes:" row classification. Ends with an end-to-end test feeding this module's output into the CSV parser with zero warnings. Non-vacuous, thorough.

### `src/__tests__/org-ban-check.test.mjs` — TEST — proof for `src/lib/orgs/ban-check.mjs`
Pins banned/ok/error outcomes and that the ban lookup is scoped to both `org_id` and `user_id` (not a global ban). The error case pins fail-closed (never silently allows on a lookup error). Non-vacuous.

### `src/__tests__/prose-renderer-scope.test.mjs` — TEST — regression guard for the ProseSection/GfmSection split
Source-text-based (no component test harness in this repo, documented as deliberate) — asserts `ProseSection` is imported nowhere outside `components/regulations/`, that Operations/Market/Research import `GfmSection`, and that `GfmSection` actually wires `remark-gfm` and matches `ProseSection`'s typography. Non-vacuous, addresses a real historical defect (GFM tables handed to a plain-paragraph renderer).

### `src/__tests__/regional-bls-oews-composition.test.mjs` — TEST — seam proof, BLS OEWS parser → orchestrator core
Feeds a real BLS fixture through `parseOewsResponse → toCandidateRows → latestPerNaturalKey`, asserting every reduced candidate satisfies the *live* `regional_data_facts` constraints — explicitly the regression guard for the 2026-08-30 WO-17 incident (`value` TEXT NOT NULL violation caused by an orchestrator never calling `buildEnvelopeRow` on real parser output, even though each layer was independently green). Non-vacuous.

### `src/__tests__/regional-eurostat-nrg-pc-205-composition.test.mjs` — TEST — seam proof, Eurostat NRG_PC_205 parser → orchestrator core
Same incident-guard class as the BLS one, plus a second guard specific to this producer: multi-period-per-natural-key collapsing (2 bands × 2 semesters → 2 rows, newest wins), explicitly framed as the second half of the same 2026-08-30 incident (a 23505 unique-violation risk). Non-vacuous.

### `src/__tests__/research-surface-candidate.test.mjs` — TEST — drift guard for the `/research` DB prefilter
Exhaustively cross-checks `isResearchCandidate` against `surfaceOf()` over every (item_type, domain) pair `SURFACE_RULES` can produce, so a future rule addition that would silently undercount research items goes red before the DB query drops rows in production (references a real historical undercount, 31 vs 38 items, live-verified). Non-vacuous.

### `src/__tests__/select-modal-factor.test.mjs` — TEST — proof for `src/lib/market/select-modal-factor.mjs`
Pins the three-state contract (resolved/no_factor/ambiguous), and specifically the "ambiguous wins over partial match" case — a multi-jurisdiction array where exactly one element matches a factor must NOT resolve (would fabricate a corridor). Also pins non-mutation of input and GLOBAL never resolving. Non-vacuous, includes a documented red-then-green history.

### `src/__tests__/surface-admission.test.mjs` — TEST — proof for `canonicalSurfaceForItem` / `itemDetailHref` (the `[slug]` route guard)
Pins per-item-type and per-domain classification, that exactly one of the four routes admits any given item, the four historical cross-surface leaks are now refused, no item is orphaned, href and route-guard direction agree by construction, and the uncategorized→regulations fallback. Exhaustive over the full type×domain matrix. Non-vacuous, addresses a real historical defect (content rendered under a false frame with dropped sections).

### `src/data/audit-date.ts` — WORKING-WIRED — single seed audit-date constant
  - WIRING: imported by `src/lib/data.ts:40` (`import { AUDIT_DATE } from "@/data/audit-date"`). Confirmed live and reachable.

### `src/data/index.ts` — WORKING-UNWIRED — barrel re-export of all legacy seed data, converted to `Resource`/`ChangeLogEntry`/`Dispute`/`Supersession` shapes
  - WIRING CONFIRMED (matches GRAPH:UNREACHABLE): grepped the whole `src/` tree for any import of `@/data`/`../data`/`./data` outside `src/data/` itself — none found. `src/lib/data.ts` (the live data-access layer) imports only `AUDIT_DATE` from the sibling `audit-date.ts`, never anything from `index.ts` or `seed-resources.ts`. The live app's resources/archived/supersessions data all come from Supabase (`supabase-server.ts`), not this file.
  - DEFECT (in dead code — no live consumer, so no production impact): lines 40-48, the `supersessions` conversion sets **both** `old` and `new` to `s.newId`:
    ```
    export const supersessions: Supersession[] = SUPERSESSIONS.map((s) => ({
      old: s.newId,       // newId is an actual resource ID (e.g. "g2", "c1")
      new: s.newId,
    ```
    `old` should identify the *superseded* item, but it is set to the same `newId` as `new`. If this module were ever wired up, every `Supersession.old` would equal `Supersession.new`, making the "superseded-by" pairing self-referential. Confirmed harmless today only because nothing imports this module.

### `src/data/seed-archive.ts` — WORKING-UNWIRED — 4 hardcoded archived-regulation records
  - WIRING: only imported by `src/data/index.ts:8` (`SEED_ARC`), which is itself unwired. Confirmed no other importer.

### `src/data/seed-changelog.ts` — WORKING-UNWIRED — hardcoded per-resource changelog entries (3 resources: t1, o1, o4)
  - WIRING: only imported by `src/data/index.ts:5`. Same dead subgraph.

### `src/data/seed-disputes.ts` — WORKING-UNWIRED — 8 hardcoded pre-seeded disputes
  - WIRING: only imported by `src/data/index.ts:6`. Same dead subgraph.

### `src/data/seed-resources.ts` — WORKING-UNWIRED — maps the 1.23 MB `seed-resources.json` through jurisdiction overrides/sub-tags/conflict tags
  - WIRING: imports `seed-subjurisdictions.ts` and is itself imported only by `src/data/index.ts:4`. Confirmed the live `lib/data.ts` does not import `SEED_RESOURCES` from here (only `AUDIT_DATE` from the sibling file). Same dead subgraph — the whole legacy JSON seed corpus is unreferenced by anything reachable from a route.

### `src/data/seed-subjurisdictions.ts` — WORKING-UNWIRED — sub-jurisdiction tags, jurisdiction overrides, regulatory-conflict tags keyed by legacy resource id
  - WIRING: imported only by `seed-resources.ts`, which is itself unwired. Same dead subgraph.

### `src/data/seed-supersessions.ts` — WORKING-UNWIRED — 5 hardcoded supersession records with timelines
  - WIRING: only imported by `src/data/index.ts:7`. Same dead subgraph.

### `src/stores/navigationStore.ts` — WORKING-WIRED — zustand nav-stack store (tab/focusView/navStack)
  - WIRING: **overturns the GRAPH:UNREACHABLE flag.** The graph's mechanical scan does not follow `next/dynamic()` imports. `src/components/pages/SettingsPage.tsx` lines 34-35 dynamically imports `SupersessionHistory` and `ArchiveViewer` (`const SupersessionHistory = dynamic(() => import("@/components/settings/SupersessionHistory")...)`), both of which statically import `useNavigationStore` from this file (`ArchiveViewer.tsx:6`, `SupersessionHistory.tsx:3`). `SettingsPage` is rendered by `src/app/settings/page.tsx`, a real route. So the chain route → SettingsPage → dynamic(SupersessionHistory/ArchiveViewer) → navigationStore is live; the refs=2 in the ground truth (the two component importers) is correct, but the UNREACHABLE flag is a false negative caused by the dynamic-import boundary.

### `src/stores/resourceStore.ts` — WORKING-WIRED — zustand store for platform resources + workspace/personal override layers, 659 lines read in full
Reviewed all optimistic-write actions (`updatePriority`, `setOwner`, `dismissResource`, `restoreDismissed`, `archiveResource`, `archivePersonal`, `restorePersonal`, `restoreResource`) — every one follows the same optimistic-update-then-rollback-on-failure pattern consistently, and `persistJson`/`persistOverride` surface the server's actual error message rather than swallowing it. `mergeWithOverrides` layering (platform → org override → personal state, personal checked first) matches its own documented precedence. No defect found.

### `src/stores/settingsStore.ts` — WORKING-WIRED — zustand settings store with debounced Supabase persistence
`debouncedSave`'s catch block silently no-ops on a failed `workspace_settings` update (comment: "Silent fail — settings will persist in local state") — this is a deliberate, documented degrade-to-local-only, not a defect. `loadFromWorkspace`'s catch similarly degrades to `{ orgId, loaded: true }` without surfacing the read failure to the UI. No defect found beyond the documented soft-fail behavior; noting it as:
  - NOTE: settings writes/reads to `workspace_settings` fail silently (console-free even) on network/DB error; a user's toggle can appear to work locally while never persisting, with no visible signal. This is a UX gap, not a logic bug, and appears intentional per the inline comment.

### `src/stores/sourceStore.ts` — WORKING-WIRED — zustand store for the sources registry UI (filters, expanded state)
`filterSources` correctly falls back `effective_tier ?? base_tier` per its own documented Phase-1.5 rule. No defect found.

### `src/stores/workspaceStore.ts` — WORKING-WIRED — zustand store for current org/role/sector-profile/weights
`getActiveSectors` correctly returns the full master list when `sectorProfile` is empty (sector-agnostic default). No defect found.

### `src/types/intelligence.ts` — WORKING-UNWIRED — `IntelligenceItem` interface + `resourceToIntelligenceItem()` migration-era converter, 273 lines
  - WIRING CONFIRMED: refs=0 in ground truth; independently grepped for `IntelligenceItem`, `resourceToIntelligenceItem`, `LegacySourceMapping` imports elsewhere in `src/` — no importer found outside this file itself. This is a complete, functioning type + conversion module (maps old `Resource` → a richer `IntelligenceItem` shape, including a manual resource-type mapping table) that appears to have been superseded by the live Supabase-backed `intelligence_items` table and its own TS types (used elsewhere) before ever being wired up. Dead but non-trivial (271 lines of real logic/types), not a stub.

### `src/types/resource.ts` — WORKING-WIRED — core `Resource`/`Dispute`/`ChangeLogEntry`/`Supersession`/`Cluster`/etc. type definitions, 302 lines
refs=36 confirms heavy live use. Read in full; no logic to defect-check (pure type declarations plus extensive inline documentation of field provenance/history). No defect found.

### `src/types/source.ts` — WORKING-WIRED — Source trust-tier framework types (`SourceTier`, `TrustMetrics`, `TrustScore`, promotion/demotion criteria tables), 604 lines
refs=9. Read in full. Line 94's own inline comment flags that the `accessibility_rate` field's plain-English description was previously wrong ("`consecutive_accessible / total_checks` is wrong — this is `(successful_checks / total_checks)`") — this is a doc-comment self-correction on a type declaration, not executable logic, so not a code defect. Lines 249-253 document that the `source_conflicts` surface (table + types + engine) was purged 2026-07-18 as dormant, with the `ConflictOpenedDetails` detail-type retained deliberately as part of a still-live discriminated union. No defect found.

### `src/workflows/erase-step-hygiene.npmtest.mjs` — TEST — source-text regression guard for `eraseStep` in `generate-brief.ts`
  - WIRING: **overturns the plain reading of refs=0.** `.npmtest.mjs` files are a deliberately named exclusion from `.discipline/run-test-suite.sh`'s `node --test` glob (that script's own header, lines 47-50, states so explicitly: "*.npmtest.mjs — tests that import npm deps (jiti) and cannot run in this no-npm-ci job; they run in the CI fitness-check job AFTER `npm ci`"). Confirmed: `.github/workflows/discipline.yml` line 300 globs `git ls-files 'fsi-app/src/**/*.npmtest.mjs'` and runs them in the "App unit tests requiring npm deps" job. So this file IS execution-wired, just via a different CI job than the `run-test-suite.sh` `node --test` glob the other 27 test files in this lane use.
  - Pins two things by regex against `generate-brief.ts`'s source text: (a) `eraseStep` deletes `item_timelines` rows for the erased item, (b) `eraseStep` does NOT blanket-`UPDATE` `recommended_actions` across all open flags, and (c) it inserts one distinct erase-owned flag (`created_by: "research-or-erase"`) instead. Verified against the actual `generate-brief.ts` source read in this lane: all three patterns are present exactly as pinned (lines 425, 430-440 — no blanket update pattern exists). Non-vacuous.

### `src/workflows/generate-brief.ts` — WORKING-WIRED — the canonical brief-generation Workflow (`generateBriefWorkflow` + 10 named steps), 631 lines read in full
  - WIRING: imported by `src/lib/intake/run-intake-cycle.ts:27` and `src/app/api/agent/run/route.ts:9` (matches refs=2 exactly). `generateBriefWorkflow` is `start()`-ed from the API route (`route.ts:165`) and awaited directly from the intake cycle.
  - Reviewed the full orchestration: `preflightStep` (pause/data-audit-block/daily-spend-cap, all fail-closed on read error — lines 133-156), `generateStep` (stored-pool reuse vs forced refresh), `groundStep` (snapshot-first cheap-verify → paid-acquire master switch, `AcquireLockError` handled explicitly), `eraseStep` (fail-closed on the three destructive-cleanup DB calls via `RetryableError`, matching the fix documented in its own comment for a prior silent-swallow defect — "audit 2026-08-09, finding CONFIRMED then fixed"; `item_timelines` delete and the `integrity_flags` insert are deliberately best-effort per inline comment), and the top-level `generateBriefWorkflow` control flow (structural-hold vs reground vs reresearch-then-erase branching, non-optional Layer-B cross-item audit gate with no skip flag). No new defect found; the code matches what its extensive inline comments claim, and the one historically-fixed defect (`eraseStep`'s silent `.update()` swallow) is visibly fixed with the correct `{data,error}` destructure-and-throw pattern at lines 404-421.
  - NOTE: `DAILY_CAP_USD` defaults to $25 via `GENERATION_DAILY_CAP_USD` env var (line 73) — an operator-configurable kill switch for generation spend; `GROUNDING_ACQUIRE_ENABLED` is a separate master switch gating all paid re-grounding (referenced, not defined, in this file — read via `verifyItem`'s deps).

---

## Lane summary

**Counts by STATUS** (46 files):
- TEST: 27 (26 `*.test.mjs` + 1 `*.npmtest.mjs`)
- TEST-ONLY (fixtures): 2
- WORKING-WIRED: 12 (audit-date.ts, navigationStore.ts, resourceStore.ts, settingsStore.ts, sourceStore.ts, workspaceStore.ts, resource.ts, source.ts, generate-brief.ts — 9 — plus 3 more? recount below)
- WORKING-UNWIRED: 8 (index.ts, seed-archive.ts, seed-changelog.ts, seed-disputes.ts, seed-resources.ts, seed-subjurisdictions.ts, seed-supersessions.ts, intelligence.ts)

Recount of WORKING-WIRED: audit-date.ts, navigationStore.ts, resourceStore.ts, settingsStore.ts, sourceStore.ts, workspaceStore.ts, resource.ts, source.ts, generate-brief.ts = 9 files.

9 (WORKING-WIRED) + 8 (WORKING-UNWIRED) + 27 (TEST) + 2 (TEST-ONLY) = 46. ✓

**Top findings, ranked by importance:**

1. **GRAPH:UNREACHABLE false negative on `navigationStore.ts`** (and transitively on `ArchiveViewer.tsx`/`SupersessionHistory.tsx`, outside this lane). The mechanical reachability graph does not follow `next/dynamic()` imports. `app/settings/page.tsx` → `SettingsPage.tsx` → `dynamic(() => import(".../SupersessionHistory"))` / `dynamic(() => import(".../ArchiveViewer"))` → `useNavigationStore` is a live, reachable chain. Any other lane trusting the UNREACHABLE flag for files reached only through `next/dynamic()` should re-check by hand.

2. **refs=0 false negative on `erase-step-hygiene.npmtest.mjs`.** `.npmtest.mjs` is a deliberately-named-and-documented exclusion from the `run-test-suite.sh` `node --test` glob; these files run instead in `.github/workflows/discipline.yml`'s separate "App unit tests requiring npm deps" job (`git ls-files 'fsi-app/src/**/*.npmtest.mjs'`). It is execution-wired, just not via import and not via the primary test glob.

3. **The entire legacy seed-data subgraph (`src/data/index.ts` + 6 seed-*.ts files, 546 lines total) is genuinely dead.** Confirmed by grep: nothing outside `src/data/` imports `index.ts` or `seed-resources.ts`; the live data-access layer (`lib/data.ts`) imports only the 3-line `audit-date.ts` constant from this directory. All resource/archive/supersession/dispute/changelog data the live app renders comes from Supabase now, not this pre-migration JSON+TS seed corpus. This is a full pre-database-migration data layer left in the tree.

4. **Defect inside that dead subgraph** — `src/data/index.ts` lines 40-48: the `supersessions` conversion sets both `old` and `new` to `s.newId`, so `Supersession.old` (which should identify the superseded item) is always identical to `Supersession.new`. Currently harmless only because nothing imports this module; would misbehave immediately if ever re-wired.

5. **`published_price_statistics` has 4 live rows (table-usage.txt) despite `market-refresh-published-price-statistics.test.mjs` pinning that its own module's `SERIES_ITEM_MAP` is empty and therefore writes zero rows.** The 4 live rows were written by a different code path than the market_series→refresh pipeline this test/module covers — worth confirming which producer actually owns those 4 rows before assuming this pipeline is live.

6. **`src/types/intelligence.ts` (273 lines) is a complete, functioning, but entirely unreferenced type + conversion module** (`IntelligenceItem` interface, `resourceToIntelligenceItem()`, `LegacySourceMapping`) — apparently superseded by the live DB-backed intelligence-items types before being wired up. Confirmed refs=0 by independent grep.

7. **`assumption_register` table is schema-only in production** (0 rows, src=0, scripts=3 per table-usage.txt) — migration 271's DDL is proven byte-identical to its generator by this lane's test, but nothing has written to the table yet; WO-20 has shipped schema only.

8. The `contracts-*`, `market-*`, `regional-*`, and `oil-bulletin-*` test suites (23 of the 27 test files) are uniformly substantive: every test asserts a specific, checkable behavior against real module output or real migration SQL text, several explicitly guard against a named historical production incident (WO-17's `regional_data_facts` NOT NULL violation, WO-9's market_series analogue, the domain-laundering `|| 1` coalesce, the ProseSection/GfmSection cross-surface leak, the surface-admission cross-surface content leak). No vacuous tests found in this lane.

9. `generate-brief.ts`'s `eraseStep` visibly carries the fix for a previously-found silent-`.update()`-swallow defect (documented in its own comment, "audit 2026-08-09, finding CONFIRMED then fixed") — the three destructive cleanup calls (`full_brief` null, sections delete, claim-provenance delete) all destructure `{error}` and throw `RetryableError` on failure; `item_timelines` delete and the flag insert remain deliberately best-effort. No new defect found on inspection.

10. `settingsStore.ts`'s `debouncedSave`/`loadFromWorkspace` fail silently (no toast, no visible error) on a `workspace_settings` read/write failure — a documented, deliberate soft-fail-to-local-state, not a logic bug, but worth an owner's awareness: a settings toggle can appear to succeed in the UI while never persisting server-side, with zero user-visible signal.

**Coverage attestation:** files read in full: 46/46. Lines read: 8,186 (sum of the lane file's own per-file line counts, cross-verified against my read-tool output for each file — no file was truncated or partially read; the largest, `generate-brief.ts` at 631 lines and `oil-bulletin-workbook.test.mjs` at 401 lines, were each read in a single Read call with no offset/limit needed).
