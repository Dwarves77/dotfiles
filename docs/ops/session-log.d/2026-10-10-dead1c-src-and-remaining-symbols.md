# 2026-10-10 DEAD-1c (dead1c-src-and-remaining-symbols): dead exported symbols under src/ plus the named script and discipline rows

Lane DEAD-1c, branch `lane/dead1c-src-and-remaining-symbols`. This is the resumed lane: two earlier agents were killed mid-work and left an uncommitted
tree; every change in it was re-verified here before it was kept, and the lane was merged with origin/master (6c00df17) after DFIX-2 (1073) and SEC-8 (1071)
touched `src`.

## Accomplished

- Census 2a/2b rows under `fsi-app/src/**`: 399 symbols in 215 census rows. A1 (dead-strict) symbols deleted with their now-unused helpers; A2 symbols
  lose only the `export` keyword. One census file (`src/lib/sources/instrument-identity.ts`) is already gone (DEAD-1, PR 1007).
- `scripts/verify/defect-signature-scan.mjs`: the six census 1116 re-exports (REUSE_MIN, NAMED_ACTS, extractIdentifiers, spanHasIdentifier,
  detectConflate, extractNumbers) removed; `scanItem` and `detectNumeric` stay exported (the golden imports them).
- `supabase/migrations/383_drop_claim_provenance_verified_by.sql` (NOT APPLIED header; the executor applies it): drops `section_claim_provenance.verified_by`.
  `supabase/seed/apply-114.mjs` stops writing the column (its CASE 7 now sets `verified_at` only).
- `src/lib/supabase-server.ts` self-duplication (DFIX-1 F45 row) deduped: one aggregates mapper (`mapAggregatesRaw`), one body for each of the
  fetchResourcesOnly/fetchListingsOnly pair and the public pair (`loadResourcesWithOverridesPayload`, `loadPublicResourcesPayload`), one body for both
  /map fetchers (`loadMapDataPayload`), shared payload interfaces. Behaviour and every exported signature are unchanged.

## Method [CONFIRMED]

- The diff against origin/master was classified hunk by hunk: 318 changed lines are exact `export X` to `X` pairs; the remaining hunks are deletions in 28
  files, every one a census 2a symbol, plus the supabase-server dedupe.
- For every symbol whose export was removed or whose definition was deleted (421 names), the tracked tree was tokenised once and every hit outside the
  defining file was read; comments naming a symbol that still exists were not treated as use. No code importer of any removed export exists.
- Census 2a/2b src rows were re-read against the working tree: 0 of the 399 symbols are still exported.
- Tests run with `node --test`: the 163 `.test.mjs` files and 117 `.npmtest.mjs` files that name a changed file (2,686 and 1,149 tests, 0 failures after the
  mapper revert below), and `defect-signature-scan.golden.mjs` (PASS).

## Read and reused

CLAUDE.md, COMMON.md and the DEAD-1c brief, the DEAD-1b log (Method, NOT done, Open items), census sections 2a/2b and the named lines, ADR-043, the
fitness manifest loader, the remediation-discipline skill and the environmental-policy skill (loaded on a hook block), `migrations/368` header and the
sibling-test convention. Reused DEAD-1b's method unchanged; no new tooling.

## Decisions

- The shared mapper (`baseResourceFields`, used by `mapWorkspaceItemRows` and `rpcRowToResource`) is kept. The two source-text tests that counted 3 mapper sites (`src/__tests__/jurisdiction-iso-mapping.test.mjs`, `origin-class-mapping.test.mjs`) now count 2 (the shared helper plus the detail mapper), by coordinator grant on PR 1087.
- CI's ESLint (`--max-warnings=0`) found census A2 symbols that were unused even inside their own file. The 10 `src/lib/data.ts` functions (getMapData, getAwaitingReview, getSurfaceCounts, getResearchPipeline, getPublicResearchPipeline, getMarketIntelItems, getResearchItems, getOperationsItems, getTechnologyItems, getSourceCitationStats) have no code reference anywhere and were deleted, with the cached wrappers, types, constants, `getScopedWorkspaceAggregates` and imports that only they used. Whole-project `eslint --max-warnings=0` and `tsc --noEmit` run clean locally.
- `PRIORITIES` (constants.ts) keeps its export (used as `typeof PRIORITIES`); `renderTierConstraintsSql` and `renderEnvelopeColumnsSql` (factor-tier.mjs) keep theirs because migration 258 names them as its generator source.
- `estimated_values`: not dropped. Migration 286 attaches the outbox trigger, `drain.ts` keys it, F32/RD-57 and `EstimatedFigure` read it, and ADR-024
  decision 2 keeps estimates. Brief rule: a table with a trigger, drain.ts or F32 reference is a consumer.
- `regional_data_facts`: not dropped. ADR-043 "What stays" names every `regional_data_facts` producer and row; producers.yml writes it and migration 373 wires its outbox.
- `community_topics` and `community_topic_groups`: not dropped. `shell-context.ts` reads them and `CommunitySidebar` renders "My topics".

## UX compliance

- Only the `export` keyword was removed from `.tsx` files, plus the deletion of the unmounted `SubTabBar` in `AccountPrimitives.tsx` (superseded by `TabRow`,
  per the comments in `UserProfilePage.tsx` and `TabRow.tsx`). No rendered row, title, target or layout changed. [NOT-WORK: no customer-visible markup changed]

## Harness families owing a run

Governing files of five families changed (export removals only); each family's live governing hash moves and it owes a run. Per CONVENTION.md (GATE-3) no marker is added. Each is [WORK: EXEC-4] (the executor dispatches them after merge).

- inaccessible-triage (primary-fallback.mjs, seek-more.mjs, officialness.mjs)
- question-answers (infer-from-question.ts)
- source-sweep (register-walk.mjs)
- statutory (statutory-rows.ts)
- structured-actions (extract-sections.ts)

## NOT done

- Test-only exports (census 2c) and the convention-loaded rows (2d, 2e) other than the lines this lane names: a symbol used only by its own test stays
  exported by the method. [NOT-WORK: scope statement, method keeps own-test seams]
- Migration 383 has no sibling static test; the migration-proof job applies it and its own DO blocks assert the abort conditions and the final state. [NOT-WORK: the apply proof is the check; a test file is outside the write set]

## Open items

- Migration 383 must be applied by the executor after CI is green. [WORK: owed]
- `createPgPool` (`scripts/lib/batch-primitives.mjs`) stays: `.claude/skills/remediation-discipline/references/primitive-extraction-and-codification.md` line 11 and
  `worked-examples.md` line 11 cite it. [NOT-WORK: kept by skill citation, removal is a skill edit plus a skill-ack]
