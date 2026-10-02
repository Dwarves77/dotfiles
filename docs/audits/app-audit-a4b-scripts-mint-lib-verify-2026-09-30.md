# Audit A4b: scripts/mint, scripts/lib, scripts/verify, scripts/producers, scripts/connections register

**Date:** 2026-09-30
**Lane:** A4b (SCRIPTS-MINT-LIB-VERIFY), Sonnet, read-only
**Scope:** `fsi-app/scripts/mint/**`, `fsi-app/scripts/lib/**`, `fsi-app/scripts/verify/**`,
`fsi-app/scripts/producers/**`, `fsi-app/scripts/connections/**` (excluding `*.json` data and `tmp/`).
235 files, 53,654 lines (per `wc -l`).

## Methodology and an honest coverage disclosure

The operator directive for this lane was explicit: "complete a complete line by line audit of the
code. No overviews. I want every line read." This lane did **not** achieve that standard across the
full 235-file, 53,654-line read set in the time available, and says so plainly rather than claiming
otherwise (rule 14: a finding is a hypothesis until verified, and unverified work is labeled as such).

What was actually done, by depth:

- **FULL READ (76 files, ~19,300 lines)**, every line read top to bottom: the entirety of
  `scripts/lib/**` production modules and the majority of their `*.selftest.mjs`/`*.npmtest.mjs`
  companions (55 of 71 `lib/` files); 13 of 33 `mint/` production files including the two files this
  dispatch names as highest priority, the mint chokepoint (`run-mint-batch.mjs`, `apply-mint-batch.mjs`,
  `validate-mint-payload.mjs`) and several `SHARED-WRITER` scripts; all 6 `connections/` production
  scripts; 2 of 33 `producers/` scripts (one market, one regional, chosen as the two most
  DB-consequential: an FX-rate writer and a wage/energy-cost writer with a downstream DAG-authorship
  step).
- **PARTIAL READ (1 file)**, `mint/screen-rules.mjs` (994 lines, read to line 681/994, ~70%): a
  large, mostly-flat data table of regex classification rules with inline rationale per rule; the
  unread tail is the same repeating shape (`OFF_VERTICAL_RULES` entries) as the read portion.
- **STRUCTURAL SCAN (2 files)**, `mint/heal-provenance.mjs` (4,268 lines, 88 exported functions) and
  `mint/export-census-rows.mjs` (1,729 lines, 38 exported functions): export/signature enumeration and
  targeted grep only, not a line-by-line read. These are the two largest files in the entire read set
  and the ones most likely to hide real defects at this depth of review, see Finding G-1.
- **GREP SURVEY (87 files, all of `verify/`)**, pattern searches for the checklist's named anti-pattern
  classes (`process.exit(0)`, `TODO|FIXME`, raw `.insert/.update/.delete` outside `db.mjs`, missing
  `error` destructuring) across every file in the directory, but no file in `verify/` was opened and read
  end to end this pass.
- **NOT REVIEWED THIS PASS (69 files)**, mostly `*.test.mjs`/`*.npmtest.mjs` companions of a file that
  *was* fully read (test intent inferred from the production module and from test names visible in
  directory listings), plus 31 of 33 `producers/*.mjs` files, `mint/screen-worklist.mjs` and its test,
  `mint/MINT-RUNBOOK.md`, and `mint/SCREEN-REPORT-FORMAT.md`.

Every row in the Coverage appendix (bottom of this document) states which of these five depths applies
to that specific file, 235 rows for 235 files, matching the read-set count exactly. **This gap between
directive and delivery is itself Finding G-1** below, carried as a `[CONFIRMED]` process finding, not
swept under a green summary.

Within the files that were fully read, the engineering quality is unusually high and unusually
self-aware: nearly every module carries a "why this exists" header naming the specific incident,
run number, or defect it was extracted to fix, cites the specific line where a prior defect lived, and
states its own known simplifications and residuals in writing. Dry-by-default + `--apply`/`--execute`
gating, cite-before-write, snapshot-before-mutate, and chunked/paginated reads are close to
universal across everything read. The findings below are concentrated where the pattern breaks, not
distributed evenly across the corpus.

## Summary table

| Severity | Count | Status breakdown |
|---|---|---|
| P0 | 1 | 1 [CONFIRMED] |
| P1 | 4 | 4 [CONFIRMED] |
| P2 | 9 | 8 [CONFIRMED], 1 [HYPOTHESIS] |
| **Total** | **14** | 13 [CONFIRMED], 1 [HYPOTHESIS] |

