# 2026-10-09 lane DFIX-2 (dfix2-surface-defects-residue): the surface and data defects DFIX-1 did not take

Branch lane/dfix2-surface-defects-residue, cut from origin/master 9c303db91. Prior decisions: ADR-046, CLAUDE.md rules 15, 16, 17 and 20, COMMON rule 9 (CI is the gate), spec 08 (flywheel). Rows came from `git grep "WORK: DFIX-2"` on origin/master plus the rows DFIX-1 (PR 1059) listed in its own log as closed.

## Accomplished

Every fact below was confirmed by the test named beside it. "Red" means the new test failed against the previous file (stashed), "green" means it passes now.

| Row | What was built | Test, red then green |
|---|---|---|
| s1a-source-register:21 (host lookup) | `registerCitedSources` looks the cited host up as an EXACT canonical host: the database narrows with `exactHostUrlFilter` (urls that start with the scheme and this host, with or without www, `ilike` patterns with no leading wildcard) and each row is re-checked with `hostOf` in code. A host contained in an unrelated registered url ("example.org" in "notexample.org") is no longer "already registered". | new `exact-host-lookup.npmtest.mjs`: 6 of 7 red against the old file, 7 of 7 green. Fakes of three neighbours (`tier-opinion-dedup`, `source-growth.entry-citations`) gained `.or()`. |
| g7-corrections:37 (match by claim id first) | `suppressedClaimMatcher`: a correction that names the claim's id decides it; the captured machine text decides only for a claim no correction names by id. | `item-corrections.test.mjs`: 1 red, green. |
| g7-corrections:38 (record-grade removal) | `removeClaimText` finds the claim as the same words in the same order, tolerant of whitespace runs (wraps, doubled spaces, CRLF) and markdown-escaped brackets, and takes the list bullet with the claim so no empty bullet is left. A different word, number, order or slot key still does not match. | `suppressed-render.test.mjs`: 2 red (record-grade shape, redact report), 1 guard that passes both ways; green. |
| g7-ui:28 (one batched orphan check) | The Corrections tab no longer makes one API request per item (cap of 40, rate limited). `loadAllCorrections` reads the claims of every item with an active fact correction in chunks of 50 (each chunk paged to the end) and computes orphaned with the SAME `findOrphanedFactCorrections` the per-item route uses. No cap; a failed chunk is counted as unchecked and shown, the list still loads. `CorrectionsTab.tsx` drops the now-unused fetcher argument. | `loaders.test.mjs`: 2 red, 4 of 4 green (chunking over 120 items is 3 reads; failed read counted). |
| s3b-cross-page-surfaces:143 (readable line on the label module) | The candidate-list line for an intersection basis entry names scenarios and compliance objects by `tag-labels.mjs` labels ("ocean bunkering"), not slugs; a scenario outside the glossary is humanised by the module's rule; other entries unchanged. | `brief-candidates.test.mjs`: 2 red, 26 of 26 green. |
| register 18 (inference read inside the 300 s cached bundle) | The inference read left `fetchCrossPageForItem` (the cached item-scoped bundle) for `fetchFreshInferencesForItem`, called per request through a new optional `deps.freshInferences` in `loadDetailCore`, in the same parallel batch, laid over `crossPage.inferences` without mutating the cached object. A failed read shows no inferences. The four detail pages are unchanged (they still read `crossPage.inferences`). | `load-detail-core.test.mjs`: 3 red, 29 of 29 green (a new inference shows on the next request with the bundle served from cache; a withdrawn one leaves at once). `grade-and-inference.npmtest.mjs` source pin moved to the new single read site: red against the old `supabase-server.ts`, green now. |
| g5-search:71 (apply shares the rating step) | `apply-need-urls.mjs` registers through `rateSourceByInstitutionClass` (scripts/lib/rate-source-by-class.mjs), with the committed verdicts plus the entry's own accompanying verdict, and refuses an entry when the shared step's tier and the validated plan's tier differ. The shared step now passes `created` through so the apply counts minted versus reused. File is `scripts/turns/apply-need-urls.mjs` (the brief said scripts/sources). | `rate-source-by-class.test.mjs` and `needs-search.test.mjs`: 2 red, 46 of 46 green. |
| register 21 / p1 116 / p2 108 (guard widths) | The widths were already added by PAR-1 (PR 969): `UX_VIEWPORTS` is 375, 768, 1024, 1280. Pinned so they cannot regress: `run-rendering-guard.test.mjs` reads `ux-harness.mjs` and fails if the list loses 768 or 1024 or retypes a width (3 attacks). | green on build (the behaviour pre-exists); the three mutated copies are each caught. |
| l4d-predictions-reliability:39 (lifecycle retry) | Already built by migration 374 and the repair pass (PR 1046). Added the end-to-end pin the row asked for: fireSignpost lands fired_at and the outbox row, its lifecycle update fails, the next run's repair moves the lifecycle exactly once and stamps, a third run changes nothing. | `prediction-scoring.test.mjs`: new test green (no red: the behaviour pre-exists, this pins it). |

