# 2026-10-10, lane SMOKE-3 (smoke3-conditional-invariants): the Live smoke chooses its conditional-invariant items from live data, and zero candidates is a named HOLD

Defect: the Live smoke has failed on every production deployment since SMOKE-2 (PR 1015, commit 1496ed760) added content invariants, always on `content-inferences-section` at `/regulations/g14`. [CONFIRMED: `gh run list --workflow live-smoke.yml`, last pass 95711970a at 2026-10-08T13:42, first fail 1496ed760 at 13:44, every run since]

## Accomplished

1. `fsi-app/.discipline/rendering/live/live-candidates.mjs` (new): the chooser. Read-only PostgREST reads with the service key, for three classes: `inference` (customer-visible items cited by a visible inference), `record` (verified, non-archived, `item_grade = 'record'`), `bias` (verified, non-archived items whose source carries a usable bias tag). Returns `{count, visit, sample}` per class; the CLI prints the count and up to three paths per class (the diagnostic) and writes a candidate file. Without database credentials it writes an UNRESOLVED file and exits 0; with credentials a failed read exits 1 and the key is never printed.
2. `live-content.mjs`: conditional requirements carry `candidate`; new `judgeContentRun(snaps, candidates)` returns `{findings, holds}` (`checkContentRun` is kept and returns the findings). Zero candidates, or unresolved candidates, is a HOLD (one per requirement, carrying the invariant id and the count, `candidates: null` when unresolved). With candidates a detail requirement is judged only on the candidate pages the runner visited (path match ignores percent-encoding); a candidate that exists but renders no section is a FAIL once per viewport; a candidate page never checked is a FAIL.
3. `live-smoke.mjs`: `runLiveSmoke` takes `candidates`, adds the candidate detail paths to the visit plan (deduplicated against the discovered items), reports `holds`; `readCandidatesFile` reads the file the workflow wrote; the CLI prints the candidate diagnostic.
4. `live-assertions.mjs`: `formatSummary(findings, holds)` prints one `HOLD <invariant> :: ...` line per hold and the hold count on the totals line; `buildReport` records `holds`, `holdCount` and the candidate counts in the report JSON.
5. `.github/workflows/live-smoke.yml`: a step before the browser run resolves the candidates (the only step with the database secrets; the browser step carries none), the report upload also keeps the candidate file.
6. Tests: `live-candidates.test.mjs` (new, 16), `live-content.test.mjs` and `live-smoke-content.test.mjs` updated and extended.

## Read and reused

Read: root `CLAUDE.md`, COMMON, `live-content.mjs`, `live-smoke.mjs`, `live-snapshot.mjs`, `live-assertions.mjs` (reporting), the three existing live test files, `live-smoke.yml`, `emit-live-smoke-artifact.mjs`, `inference-view.mjs`, `InferenceSection.tsx`, `InferenceClaim.tsx` (the display gate), `bias-display.mjs`, `item-links.ts`, the detail loaders (`fetchIntelligenceItemUncached`, `fetchFreshInferencesForItem`, `readVerifiedItemsByIds`), `live-smoke-fixture-smoke.mjs`. Reused instead of building: `selectCurrentInferences` and `CUSTOMER_INFERENCE_METHOD_IDS` (the customer read's own pure rules), `hasBiasTags` (the chips' own test), `itemDetailHref` (the path every ledger uses; the `.mjs` imports `.ts` as `item-workspace/item-assignments.mjs` already does), `isMainModule`, the existing report, summary and artifact plumbing, the secrets already registered for `live-smoke.yml`.

## Findings

- [CONFIRMED: reading `live-smoke.mjs` plan and `collectLinksInPage`] The smoke visited at most 8 detail items (the first row of each list and the first theme-chip item of each list), the same on every run, so a conditional element was judged over a fixed handful of items whatever the corpus held.
- [CONFIRMED: `InferenceSection.tsx` and `inference-view.mjs`] The section renders only for an item cited by a current, non-superseded, `infer-from-question`, non-REFUTED, cited inference whose cited items are verified and non-archived; otherwise it renders nothing, no heading.
- [CONFIRMED: reading `live-smoke-fixture-smoke.mjs` lines 142 to 161] The rendering guard's `live-smoke-fixture` leg runs `runLiveSmoke(... contentChecks: true)` with no candidates and requires the defective fixture to fire all six content invariants; with this change a run without candidates holds the four conditional ones, so that leg needs `candidates` passed (see NOT done).

## Red then green

- Red: `live-content.test.mjs` and `live-smoke-content.test.mjs` run against the files at origin/master fail at import (`judgeContentRun` and `readCandidatesFile` are not exported). Method: the three changed sources copied to the scratchpad, `git checkout --` of them, tests run, copied back (rule 14, no stash).
- Green: `node --test fsi-app/.discipline/rendering/live/*.test.mjs` 71 pass, 0 fail, including: zero candidates is a HOLD with the count; unresolved candidates are an unresolved HOLD; ATTACK a candidate that exists but renders no Inferences section is a FAIL per viewport; the chooser judges only candidate pages; the runner visits the candidate item at both viewports.

## Production result

PRODUCTION-RESULT-PLACEHOLDER

## Decisions

- Unresolved candidates (no database credentials) hold as unresolved rather than pass or fail: a no-credential run stays diagnosable (rule 15) and the resolver step fails hard when credentials exist and a read errors, so an unreadable corpus never reads as an empty one.
- The resolver is a separate workflow step so the browser step holds no database credential.
- List-kind conditional requirements (grade chip, bias chips on rows) are gated by the same candidate count but still judged over the list pages, because a list cannot be chosen by item.

## NOT done

- `fsi-app/.discipline/rendering/smoke/live-smoke-fixture-smoke.mjs` must pass `candidates` (count 1, visit `/regulations/item-1`) to `runFixtureLeg` or its defective leg stops firing the conditional content invariants; outside this lane's write set, NEEDS WRITE-SET EXPANSION. [WORK: owed]
- `fsi-app/scripts/turns/emit-live-smoke-artifact.mjs` (and its test) reads `report.findings` and `pagesVisited` only, so the HOLD results are in the report JSON and the workflow artifact but not yet in the harness-run artifact and ledger metrics (`holds`, `hold_count`, per-invariant candidate counts); outside the write set, NEEDS WRITE-SET EXPANSION. [WORK: owed]

## Open items

- The record-grade list chip and the list-row bias chips are judged over the list pages the smoke visits, so a corpus whose record-grade items are not on a visited list page would fail the grade chip invariant; the first production run after the population hold ends shows whether that needs a list-side chooser. [WORK: owed]