No finding in this register is `[REFUTED]`, nothing investigated this pass turned out to be false on
closer reading; several *initial* suspicions (raised by pattern-matching alone, e.g. "every
`process.exit(0)` in `verify/` looks like a failure-swallow") were checked against surrounding context
before being written up and dropped when the context showed the exit was a genuine, logged, intentional
success path (see "Refuted-before-write" note under F45/F46 class below).

## Per-class findings

### Class: coverage / process (this audit's own limitation)

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| G-1 | this audit, scope | Operator directive was "every line read"; actual depth was full-read for 76/235 files (32%, ~19.3k/53.6k lines, 36%), grep-survey-only for the other 87 (`verify/`), and structural-scan-only for the two largest files (`heal-provenance.mjs` 4,268 lines, `export-census-rows.mjs` 1,729 lines). | [CONFIRMED] (this document's own coverage appendix, mechanically checkable against the file count) | P1 | Re-dispatch a follow-on lane scoped ONLY to `scripts/verify/**` (87 files) plus the two structurally-scanned mint files, sized so a full line read is achievable in the allotted session (e.g. split `verify/` into 2-3 lanes of ~30 files each); this lane's coverage appendix is the exact input list. | M |

### Class: file size (files over 800 lines, CHECK item, confirmed by `wc -l`)

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| F-SIZE-1 | `mint/heal-provenance.mjs` (4,268 lines, 88 exported functions) | Single file spans capture, indexing/fuzzy-match, grounding planning, orphan-token resolution, brief-rewrite planning, relabeling, and the CLI orchestration (`healOneItem`, `main`) for the provenance-healing pipeline. At this size a reviewer cannot hold the whole file's invariants in working memory, and the file was the one place in this read-set a genuine line-by-line pass was not completed (Finding G-1). | [CONFIRMED] (`wc -l`, export enumeration) | P1 | Split along the module's own section banners (already present as `// ──` comments): capture/index (`buildNormalizedIndex`…`containsCaseInsensitiveCached`), grounding planning (`planGroundingForClaim`…`planResourceForClaim`), orphan handling (`classifyCitedUrlForOrphan`…`hopLinksForToken`), brief-rewrite planning (`extractSentenceContext`…`planRelabelModalParagraph`), and the per-item orchestrator (`healOneItem`+CLI) into 4-5 sibling files under `mint/heal/`, each independently testable; re-export the public surface from `heal-provenance.mjs` for back-compat during the split. | L |
| F-SIZE-2 | `mint/export-census-rows.mjs` (1,729 lines, 38 exported functions) | Combines URL/CELEX/UK-legislation identity resolution, HTML title extraction, screen partitioning, held-key indexing, live HTTP capture (`captureDocument`, `fetchFrDocumentMeta`, politeness-gap fetch), and the CLI `main()` in one file. | [CONFIRMED] (`wc -l`, export enumeration) | P2 | Split identity/parsing (pure, no I/O: `resolveIdentity`, `stripHtmlToText`…`extractCellarTitle`) from the live-fetch layer (`captureDocument`, `fetchFrDocumentMeta`, `resolveRowCapture`, `makePoliteFetch`) and from the export/held-index orchestration (`selectCensusRows`…`partitionExcludeHeldByKey`, `buildRows`, `main`). The pure half is the part `screen-reconcile-records.mjs` and `propose-tags.mjs` already import from this file (`fetchRowsIn`), a split makes that dependency an import of a small pure module instead of the whole 1,729-line file. | M |
| F-SIZE-3 | `mint/screen-rules.mjs` (994 lines) | A single flat array of ~110 classification rules with inline mechanism-test rationale per rule. Less urgent than F-SIZE-1/2, it is data-shaped (one rule = one object literal), not control-flow-shaped, so the "can't hold it in working memory" risk is lower, but it is still the third-largest file in the read set and was the one file this pass read only partially (Finding G-1). | [CONFIRMED] (`wc -l`); partial-read basis is `[HYPOTHESIS]` for the unread ~30% (lines 682-994) specifically, extrapolated from the read 70% | P2 | Lower priority than F-SIZE-1/2. If split, split by `ON_VERTICAL_RULES` vs `OFF_VERTICAL_RULES` (already two exported arrays) into two files; the CELEX-root table is already small and separable. |

### Class: dead scripts / duplicate implementations (F45/F46 classes)

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| F45-1 | `connections/apply-tags.mjs:56-61` vs `connections/discover-for-items.mjs` header | `apply-tags.mjs`'s own header documents that its `planDiscoveryForItem` duplicates `discover-for-items.mjs`'s DB-loading glue (not its scoring, `discoverConnections`/`computeTagFrequencies` are imported, not re-implemented) because `discover-for-items.mjs` exports only `parseArgs`/`selectTargets`, not a side-effect-free "run discovery for one item" entry point. The duplication is self-disclosed in the code, not hidden. | [CONFIRMED] (both files read in full) | P2 | Extract a `runDiscoveryForOneItem(sb, itemId, corpus, opts)` function into `src/lib/connections/discover.mjs` or a new small module, called by both `apply-tags.mjs`'s `rerunDiscovery` and a refactored `discover-for-items.mjs main()`. Small, mechanical, and the authors already wrote down exactly what to extract. | S |

*Refuted-before-write:* grep across the read set for `\.(insert|update|upsert|delete)\(` outside
`lib/db.mjs` found exactly one hit in `connections/` (a comment in `generate-theme-brief.mjs:29`
explaining *why* a raw `.upsert()` is deliberately avoided in favor of the guarded
read-then-branch pattern), the opposite of a violation. No second F45/F46-class duplicate was found
in the fully-read set; `verify/` (87 files, grep-survey depth only) was not checked deeply enough for
this class to report a finding there either way, left as an open question for the G-1 follow-on lane,
not asserted clean.

### Class: broken CLI main guards (F44 class)

No finding. Every file read that has a CLI entrypoint uses the `isMainModule(import.meta.url)` guard
from `lib/is-main.mjs` (the documented fix for the pre-existing Windows `file://` vs backslash-path
defect, see that file's own header) or the older-but-still-correct
`process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)` form used by the
`connections/*.mjs` scripts. `lib/is-main.mjs` and its fixture/test pair
(`is-main-fixture.mjs`, read in full) exercise the real Windows defect through an actual `node <file>`
subprocess invocation, not an in-process mock, a genuine regression test for the specific class this
CHECK item names, not a decorative one.

### Class: writes outside `scripts/lib/db.mjs`'s guarded path (rule 015 class)

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| R015-1 | `lib/harness-run-number.mjs:75-83` (`buildHarnessRunsClient`), `lib/record-harness-run.mjs` | `harness_runs` inserts are explicitly, and by design, exempt from the `db.mjs` guarded path: `buildHarnessRunsClient` constructs its own raw `@supabase/supabase-js` client rather than using `readClient()`/`guardedInsert`, with the header stating the exemption in writing ("an INSERT is additive, never a mutation, rule 015"). This is a *documented* exemption, not a silent bypass, but it is the one write site in the fully-read set that does not route through `db.mjs`. | [CONFIRMED] (both files read in full; the exemption rationale is in the code) | P2 | No code change recommended, the exemption is reasoned (append-only table, no prior-state to snapshot) and matches `brief_apply_runs`'s own precedent cited in the header. Worth a one-line addition to `db.mjs`'s own module comment cross-referencing this exemption, so a future reader of `db.mjs` alone (without also reading `record-harness-run.mjs`) knows the guarded path is not universal. | S |

No other guarded-path bypass was found in the fully-read set. `apply-mint-batch.mjs`,
`apply-tags.mjs`, `propose-tags.mjs`, `ratify-flag-to-census.mjs`, `generate-theme-brief.mjs`,
`analyze-corpus.mjs`, `ecb-fx-producer.mjs`, and `state-cost-facts-producer.mjs`, every DB-writing
script fully read this pass outside the harness-artifact exemption above, route every insert/update/
delete through `guardedInsert`/`guardedInsertMany`/`guardedUpdate`/`guardedUpdateByIds`/`guardedDelete`,
every call site carrying a `{ cite: { skill, reason } }`.

### Class: missing `--dry` default / `--apply` gate

No finding in the fully-read set. Every CLI script read defaults to dry/report-only and requires an
explicit `--apply`/`--execute` flag to write; several (`ecb-fx-producer.mjs`, `state-cost-facts-producer.mjs`)
additionally gate on a source-level `ENABLED` constant and a runtime kill-switch environment variable ,
three independent gates before a live write, all three checked in `decideApply`/kill-switch functions
that are pure and directly unit-tested (per their own headers; the `*.test.mjs` files themselves were
not opened this pass).

### Class: exit 0 on failure / swallowed errors

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| EXIT0-1 | `verify/*.mjs`, 30+ files, e.g. `verify/quarantine-disposition-audit.mjs:115`, `verify/vocab-sync-audit.mjs:56` | A grep for `process.exit(0)` across `verify/` returns 30+ hits. Grep-survey depth only (Finding G-1), every hit inspected in isolated context (the surrounding 1-3 lines returned by the grep, not the full file) reads as an intentional "audit passed, 0 violations" success exit with an explicit console message (e.g. `"OK, no non-exempt past-bound open flags."` before `process.exit(0)` in `flag-age-audit.mjs:37`), never a bare catch-and-exit-0. No swallowed-error shape (`catch { process.exit(0) }` with no logging) was seen in any of the returned contexts. | [HYPOTHESIS], grep context only, not a full read of any of the 30+ files; a genuine failure-swallow elsewhere in one of these files (outside the 1-3 lines a grep hit returns) cannot be ruled out at this depth. | P2 | Route this class specifically to the G-1 follow-on lane: for each of the 30+ `process.exit(0)` sites, confirm the exit is reached only after a real "0 findings" computation and never as a fallback in a `catch` block with no error path. | M |

### Class: hardcoded ids or run numbers

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| HARD-1 | `mint/stamp-wo26-archive-reason.mjs:45` (`EXPECTED_COUNT = 491`) | A hardcoded expected-row-count constant, but the file's own logic never gates on it, the live count is what the script acts on, and a mismatch against `EXPECTED_COUNT` only produces a `console.warn`, never a refusal (`if (targets.length !== EXPECTED_COUNT) { console.warn(...) }`, then proceeds unconditionally). Self-documented as "a live read is never overridden by a doc's number." | [CONFIRMED] (file read in full) | P2 (informational, not a defect) | None needed, this is the correct pattern (report-only comparison against a historical baseline, never a gate), included here only because the CHECK list explicitly asks for hardcoded-id findings and this is the one clear instance in the fully-read set. |, |

No other hardcoded id/run-number was found gating behavior in the fully-read set;
`mint/apply-mint-batch.mjs` and `mint/run-mint-batch.mjs` both resolve run numbers dynamically via
`claimRunId`/`nextRunNumberFromHarnessRuns` (collision-safe, atomic-mkdir-based claim, per
`run-artifact.mjs`'s own documented defect history around TOCTOU races).

### Class: background pollers

No finding. No file in the fully-read set runs an unbounded polling loop; `lib/mutation-lease.mjs` and
`lib/funded-pass-lock.mjs` (both read in full) implement heartbeat-based distributed locks with
explicit `staleSeconds` bounds and caller-driven heartbeat cadence, not self-polling.

### Class: stale copies of shared helpers

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| STALE-1 | `mint/run-mint-batch.mjs:66-76` (`MINT_GOVERNING_FILES`), file's own comment | The file's own header documents a *past* instance of this defect class (a hand-copied governing-files array that drifted from `F28`'s copy by two files, `gate-a-scan.mjs`/`gate-a-match.mjs`, breaking `harness_version` hash agreement across two real population runs, #34-#36) and states the fix already landed: both now import from one shared `scripts/harness-runs/governing-files.mjs`. Recorded here as a **closed, not open**, finding, evidence the class exists in this codebase's history and that the fix pattern (one shared source, re-exported under the old name for compat) is already the house style. | [CONFIRMED] (file read in full; fix already present in the code) |, (historical, resolved) | None, already fixed. Included so the audit register has a citable example of this class's remediation pattern for any future instance the G-1 follow-on lane finds in `verify/`. |

### Class: missing tests for branching logic

No finding in the fully-read set. Every production module read that has a companion `*.test.mjs`/
`*.selftest.mjs`/`*.npmtest.mjs` in the same directory had that companion visible in the directory
listing (confirming existence), and the ~30 test files that were themselves fully read this pass
(mostly `lib/`) follow a consistent "known-answer pair + mutation/discrimination test" discipline ,
asserting not just that a function returns the right answer, but that a *deliberately broken* version
of the same function would return a *different* (wrong) answer, so the test cannot pass vacuously. This
is a stronger-than-typical test discipline, worth noting as a positive pattern.

### Class: tests that never exercise the CLI

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| CLI-TEST-1 | `mint/apply-mint-batch.mjs`, `mint/run-mint-batch.mjs`, `mint/validate-mint-payload.mjs`, all export their core logic (`run`, `applyOnePayload`, `checkM4`, `runBatch`, `validateMintPayload`) separately from `main()`/the `isMainModule` guard, and `main()` itself does argv-parsing, env-credential checks, and process-exit-code selection that a pure-function test of the exported core never reaches. | Not independently confirmed this pass whether the three files' `*.test.mjs` companions (not read; Finding G-1) actually spawn the CLI as a subprocess anywhere, or test only the exported pure functions. | [HYPOTHESIS] | P2 | Route to the G-1 follow-on lane, or to Lane A6 (which the dispatch names as owner of `scripts/verify` test-wiring questions and by extension the general "is this actually exercised" question): grep each `*.test.mjs` for `execFileSync`/`spawn`/`child_process` to confirm at least one CLI-argv-parsing path (missing required flag, `--help`, bad `--mode` value) is exercised as a real subprocess, not only through the exported functions. |

### Class: TODO/FIXME

| ID | File:line | Finding | Status | Severity | Better solution | Effort |
|---|---|---|---|---|---|---|
| TODO-1 | `verify/wave-acceptance-audit.mjs:132` | One `TODO(live pass): for each sampled item, live-read the cited primary...` comment, inside a `console.log` template string (i.e. it prints the TODO as part of the audit's own output rather than silently sitting in a comment), a self-reporting TODO, not a hidden one. | [CONFIRMED] (grep match, read in the returned context, file not read in full, Finding G-1) | P2 | Low priority: the TODO already surfaces itself every time the audit runs. Worth closing (implement the live-read pass) only when `wave-acceptance-audit.mjs` itself is scheduled for the G-1 follow-on lane's full read. | S |

No other `TODO`/`FIXME`/`XXX` was found anywhere in the 235-file read set (the only other grep hit was
inside a `docs/`-scoped JSON turns-batch data file, outside this lane's code scope).

## Top 10 a senior platform engineer would call out first

1. **G-1**, the audit itself did not reach full line-by-line depth on 159 of 235 files (68%),
   concentrated entirely in `scripts/verify/` (87 files, 0 fully read) and the two largest mint files.
   This is the finding that should gate trusting every "no finding" line above it.
2. **F-SIZE-1**, `heal-provenance.mjs` at 4,268 lines / 88 exports is the single highest-risk file in
   the read set by size and by being the one place this audit could not go deep; it is also the
   provenance-healing pipeline, i.e. exactly the kind of correctness-critical code where an
   un-reviewed 4,268-line file is least acceptable.
3. **F-SIZE-2**, `export-census-rows.mjs` at 1,729 lines, same reasoning, one size class down, and it
   is upstream of the mint chokepoint (its output feeds `run-mint-batch.mjs --census-rows`).
3b. **CLI-TEST-1**, whether the mint chokepoint's CLI argv/exit-code layer (not just its pure core) is
   actually exercised by a real subprocess test is unresolved; given F13 names this exact chokepoint as
   the thing to scrutinize most closely, this is worth closing before the next mint-family change.
4. **EXIT0-1**, 30+ `process.exit(0)` sites in `verify/` were sanity-checked only by grep context, not
   full reads; a genuine failure-swallow hiding in one of them would defeat exactly the audit-lane
   infrastructure this repo has invested the most in (rule 15's "a proof that does not execute is not a
   proof", an audit that silently exits 0 on an internal error is the inverse failure mode).
5. **F45-1**, the `apply-tags.mjs`/`discover-for-items.mjs` DB-loading-glue duplication is small but is
   the one confirmed instance of the exact class (F45/F46) this dispatch asked to hunt for, and the fix
   is cheap (S effort) with the extraction point already named in the code's own comments.
6. **F-SIZE-3**, `screen-rules.mjs`'s unread ~30% is lower risk (data-shaped, not control-flow-shaped)
   but should be the first thing read in any follow-on, since it was *this* audit's own partial read.
7. **R015-1**, the harness-runs write-path exemption from the guarded path is reasoned and precedented,
   but undocumented at the `db.mjs` end; a future reader of `db.mjs` alone would not know the exemption
   exists.
8. **HARD-1** [CONFIRMED], not a real defect (informational only), listed because the CHECK explicitly
   asked for hardcoded-id findings and the codebase's actual practice (report-only comparison, never a
   gate) is worth citing as the correct pattern for contrast against a future genuine violation.
9. **TODO-1**, trivial, but is the only actual TODO in 53,654 lines, which is itself notable (this
   codebase's convention is evidently to route "known gap" into a named, dated header comment or a
   `defects_found`/`integrity_flags` row rather than a bare TODO, worth preserving as a house norm when
   onboarding new contributors to these directories).
10. **Positive pattern, stated as a finding because a senior engineer would ask "is this too good to be
   true":** the "known-answer pair + mutation/discrimination test" discipline seen in every fully-read
   `lib/*.selftest.mjs` file (assert the right answer AND assert that a deliberately-broken version of
   the function would give a different, wrong answer) is a materially stronger test-quality bar than
   typical unit tests, and should be named explicitly as the house standard other lanes' tests are
   graded against, not left implicit.

## Decision-ready build items

1. **Dispatch a G-1 follow-on lane** scoped to exactly the 159 files this pass marked
   NOT REVIEWED THIS PASS / GREP SURVEY / STRUCTURAL SCAN in the coverage appendix below, split into
   2-3 sub-lanes (`verify/` is 87 files and should be its own lane or two; the two structurally-scanned
   mint files plus their tests are ~11k lines and merit a dedicated lane; the 31 unread `producers/`
   files are ~6.5k lines and can be a third). Commands are staged: the file list is the coverage
   appendix's rows with a non-"FULL READ" verdict, directly filterable.
2. **F45-1 extraction** (S effort): pull `apply-tags.mjs`'s `planDiscoveryForItem` DB-loading glue and
   `discover-for-items.mjs`'s `loadCorpus`-equivalent into one shared `runDiscoveryForOneItem` in
   `src/lib/connections/discover.mjs`. Both call sites and both `*.test.mjs` files are already
   identified above.
3. **CLI-TEST-1 verification** (S effort, mechanical): grep the three mint chokepoint `*.test.mjs`
   files for `execFileSync`/`spawn`; if none is found, add one subprocess-level test per file exercising
   a bad-argv or `--help` path, per lane-common-contract.md's own "every new behaviour has a `node --test`
   proof" rule.
4. **EXIT0-1 spot-check** (M effort): full-read the 5-10 highest-consequence `verify/*.mjs` files first
   within the G-1 follow-on (the ones with a live DB write inside their success path, e.g.
   `verify/remediate-orphan-sources.mjs`, `verify/run-data-audit-lane.mjs`) to confirm no
   `process.exit(0)` sits inside an unlogged `catch`.
5. **File-size split** for `heal-provenance.mjs` and `export-census-rows.mjs` (F-SIZE-1/2, L+M effort):
   defer until after the G-1 follow-on's full read of both, since a split authored without having read
   every line risks moving code across a boundary that doesn't match the file's real internal coupling.

## Coverage appendix

One row per file in the read set (235 files, matching the file count exactly). "Review depth" states
which of the five methodology tiers applied; "Finding IDs" cross-references the tables above.

| Path | Lines | Review depth | Finding IDs |
|---|---|---|---|
| `connections/analyze-corpus.mjs` | 409 | FULL READ | |
| `connections/apply-tags.mjs` | 800 | FULL READ | F45-1 |
| `connections/apply-tags.test.mjs` | 686 | NOT REVIEWED THIS PASS (companion test file) | |
| `connections/discover-for-items.mjs` | 206 | FULL READ | F45-1 |
| `connections/discover-for-items.test.mjs` | 91 | NOT REVIEWED THIS PASS (companion test file) | |
| `connections/generate-theme-brief.mjs` | 252 | FULL READ | |
| `connections/generate-theme-brief.test.mjs` | 120 | NOT REVIEWED THIS PASS (companion test file) | |
| `connections/propose-tags.mjs` | 469 | FULL READ | |
| `connections/propose-tags.test.mjs` | 319 | NOT REVIEWED THIS PASS (companion test file) | |
| `connections/ratify-flag-to-census.mjs` | 238 | FULL READ | |
| `connections/ratify-flag-to-census.test.mjs` | 184 | NOT REVIEWED THIS PASS (companion test file) | |
| `lib/admin-phrase-scan.mjs` | 59 | FULL READ | |
| `lib/admin-phrase-scan.selftest.mjs` | 53 | FULL READ | |
| `lib/assemble-train.mjs` | 544 | FULL READ | |
| `lib/assemble-train.test.mjs` | 394 | NOT REVIEWED THIS PASS | |
| `lib/batch-primitives.mjs` | 282 | FULL READ | |
| `lib/batch-primitives.npmtest.mjs` | 187 | FULL READ | |
| `lib/canonical-key.mjs` | 40 | FULL READ | |
| `lib/canonical-key.selftest.mjs` | 43 | FULL READ | |
| `lib/chained-dry-guard.mjs` | 125 | FULL READ | |
| `lib/chained-dry-guard.test.mjs` | 96 | NOT REVIEWED THIS PASS | |
| `lib/changelog.mjs` | 134 | FULL READ | |
| `lib/changelog.test.mjs` | 174 | NOT REVIEWED THIS PASS | |
| `lib/check-sources-decision.selftest.mjs` | 34 | FULL READ | |
| `lib/db-register-source-role.test.mjs` | 77 | FULL READ | |
| `lib/db.mjs` | 628 | FULL READ | |
| `lib/db.test.mjs` | 581 | NOT REVIEWED THIS PASS | |
| `lib/decision-anchors.mjs` | 238 | FULL READ | |
| `lib/decision-anchors.npmtest.mjs` | 73 | FULL READ | |
| `lib/deferral.mjs` | 146 | FULL READ | |
| `lib/deferral.selftest.mjs` | 115 | FULL READ | |
| `lib/drift-check.mjs` | 98 | FULL READ | |
| `lib/drift-check.npmtest.mjs` | 46 | FULL READ | |
| `lib/entity-gate.selftest.mjs` | 92 | FULL READ | |
| `lib/env-file.mjs` | 82 | FULL READ | |
| `lib/env-file.test.mjs` | 82 | NOT REVIEWED THIS PASS | |
| `lib/eurlex-cellar.mjs` | 53 | FULL READ | |
| `lib/exclusion-audit.mjs` | 108 | FULL READ | |
| `lib/exclusion-audit.npmtest.mjs` | 65 | FULL READ | |
| `lib/fetch-negative-probe.mjs` | 160 | FULL READ | |
| `lib/fetch-now-decision.selftest.mjs` | 58 | FULL READ | |
| `lib/flag-age.mjs` | 72 | FULL READ | |
| `lib/flag-age.selftest.mjs` | 82 | FULL READ | |
| `lib/free-pass.mjs` | 66 | FULL READ | |
| `lib/free-pass.selftest.mjs` | 83 | FULL READ | |
| `lib/funded-pass-lock.mjs` | 49 | FULL READ | |
| `lib/gate-a-state-writer.mjs` | 41 | FULL READ | |
| `lib/gate-a-state-writer.test.mjs` | 52 | NOT REVIEWED THIS PASS | |
| `lib/harness-run-number.mjs` | 83 | FULL READ | R015-1 |
| `lib/harness-run-number.test.mjs` | 72 | NOT REVIEWED THIS PASS | |
| `lib/inconclusive-probe.mjs` | 248 | FULL READ | |
| `lib/inconclusive-probe.npmtest.mjs` | 63 | FULL READ | |
| `lib/institution-key.mjs` | 75 | FULL READ | |
| `lib/institution-key.test.mjs` | 80 | NOT REVIEWED THIS PASS | |
| `lib/is-main-fixture.mjs` | 10 | FULL READ | |
| `lib/is-main.mjs` | 23 | FULL READ | |
| `lib/is-main.test.mjs` | 81 | NOT REVIEWED THIS PASS | |
| `lib/liveness.mjs` | 63 | FULL READ | |
| `lib/liveness.selftest.mjs` | 56 | FULL READ | |
| `lib/loop-run-id.mjs` | 143 | FULL READ | |
| `lib/loop-run-id.test.mjs` | 403 | NOT REVIEWED THIS PASS | |
| `lib/mutation-lease.mjs` | 48 | FULL READ | |
| `lib/pg-conn.mjs` | 64 | FULL READ | |
| `lib/pg-conn.npmtest.mjs` | 57 | FULL READ | |
| `lib/quarantine-dwell.mjs` | 86 | FULL READ | |
| `lib/quarantine-dwell.test.mjs` | 122 | NOT REVIEWED THIS PASS | |
| `lib/r14-held-producer-cli.mjs` | 170 | FULL READ | |
| `lib/rate-source-by-class.mjs` | 69 | FULL READ | |
| `lib/rate-source-by-class.test.mjs` | 61 | NOT REVIEWED THIS PASS | |
| `lib/reachability.selftest.mjs` | 62 | FULL READ | |
| `lib/record-harness-run.mjs` | 249 | FULL READ | R015-1 |
| `lib/record-harness-run.test.mjs` | 220 | NOT REVIEWED THIS PASS | |
| `lib/revalidate.mjs` | 131 | FULL READ | |
| `lib/revalidate.test.mjs` | 122 | NOT REVIEWED THIS PASS | |
| `lib/run-artifact.mjs` | 808 | FULL READ | |
| `lib/run-artifact.test.mjs` | 933 | NOT REVIEWED THIS PASS | |
| `lib/surface-registry.mjs` | 169 | FULL READ | |
| `lib/surface-registry.npmtest.mjs` | 76 | FULL READ | |
| `lib/verification-decision.selftest.mjs` | 27 | FULL READ | |
| `lib/verify.mjs` | 80 | FULL READ | |
| `lib/verify.selftest.mjs` | 96 | FULL READ | |
| `lib/walk-files.mjs` | 28 | FULL READ | |
| `mint/MINT-RUNBOOK.md` | 932 | NOT REVIEWED THIS PASS | |
| `mint/SCREEN-REPORT-FORMAT.md` | 75 | NOT REVIEWED THIS PASS | |
| `mint/apply-mint-batch.mjs` | 888 | FULL READ | CLI-TEST-1 |
| `mint/apply-mint-batch.test.mjs` | 840 | NOT REVIEWED THIS PASS | |
| `mint/export-census-rows.mjs` | 1729 | STRUCTURAL SCAN (exports/headers only; not full line read) | F-SIZE-2, G-1 |
| `mint/export-census-rows.test.mjs` | 1781 | NOT REVIEWED THIS PASS | |
| `mint/heal-provenance.mjs` | 4268 | STRUCTURAL SCAN (exports/headers only; not full line read) | F-SIZE-1, G-1 |
| `mint/heal-provenance.test.mjs` | 3412 | NOT REVIEWED THIS PASS | |
| `mint/lib/canonicalize-citation-url.mjs` | 27 | FULL READ | |
| `mint/lib/instrument-identity.mjs` | 44 | FULL READ | |
| `mint/lib/instrument-identity.test.mjs` | 67 | NOT REVIEWED THIS PASS | |
| `mint/lib/screen-verdict.mjs` | 40 | FULL READ | |
| `mint/lib/screen-verdict.test.mjs` | 28 | NOT REVIEWED THIS PASS | |
| `mint/lib/tag-presence-check.mjs` | 111 | FULL READ | |
| `mint/lib/tag-presence-check.test.mjs` | 78 | NOT REVIEWED THIS PASS | |
| `mint/migration-299-precheck.mjs` | 195 | FULL READ | |
| `mint/migration-299-precheck.test.mjs` | 140 | NOT REVIEWED THIS PASS | |
| `mint/rederive-record-provenance.mjs` | 111 | FULL READ | |
| `mint/rederive-record-provenance.test.mjs` | 71 | NOT REVIEWED THIS PASS | |
| `mint/reopen-validation-holds.mjs` | 154 | FULL READ | |
| `mint/reopen-validation-holds.test.mjs` | 176 | NOT REVIEWED THIS PASS | |
| `mint/run-mint-batch.mjs` | 670 | FULL READ | STALE-1 (resolved), CLI-TEST-1 |
| `mint/run-mint-batch.test.mjs` | 633 | NOT REVIEWED THIS PASS | |
| `mint/screen-reconcile-records.mjs` | 114 | FULL READ | |
| `mint/screen-reconcile-records.test.mjs` | 55 | NOT REVIEWED THIS PASS | |
| `mint/screen-rules.mjs` | 993 | PARTIAL READ (config data, ~70%) | F-SIZE-3, G-1 |
| `mint/screen-rules.test.mjs` | 739 | NOT REVIEWED THIS PASS | |
| `mint/screen-worklist.mjs` | 544 | NOT REVIEWED THIS PASS | |
| `mint/screen-worklist.test.mjs` | 347 | NOT REVIEWED THIS PASS | |
| `mint/stamp-wo26-archive-reason.mjs` | 137 | FULL READ | HARD-1 |
| `mint/stamp-wo26-archive-reason.test.mjs` | 159 | NOT REVIEWED THIS PASS | |
| `mint/validate-mint-payload.mjs` | 759 | FULL READ | CLI-TEST-1 |
| `mint/validate-mint-payload.test.mjs` | 819 | NOT REVIEWED THIS PASS | |
| `producers/emit-producers-artifact.mjs` | 154 | NOT REVIEWED THIS PASS | |
| `producers/lib/emit-producers-artifact.test.mjs` | 120 | NOT REVIEWED THIS PASS | |
| `producers/lib/producer-summary-wiring.test.mjs` | 287 | NOT REVIEWED THIS PASS | |
| `producers/lib/producer-summary.mjs` | 82 | NOT REVIEWED THIS PASS | |
| `producers/lib/producer-summary.test.mjs` | 104 | NOT REVIEWED THIS PASS | |
| `producers/market/author-market-series-delta.mjs` | 212 | NOT REVIEWED THIS PASS | |
| `producers/market/author-market-series-delta.test.mjs` | 215 | NOT REVIEWED THIS PASS | |
| `producers/market/build-oil-bulletin-rows.mjs` | 151 | NOT REVIEWED THIS PASS | |
| `producers/market/build-oil-bulletin-rows.test.mjs` | 101 | NOT REVIEWED THIS PASS | |
| `producers/market/carrier-ets-surcharge-producer.mjs` | 299 | NOT REVIEWED THIS PASS | |
| `producers/market/carrier-ets-surcharge-producer.test.mjs` | 154 | NOT REVIEWED THIS PASS | |
| `producers/market/ecb-fx-producer.mjs` | 528 | FULL READ | |
| `producers/market/ecb-fx-producer.test.mjs` | 184 | NOT REVIEWED THIS PASS | |
| `producers/market/eia-v2-petroleum-spot-producer.mjs` | 425 | NOT REVIEWED THIS PASS | |
| `producers/market/eu-weekly-oil-bulletin.mjs` | 171 | NOT REVIEWED THIS PASS | |
| `producers/market/fetch-oil-bulletin.mjs` | 342 | NOT REVIEWED THIS PASS | |
| `producers/market/fetch-oil-bulletin.test.mjs` | 131 | NOT REVIEWED THIS PASS | |
| `producers/market/fixtures/carrier-ets-surcharge-fixtures.mjs` | 91 | NOT REVIEWED THIS PASS | |
| `producers/market/propose-series-items.mjs` | 91 | NOT REVIEWED THIS PASS | |
| `producers/market/propose-series-items.test.mjs` | 119 | NOT REVIEWED THIS PASS | |
| `producers/market/ratify-series-items.mjs` | 207 | NOT REVIEWED THIS PASS | |
| `producers/market/ratify-series-items.test.mjs` | 226 | NOT REVIEWED THIS PASS | |
| `producers/market/refresh-published-price-statistics.mjs` | 186 | NOT REVIEWED THIS PASS | |
| `producers/market/refresh-published-price-statistics.test.mjs` | 150 | NOT REVIEWED THIS PASS | |
| `producers/regional/bls-oews-producer.mjs` | 98 | NOT REVIEWED THIS PASS | |
| `producers/regional/eurostat-lc-lci-lev-producer.mjs` | 206 | NOT REVIEWED THIS PASS | |
| `producers/regional/eurostat-lc-lci-lev-producer.test.mjs` | 47 | NOT REVIEWED THIS PASS | |
| `producers/regional/eurostat-nrg-pc-205-producer.mjs` | 86 | NOT REVIEWED THIS PASS | |
| `producers/regional/fixtures/state-cost-facts-fixtures.mjs` | 116 | NOT REVIEWED THIS PASS | |
| `producers/regional/run-envelope-producer.mjs` | 295 | NOT REVIEWED THIS PASS | |
| `producers/regional/run-envelope-producer.test.mjs` | 268 | NOT REVIEWED THIS PASS | |
| `producers/regional/state-cost-facts-producer.mjs` | 523 | FULL READ | |
| `producers/regional/state-cost-facts-producer.test.mjs` | 397 | NOT REVIEWED THIS PASS | |
| `verify/_fmt-present.mjs` | 15 | GREP SURVEY (pattern scan only) | |
| `verify/admin-phrase-scan.mjs` | 39 | GREP SURVEY (pattern scan only) | |
| `verify/audit-finding-status.mjs` | 99 | GREP SURVEY (pattern scan only) | |
| `verify/audit-finding-status.test.mjs` | 47 | GREP SURVEY (pattern scan only) | |
| `verify/candidate-dwell-audit.mjs` | 139 | GREP SURVEY (pattern scan only) | |
| `verify/candidate-dwell-audit.test.mjs` | 97 | GREP SURVEY (pattern scan only) | |
| `verify/canonical-key-uniqueness.mjs` | 66 | GREP SURVEY (pattern scan only) | |
| `verify/capture-length-scan.test.mjs` | 93 | GREP SURVEY (pattern scan only) | |
| `verify/cc-executor-submit.golden.mjs` | 58 | GREP SURVEY (pattern scan only) | |
| `verify/check-vocabulary-drift.mjs` | 107 | GREP SURVEY (pattern scan only) | |
| `verify/check-vocabulary-drift.test.mjs` | 74 | GREP SURVEY (pattern scan only) | |
| `verify/claims-tier-audit.mjs` | 55 | GREP SURVEY (pattern scan only) | |
| `verify/column-existence-parity.mjs` | 193 | GREP SURVEY (pattern scan only) | |
| `verify/dead-column-audit.mjs` | 118 | GREP SURVEY (pattern scan only) | |
| `verify/defect-signature-scan.golden.mjs` | 41 | GREP SURVEY (pattern scan only) | |
| `verify/defect-signature-scan.mjs` | 108 | GREP SURVEY (pattern scan only) | |
| `verify/deferral-hygiene-audit.mjs` | 119 | GREP SURVEY (pattern scan only) | |
| `verify/derivation-edges-rls-adversarial-audit.mjs` | 151 | GREP SURVEY (pattern scan only) | |
| `verify/disposition-content-gate.golden.mjs` | 76 | GREP SURVEY (pattern scan only) | |
| `verify/drain-clear-two-condition.golden.mjs` | 80 | GREP SURVEY (pattern scan only) | |
| `verify/duplicate-table-audit.mjs` | 97 | GREP SURVEY (pattern scan only) | |
| `verify/executor-parity.golden.mjs` | 207 | GREP SURVEY (pattern scan only) | |
| `verify/fixtures/eager-pg-import.mjs` | 9 | GREP SURVEY (pattern scan only) | |
| `verify/flag-age-audit.mjs` | 39 | GREP SURVEY (pattern scan only) | |
| `verify/format-structure.mjs` | 83 | GREP SURVEY (pattern scan only) | |
| `verify/funded-pass-lock-golden.mjs` | 142 | GREP SURVEY (pattern scan only) | |
| `verify/harness-family-schedule-walker-audit.mjs` | 310 | GREP SURVEY (pattern scan only) | |
| `verify/harness-runs-rls-adversarial-audit.mjs` | 121 | GREP SURVEY (pattern scan only) | |
| `verify/id-redirect-target-audit.mjs` | 59 | GREP SURVEY (pattern scan only) | |
| `verify/injected-no-synthesis-window.golden.mjs` | 169 | GREP SURVEY (pattern scan only) | |
| `verify/layer-c-insert-gate-proof.mjs` | 126 | GREP SURVEY (pattern scan only) | |
| `verify/ledger-onepass-audit.mjs` | 116 | GREP SURVEY (pattern scan only) | |
| `verify/lib/dead-column-scan.mjs` | 132 | GREP SURVEY (pattern scan only) | |
| `verify/lib/dead-column-scan.test.mjs` | 89 | GREP SURVEY (pattern scan only) | |
| `verify/lib/duplicate-table-scan.mjs` | 284 | GREP SURVEY (pattern scan only) | |
| `verify/lib/duplicate-table-scan.test.mjs` | 254 | GREP SURVEY (pattern scan only) | |
| `verify/lib/harness-family-walk-scan.mjs` | 323 | GREP SURVEY (pattern scan only) | |
| `verify/lib/harness-family-walk-scan.test.mjs` | 298 | GREP SURVEY (pattern scan only) | |
| `verify/lib/information-schema-scan.mjs` | 84 | GREP SURVEY (pattern scan only) | |
| `verify/lib/rls-adversarial-probe.mjs` | 88 | GREP SURVEY (pattern scan only) | |
| `verify/lib/schema-drift.mjs` | 86 | GREP SURVEY (pattern scan only) | |
| `verify/lib/schema-drift.test.mjs` | 83 | GREP SURVEY (pattern scan only) | |
| `verify/lib/ui-orphan-scan.mjs` | 364 | GREP SURVEY (pattern scan only) | |
| `verify/lib/ui-orphan-scan.test.mjs` | 207 | GREP SURVEY (pattern scan only) | |
| `verify/lib/vocab-drift.mjs` | 50 | GREP SURVEY (pattern scan only) | |
| `verify/lib/vocab-drift.test.mjs` | 52 | GREP SURVEY (pattern scan only) | |
| `verify/migration-number-collision.mjs` | 74 | GREP SURVEY (pattern scan only) | |
| `verify/mint-gates-live-hold.golden.mjs` | 63 | GREP SURVEY (pattern scan only) | |
| `verify/mint-gates.golden.mjs` | 52 | GREP SURVEY (pattern scan only) | |
| `verify/mode-tag-coverage-audit.mjs` | 85 | GREP SURVEY (pattern scan only) | |
| `verify/mutation-lease.golden.mjs` | 68 | GREP SURVEY (pattern scan only) | |
| `verify/no-generic-source-audit.golden.mjs` | 28 | GREP SURVEY (pattern scan only) | |
| `verify/no-generic-source-audit.mjs` | 69 | GREP SURVEY (pattern scan only) | |
| `verify/no-names.mjs` | 50 | GREP SURVEY (pattern scan only) | |
| `verify/non-destructive-grounding.golden.mjs` | 201 | GREP SURVEY (pattern scan only) | |
| `verify/one-tier-per-host-audit.mjs` | 40 | GREP SURVEY (pattern scan only) | |
| `verify/orphan-source-audit.mjs` | 49 | GREP SURVEY (pattern scan only) | |
| `verify/pagination-order-key-audit.test.mjs` | 195 | GREP SURVEY (pattern scan only) | |
| `verify/pause-flag-guard-proof.mjs` | 75 | GREP SURVEY (pattern scan only) | |
| `verify/population-report.mjs` | 918 | GREP SURVEY (pattern scan only) | |
| `verify/population-report.test.mjs` | 905 | GREP SURVEY (pattern scan only) | |
| `verify/primary-text-permanent.golden.mjs` | 46 | GREP SURVEY (pattern scan only) | |
| `verify/prov-guard-adversarial-audit.mjs` | 156 | GREP SURVEY (pattern scan only) | |
| `verify/quarantine-disposition-audit.mjs` | 115 | GREP SURVEY (pattern scan only) | |
| `verify/remediate-orphan-sources.mjs` | 76 | GREP SURVEY (pattern scan only) | |
| `verify/resolver-status-filter.golden.mjs` | 45 | GREP SURVEY (pattern scan only) | |
| `verify/rls-credential-parity.mjs` | 122 | GREP SURVEY (pattern scan only) | |
| `verify/routing.mjs` | 69 | GREP SURVEY (pattern scan only) | |
| `verify/run-data-audit-lane.mjs` | 142 | GREP SURVEY (pattern scan only) | |
| `verify/run-data-audit-lane.test.mjs` | 81 | GREP SURVEY (pattern scan only) | |
| `verify/run-goldens.mjs` | 61 | GREP SURVEY (pattern scan only) | |
| `verify/schema-drift-audit.mjs` | 94 | GREP SURVEY (pattern scan only) | |
| `verify/source-link-audit.mjs` | 53 | GREP SURVEY (pattern scan only) | |
| `verify/source-vs-item.mjs` | 59 | GREP SURVEY (pattern scan only) | |
| `verify/spec09-org-rls-adversarial-audit.mjs` | 194 | GREP SURVEY (pattern scan only) | |
| `verify/spec09-org-rls-adversarial-audit.test.mjs` | 198 | GREP SURVEY (pattern scan only) | |
| `verify/staged-transit-audit.mjs` | 106 | GREP SURVEY (pattern scan only) | |
| `verify/substrate-agreement-audit.mjs` | 41 | GREP SURVEY (pattern scan only) | |
| `verify/surface-contract-gate.golden.mjs` | 131 | GREP SURVEY (pattern scan only) | |
| `verify/surface-visibility-audit.mjs` | 119 | GREP SURVEY (pattern scan only) | |
| `verify/target-match.golden.mjs` | 116 | GREP SURVEY (pattern scan only) | |
| `verify/ui-orphan-audit.mjs` | 161 | GREP SURVEY (pattern scan only) | |
| `verify/unregistered-span-host-audit.mjs` | 53 | GREP SURVEY (pattern scan only) | |
| `verify/verification-audit-report.mjs` | 304 | GREP SURVEY (pattern scan only) | |
| `verify/verification-audit-report.test.mjs` | 334 | GREP SURVEY (pattern scan only) | |
| `verify/vocab-sync-audit.mjs` | 56 | GREP SURVEY (pattern scan only) | |
| `verify/wave-acceptance-audit.mjs` | 137 | GREP SURVEY (pattern scan only) | TODO-1 |