## Rows closed or refuted without code (evidence)

- [REFUTED] external-only:63 (rename the sentinel to "no shift grounded" verbatim): it already is (read of the constant and its test). `PLANNING_ASSUMPTION_SHIFT_ABSENCE = "no shift grounded"` at `src/lib/agent/metadata-vocab.ts:150`, asserted by `system-prompt.test.mjs:82` and `:84`. REFUTED as ruled.
- [CONFIRMED] p1-source-rating-display:115 and register 19 (read of both files, tests run green; loader reads `intelligence_item_citations`, non-primary Sources entries carry bias): built by P2 (PR 947), `readCitedSourcesForItem` in `supabase-server.ts` and `sourceEntriesOf` in `SourcesGrid.tsx`, tests `grade-and-inference.npmtest.mjs` (cited source with bias, tier null, empty list). Matched by canonical url.
- [CONFIRMED] l12 163/166, p2 109, alias1 42, sec5 105, l3 194, daudit2 176/181: closed by PR 1059 (DFIX-1 log, rows 1 to 7 of its tables); their tokens were already replaced there.

## Read and reused

- Read: CLAUDE.md, COMMON.md and batch2.md DFIX-2, ux-laws.md, design-principles.md DP-2, the source-credibility-model skill (a governed-file hook), the DFIX-1 log, each row's log line, `source-growth.ts` (registerCitedSources), `institution.ts` (`hostOf`), `scripts/lib/db.mjs` `registerSource`, `rate-source-by-class.mjs`, `schema.mjs` (needs-search rating), `item-corrections.mjs`, `suppressed-render.mjs`, `load-all.mjs`, `load-detail-core.ts`, `load-detail.ts`, `ux-harness.mjs`, `signpost-watch.ts` `fireSignpost`, `prediction-scoring.mjs` header, `CONVENTION.md` (is a family current).
- Reused, not rebuilt: `hostOf` as the canonical host; `findOrphanedFactCorrections`, `fetchAllRows` and `fetchAllByIdChunks` for the batched orphan check; `tag-labels.mjs` for the candidate line; `rateSourceByInstitutionClass` (extended by one passthrough field); `readCustomerInferences` (moved, not rewritten); the `redactDetail` per-request dep as the pattern for `freshInferences`; the existing PAR-1 viewport list; migration 374's repair path.

## Decisions

- The orphan check is chunked client reads, not a new API route: the tab already reads the same table through the platform-admin policy, the pure orphan function is shared, and a new route would add an F2-gated surface for no new capability.
- Exact host, not institution key: shared-portal paths (`SHARED_PORTAL_KEYDEPTH`) are not distinguished by the cited-source lookup; it is strictly tighter than the substring match it replaces.
- The fresh inferences overlay is duck-typed on a `crossPage` object in the core, so the four pages needed no edit.

## NOT done

- fireSignpost still makes its writes as separate requests: stamping `fired_at` and writing the outbox row in ONE transaction needs a SQL function (an RPC the signpost watcher calls), which is a migration; DFIX-2's write set has no migration. NEEDS WRITE-SET EXPANSION (one new migration `public.fire_signpost(...)`, plus the call in `signpost-watch.ts`). A step-2 failure after `fired_at` is stamped still leaves a fired signpost with no outbox row (rows l4d-predictions-reliability:39 second half and mig374-owed-schema:35). [WORK: WIRE-2]
- Not run locally per COMMON rule 9: tsc, lint, the whole suite, the fitness runner, the rendering guard (needs Playwright). Run and green: every touched test file and its neighbours (see the report). [NOT-WORK: COMMON rule 9, CI is the gate]

## UX compliance

- Corrections tab (`CorrectionsTab.tsx`, argument change only). Primary goal: see every admin correction and which ones no longer match a claim. Path: zero steps, the list loads with orphaned already computed (no per-item requests, no cap, so no "could not be checked" note except when a claims read fails). One primary action: Revoke on a row (unchanged). Async actions: the read keeps its loading, ready and error states; revoke keeps its confirmed flow and notice. Targets: no element added or resized.
- Detail pages (regulations, market, operations, research): no `.tsx` changed. The Inferences section reads `crossPage.inferences` exactly as before; only when the data is read changed (per request instead of per cache window).
- Candidate line, exact-host lookup, correction matching, apply-need-urls: no screen.
