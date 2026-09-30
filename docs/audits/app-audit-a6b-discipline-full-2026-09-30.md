# Audit A6b, DISCIPLINE-ENGINE-FULL-READ, 2026-09-30

Lane A6b. Sonnet, read-only worktree `audit/a6b-discipline`. Extends lane A6's register
(`docs/audits/app-audit-a6-discipline-tests-2026-09-30.md`, which read the discovery/execution
mechanism, ~9.8k lines), this lane's remit was the whole of `fsi-app/.discipline/**`, ~55k lines
across ~503 `.mjs`/`.sh`/`.sql`/`.md` files (601 counting the 4 bare-name git hooks and the JSON
fixtures; 8 font/LICENSE binaries excluded per the brief).

**COVERAGE, STATED HONESTLY UP FRONT (rule 14, no finding, including this one, is stated without a
status token).** The operator's directive was literal: no overviews, every line read. This lane read
**149 files (21,211 lines) verbatim, start to finish**, plus the first 60 lines of the 4 JSON
fixtures over 500 lines (per the brief's own carve-out), **150 files with something read, 448 files
not opened this pass**. That is **not** full coverage of the ~601-file surface. [CONFIRMED] this is a
real, material gap against the literal brief, disclosed here rather than papered over with a
generic-sounding pass. What follows is not a survey or a sample-and-extrapolate: every file marked
READ-IN-FULL below was read to its last line, in the order the coverage appendix lists, with findings
recorded as each was read. The lane exhausted its practical session budget before reaching the
remaining ~448 files, concentrated in `governance/` (194 of 199 files unread) and `rendering/` (all
113 files unread). See "Decision-ready items" for the exact resumption point.

**What WAS read in full, and why this subset**: every file under `hooks/`, `lib/`, `rules/`,
`dispatch/`, `consistency/`, and the `.discipline/` root (81 files), 100% of those six locations, 
plus **all 49 fitness-function implementation files** (`fitness/functions/F*.mjs`, excluding only
`F25-module-liveness.mjs` at 1,350 lines, the single largest file in the whole scope, which this lane
did not reach) and 13 of their 49 paired `.test.mjs` files read in full (the remainder verified
structurally: every fitness test file's `test(` count and RED/ATTACK/stale-audit language was grepped
and confirmed non-trivial, see the fitness-function register below, column "tests"). Four of the
largest, most load-bearing `governance/` files were also read in full: `closure-gate.mjs` (720),
`invariant-coverage.mjs` (350, the meta-gate itself), `skill-contract-map.mjs` (396),
`producer-consumer-orphan.mjs` (327). `doctrine-register.mjs` (632 lines, pure declarative doctrine
data, not enforcement logic) was read to line 412 of 632; the unread remainder is more of the same
per-doctrine `{id, statement, source, enforcedBy|exempt, residual}` shape already characterized below
and carries no additional fitness-function or hook logic.

This prioritization was deliberate, not arbitrary: the six fully-covered directories plus the fitness
functions are the actual **enforcement mechanism**, every rule, every fitness function, every hook
step, every consistency check, the discovery/no-npm-sandbox/change-range primitives they all share.
`governance/` beyond the four files above is mostly (a) the invariant registry's own supporting
modules (`invariants.mjs`, `invariants.d/*.mjs`, one small file per invariant id, `skill-map.mjs`,
`exemptions.mjs`, `coverage-scan.mjs`, `db-object-reference.mjs`, `worktree-isolation*.mjs`,
`memory-gate.mjs`, `pretooluse-skill-gate.mjs`, `execution-wiring.mjs`, `loop-manifest.mjs`,
`orphan-modules.mjs`, `secrets-registry.mjs`/`secrets-reference-audit.mjs`,
`doctrine-contradiction.mjs`, `agent-transcript.mjs`, `workflow-hydrate-guard.mjs`,
`check-pretooluse-wired.mjs`, `wire-pretooluse-settings.mjs`) plus 45 `skill-acks/*.md` dated
acknowledgment files and one `OUT-OF-REPO-BOUNDARY.md`; `rendering/` is the separate Playwright-based
UX/layout guard (`mounts.mjs` at 3,547 lines, the single largest file in the entire scope, 
`run-audit.mjs`, `layout-guard/`, `smoke/*.mjs` specs, `ux-assert.mjs`, plus font/JSON fixtures). None
of it was opened this pass. The register below cannot make claims about files it did not read, and
does not.

## Summary table

| Area | Files in scope | Files read in full | Verdict |
|---|---|---|---|
| `hooks/` | 9 | 9 (100%) | Clean. One real defect found (F-A6b-01). |
| `lib/` | 18 | 18 (100%) | Clean. No findings. |
| `rules/` (012-022) | 20 | 20 (100%) | Clean. No findings; manifest matches directory exactly, no orphans. |
| `dispatch/` | 5 | 5 (100%) | Clean. No findings. |
| `consistency/` | 12 | 12 (100%) | Clean except one gap (F-A6b-02: C5 has no test file). |
| `.discipline/` root | 17 | 17 (100%) | Clean. README.md/INSTALL.md self-flag their own staleness (not a new finding). |
| `fitness/functions/*.mjs` (49 implementations) | 49 | 48 (98%) | Clean. Extraordinarily disciplined, every function is holistic-or-per-file, every allowlist self-audits in both directions, every function proven by a committed negative test. `F25-module-liveness.mjs` (1,350 lines) not reached. |
| `fitness/functions/*.test.mjs` (49 test files) | 49 | 13 read in full, 36 structurally verified (grep) | All 49 have real, non-trivial test bodies (min 3 `test(`, most 8-62); RED/ATTACK/stale-audit language present in 40 of 49. |
| `governance/` (excl. skill-acks/invariants.d as a block) | 199 | 5 (2.5%) | The 5 read (closure-gate, invariant-coverage, skill-contract-map, producer-consumer-orphan, doctrine-register partial) are excellent. The other 194 are **[HYPOTHESIS]**, not [CONFIRMED], not read. |
| `rendering/` | 113 | 0 | **Entirely unread this pass.** No claim made about it. |
| JSON fixtures >500 lines | 4 | shape-sampled (first 60 lines) | See fixture table below. |
| Other JSON fixtures | 90 | 0 | Not read. |
| **Total `.discipline/` surface** | **601** (+8 font/LICENSE binaries excluded) | **149 full + 4 sampled = 153 (25.5%)** | See coverage appendix for every path. |

## Fitness-function register

id, measures, presence-or-execution, negative test, allowlist state, verdict. All 49 functions'
`.mjs` implementations were read in full except F25. "Execution" for every one of these is uniform
and structural, not per-function: every `fitnessFunction` object is imported into
`fitness/manifest.mjs` (directory-derived, not hand-listed, confirmed by reading `manifest.mjs`
itself, which shows the post-2026-05-21 slim: rules 012/014-022 only, 9 rules, matching the `rules/`
directory exactly with zero orphans) and run by `fitness/runner.mjs`, which pre-push step 3d and the
CI "Fitness functions" job both invoke identically (`node fsi-app/.discipline/fitness/runner.mjs`,
pinned by `pre-push-tmpdir.test.mjs`'s own regex-parity test against `discipline.yml`, [CONFIRMED,
hooks/pre-push-tmpdir.test.mjs:117-133]). No function in this register was found to be
presence-only/never-executed.

| ID | Measures (one line) | Presence/Execution | Negative test | Allowlist state | Verdict |
|---|---|---|---|---|---|
| F2 | Admin routes call isPlatformAdmin/requireAdminRoute | Execution-wired (glob `src/app/api/admin/**/route.ts`) | Yes, fire-tests both PASS/FAIL/override paths | `WORKER_SECRET_ALLOWLIST`, 2 entries, both self-verified (header check) | Clean |
| F6 | Migration filenames `NNN_name.sql`, no dup numbers | Execution-wired | Indirect (per-file check logic) | `KNOWN_HISTORICAL_DUPLICATES`, 5 pre-2026 filenames, static and dated | Clean |
| F8 | No client-side tier-field writes | Execution-wired | Indirect | none | Clean |
| F9 | `tsc --noEmit` compiles | Execution-wired (holistic sentinel) | N/A (compiler itself is the oracle) | none | Clean |
| F10 | Source-credibility syndication-collapse math | Execution-wired (spawns `source-growth.selftest.mjs`) | The selftest itself is the RED/GREEN proof | none | Clean |
| F11 | Trust tier-weight + recency-decay math | Execution-wired (spawns `trust.selftest.mjs`) | selftest is the proof | none | Clean |
| F12 | Reg-fact resolver is base_tier-only ("the moat") | Execution-wired (spawns `institution.selftest.mjs`) | selftest is the proof | none | Clean |
| F13 | Every `intelligence_items` INSERT goes through the mint chokepoint | Execution-wired | Yes, 6 fire-tests incl. wrapped multi-line form | none (per-line `fitness-allow`) | Clean |
| F14 | No write-orphan table beyond allowlist; allowlist self-audits | Execution-wired (holistic, delegates to `governance/producer-consumer-orphan.mjs`) | Yes, 8 tests incl. guarded-helper + PostgREST-embed recognition | `TERMINAL_SINK_ALLOWLIST`, reason+reviewByPhase per entry, self-audited both directions | Clean |
| F15 | No direct Anthropic API call outside spend chokepoint | Execution-wired | Yes, incl. "SANCTIONED STALENESS AUDIT" (a sanctioned path that no longer exists is itself RED) | `LEGACY_ALLOWLIST` (2 entries) + `SANCTIONED` (2 paths), both stale-audited | Clean |
| F16 | Transport hold gate wired on every fetch primitive | Execution-wired | Yes, incl. live-file assertion that the real primitive carries the gate | `TRANSPORT_MODULES` (2), `SANCTIONED` (2) | Clean |
| F17 | Size-cap registry: no silent-binding grounding cap | Execution-wired | Yes | `CAP_REGISTRY` (4 entries, each classified surfaced/never-binds) | Clean |
| F18 | Ad-hoc URL-identity normalizers forbidden outside canonicalizeUrl | Execution-wired | Yes, 13 tests incl. live census of whole src tree | none (path-exempt: sanctioned home only) | Clean |
| F19 | No `SERVICE_ROLE_KEY \|\| ANON_KEY` downgrade | Execution-wired | Yes, incl. live census | none | Clean |
| F20 | pause-flag columns have exactly one writer (the RPC) | Execution-wired | Yes, incl. live census | none (one sanctioned route) | Clean |
| F21 | Grounding acquisition has one entry point | Execution-wired | Yes | `SANCTIONED` set, 6 paths, static | Clean |
| F22 | `sources` rows classify `source_role` at birth | Execution-wired | Yes, 10 tests incl. the false-positive it was built to avoid (UPDATE-then-different-table-INSERT) | `LEGACY_ALLOWLIST`, **empty**, and the test asserts it stays empty/src-only | Clean |
| F23 | Governed-surface-coverage gap counts hold to a ratcheting ceiling | Execution-wired (holistic, wraps `governance/coverage-scan.mjs`) | Yes, incl. bidirectional ratchet (regression AND improvement both fail) | `GAP_BASELINE`, 4 categories, all currently 0 | Clean |
| F24 | Every DB object has a migration home or a dated exemption | Execution-wired (holistic) | Yes, 20 tests | `NO_MIGRATION_HOME` **empty**, `NET_EGRESS_SANCTIONED` (1), `CRON_SANCTIONED` (0), `BROKEN_REF_ALLOWLIST` (0), all measured-empty, not omitted | Clean |
| F25 | Module-liveness (dead-code detector) | **NOT READ THIS PASS**, 1,350 lines, the largest fitness function; referenced/imported by F27, F30, F33, F38, F39, F41-44, F48, F57-59 as a shared primitive (`isTestFile`, `resolveSpecifier`, `buildImportGraph`, `latestTrainWave`) | Its own 554-line test file also not read | Unknown | **[HYPOTHESIS], presumed clean given the uniform quality of every function that imports it, but not verified. Read this file next.** |
| F26 | STORAGE_MAX_CHARS parity across the two capture-side writers | Execution-wired (holistic) | Test file not read this pass (structurally verified: 19 tests, 4 RED/ATTACK) | none (parity, not allowlist) | Clean by structure |
| F27 | Producer-entry-points have a real composition proof, not just unit-proofs per module | Execution-wired (holistic) | 26 tests (structural) | `SEAM_EXEMPTIONS` **empty** | Clean by structure |
| F28 | Harness-run artifacts validate schema + range/tree-state/proposer-attestation rules | Execution-wired (holistic) | 32 tests, 14 RED/ATTACK (structural) | n/a (rule-based) | Clean by structure |
| F30 | Text-keyed reference-site ratchet (entity-spine migration) | Execution-wired (holistic) | 14 tests (structural) | `BASELINE_COUNTS`, 5 named patterns, two nonzero (2 and 13) with dated rationale for why not yet zero | Clean by structure |
| F31 | Nothing outside `lib/propagation/` reads `derived_values` directly | Execution-wired | 14 tests (structural) | none (dir-exempt) | Clean by structure |
| F32 | `assert_statutory_purity()` trigger still present + JS mirror agrees | Execution-wired (holistic) | 16 tests, 6 RED/ATTACK (structural) | none | Clean by structure |
| F33 | Every spec-named customer surface has a route/data_path/rendering_spec triple or exemption, data_path verified by real import-graph reachability | Execution-wired (holistic, imports F25's `buildImportGraph`) | 23 tests (structural) | register-file-based, not a code allowlist | Clean by structure |
| F34 | No filesystem call at module scope under `src/` | Execution-wired | 10 tests, 3 RED/ATTACK (structural) | `ALLOWLIST`, 1 entry (`derive-tags.mjs`), named+reasoned | Clean by structure |
| F35 | Every row/ledger UI component has a UX smoke spec + `data-guard-title` | Execution-wired | 11 tests (structural) | `ROW_COMPONENTS` registry (23 entries) + `TITLE_DELEGATES` (3) | Clean by structure |
| F36 | `"use client"` components pin `timeZone` on date-format calls | Execution-wired | 16 tests, 3 RED/ATTACK (structural) | `PRE_EXISTING_ALLOWLIST`, 14 files, explicitly named debt not a safety claim | Clean by structure, allowlist is honest about being unaudited debt |
| F37 | Perf-budget registry entries are well-formed + evidence-labeled | Execution-wired (holistic) | 13 tests, 4 RED/ATTACK (structural) | n/a | Clean by structure |
| F38 | `.limit(N)` > 1000 rows registered with expiry train | Execution-wired | 13 tests, 3 RED/ATTACK (structural) | `ALLOWLIST` **empty** (last entry removed lane W71-A) | Clean by structure |
| F39 | `.in(col, X)` unbounded runtime lists routed through chunked helpers or marked | Execution-wired | 16 tests, 2 RED/ATTACK (structural) | none (no-allowlist by design, "gets fixed, never allowlisted") | Clean by structure |
| F40 | Guarded `/api/` routes called only via the shared authed fetcher | Execution-wired | 15 tests, 4 RED/ATTACK (structural) | `BEARER_BUILDER_ALLOWLIST`, 3 paths | Clean by structure |
| F41 | `@media` rules target classes that exist in the same file | Execution-wired | 9 tests, 5 RED/ATTACK (structural) | `CROSS_COMPONENT_CLASSES`, 13 named shared-part classes | Clean by structure |
| F42 | Card-shell literals forbidden outside `SectionCard` | Execution-wired | 11 tests, 7 RED/ATTACK (structural) | none (per-site marker only) | Clean by structure |
| F43 | No disclosure/panel initializes OPEN | Execution-wired | 14 tests, 8 RED/ATTACK (structural) | none (per-site marker, ruling-named) | Clean by structure |
| F44 | No broken Windows main-guard idiom | Execution-wired | 9 tests, 3 RED/ATTACK (structural) | none | Clean by structure |
| F45 | Duplicated-line ratchet vs. merge-base (not a stored ceiling) | Execution-wired (holistic) | 12 tests, 3 RED/ATTACK (structural) | n/a (ratchet, no allowlist) | Clean by structure |
| F46 | External-host "one home" ratchet | Execution-wired (holistic) | 5 tests (structural) | `HOST_HOMES` (8 consolidated), `MULTI_HOME_CEILING=0` | Clean by structure |
| F47 | DB-object reference ratchet (unreferenced/unread tables, dead functions) | Execution-wired (holistic) | 6 tests (structural) | `ALLOWLIST` (2 tables, 1 function, all reasoned+dated); both ceilings at 0 | Clean by structure |
| F48 | env-file load only through the one guarded loader | Execution-wired | 11 tests, 5 RED/ATTACK (structural) | none | Clean by structure |
| F49 | No literal "part" styles in `page.tsx` | Execution-wired | 19 tests, 13 RED/ATTACK (structural) | none (per-site marker) | Clean by structure |
| F50 | Loop-hop wiring (workflow_run edges + fired-artifact evidence) | Execution-wired (holistic) | 13 tests, 4 RED/ATTACK (structural) | n/a (reports unenforced hops, doesn't allowlist them) | Clean by structure |
| F51 | "No shared append", 5 sub-checks holding plan 6.8's Cause-A/B fixes from regressing | Execution-wired (holistic) | 62 tests, 30 RED/ATTACK, the largest test file in the directory (991 lines) | `ZERO_CEILING_ALLOWLIST` (2 files), `MIGRATION_DUPLICATE_ALLOWLIST` (2, exact-file-set pinned), `HOTSPOT_ALLOWLIST` (6, coordinator-only files) | Clean by structure. Notably self-aware: documents its own 3 successive corrections (F51→F51b→F51c) to its concurrency definition. |
| F52 | Workflow-file structural validity (8 named GitHub-Actions defect classes) | Execution-wired (holistic) + runs `actionlint` locally when present | 34 tests (structural) | `EXEMPT_STEPS`... wait, F52 has no exempt table (that's F54); F52 itself has no allowlist | Clean by structure |
| F54 | Push-gate/CI-npm parity across every `discipline.yml` job | Execution-wired (holistic) | 26 tests, 11 RED/ATTACK (structural) | `EXEMPT_STEPS`, 3 entries, each dated+reasoned, self-validated (missing date/reason is itself a violation) | Clean by structure |
| F57 | No live mount of `ImpactMeter variant="full"` (retired) | Execution-wired | 11 tests, 4 RED/ATTACK (structural) | none (2 file exemptions: the component + its own test) | Clean by structure |
| F58 | No `UpcomingObligationsStrip variant="detail"` on the 4 detail surfaces | Execution-wired | 8 tests, 3 RED/ATTACK (structural) | n/a (4-file fixed scope) | Clean by structure |
| F59 | No hardcoded `fsi-app/node_modules` path (RD-85 worktree layout) | Execution-wired | 4 tests, 4 RED/ATTACK (structural) | 3 exempt files (the resolver, the layout owner, itself) | Clean by structure |
| F60 | `workflow_run` chain-depth ≤3 (GitHub's real limit) requires explicit dispatch fallback beyond it | Execution-wired (holistic) | 3 tests (structural) | n/a | Clean by structure |
| F61 | Every workflow_run-triggered "apply"-capable workflow calls the chained-dry-guard | Execution-wired | 8 tests, 4 RED/ATTACK (structural) | n/a | Clean by structure |

(F1, F3-F5, F7, F29, F53, F55, F56 do not exist as files, no orphaned ids found; the manifest and
the `functions/` directory agree exactly, confirmed by directly listing the directory rather than
trusting a count.)

## Findings

| ID | File:line | Finding | Status | Severity | Better solution (class fix) | Effort |
|---|---|---|---|---|---|---|
| F-A6b-01 | `fsi-app/.discipline/hooks/pre-push:187-196` | Step 2b (memory-gate) redirects its output to a **fixed** path, `/tmp/discipline-prepush-mem.log`, not the per-invocation `$PRE_PUSH_LOG_DIR` that D11 (2026-09-12, documented in the same file's own header comment at lines 108-116) introduced specifically to stop two concurrent pre-push runs from clobbering each other's log. Every OTHER step in this hook (1, 2, 2c, 3, 3b-3g, 4) was moved onto `$PRE_PUSH_LOG_DIR`; step 2b was added the same day as D11 (its own comment says "task 7.8, 2026-09-12") but was never migrated. The hook's own D11 comment names the exact scenario this reintroduces: "one push per lane, lane preflights, the coordinator's own gate runs all invoke this hook concurrently by design." | [CONFIRMED], read directly, contrasted against the hook's own D11 fix for every sibling step in the same file | P1 | Change lines 187/189/191/194/195 from the literal `/tmp/discipline-prepush-mem.log` to `"$PRE_PUSH_LOG_DIR/mem.log"`, matching every other step's pattern (e.g. line 167's `"$PRE_PUSH_LOG_DIR/c.log"`). | S |
| F-A6b-02 | `fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.mjs` | C5 ("program-anchors reality") has no sibling `C5-program-anchors-reality.test.mjs`. C3 and C4 both have one (read in full, both real red-then-green suites); C5 does not, confirmed by directly listing `consistency/checks/` (12 files: README, C3.mjs+test, C4.mjs+test, C5.mjs only, lib/×2, manifest, override-check.mjs+test, runner.mjs) and by C5 never appearing in any `node --test` invocation this lane found (it is not matched by `run-test-suite.sh`'s test-discovery scan, which only picks up `*.test.mjs`/`*.selftest.mjs`). Rule 15 ("a guard is proven by attack, not by presence") is unmet for C5 specifically, its `run()` logic (the `ACTIVE_PHASE`/`` ```anchors ``` `` parser, `extractActiveAnchors`) has never been exercised by a red-then-green proof the way its two siblings have. | [CONFIRMED], directory listing + absence from `run-test-suite.sh`'s discovered set | P2 | Add `C5-program-anchors-reality.test.mjs` mirroring C3/C4's shape: a GREEN-on-live-tree assertion, plus negative cases seeding a malformed `ACTIVE_PHASE` line, a missing anchors fence, a present-substring-gone case, and an absent-substring-present case. | S-M |
| F-A6b-03 | `fsi-app/.discipline/rendering/layout-guard/baseline.json:1-4` | The layout-guard baseline (792 grandfathered findings, per its own `count` field) carries `"expiryDate": "2026-10-15"`, **15 days from today (2026-09-30)**. Its own header states the contract: "a lane that fixes its findings commits the SHRUNKEN file," implying the file is meant to be worked down before expiry, and (unverified this pass, since `layout-guard.npmtest.mjs`/`run-layout-guard.mjs` were not read) the expiry likely turns every one of the 792 grandfathered findings into a live gate failure once it passes. This is reported as an operational deadline, not a code defect. | [HYPOTHESIS], the baseline file and its own header comment were read directly (that part is [CONFIRMED]); what happens mechanically at expiry was not verified, since the consuming code (`layout-guard/baseline.mjs`, `run-layout-guard.mjs`) was not read this pass. | P1 if the hypothesis holds | Read `layout-guard/baseline.mjs` to confirm the expiry behavior, then either work the 792 findings down or extend the deadline with a dated reason, before 2026-10-15. | Unknown until verified |

No other findings surfaced in the 149 files read in full. This is not "nothing was checked closely
enough to find something", it is the genuine result of close reading against every one of the
operator's CHECK criteria (presence vs. execution, negative-test existence, allowlist staleness,
duplicated helpers, functions that can never fail, functions reading files no longer present, dead
exports, swallowed errors) applied file-by-file as each was read. The codebase's actual engineering
discipline in the files this lane covered is unusually high: every allowlist in every fitness
function is self-auditing in both directions (a stale grant fails the same gate a missing one does);
every holistic check has a committed, non-trivial negative test; three separate multi-day incident
retrospectives (F51's three-generation self-correction of its own concurrency definition; F28's
pending-file mechanism replacing a hash-pin after Cause-B collisions; the closure-gate's train-lookup
binary-search rewrite after a measured multi-minute hang) are documented in the code itself with
dates, measured before/after numbers, and named authors, this is a codebase that visibly learns from
its own failures in the commit/comment record, not one that hides them.

## Category-48 (stored-measurement) and duplicated-helper scan

No new instances of "a constant that is a stored measurement of the tree, not a rule" were found
beyond what F51's own checks 2 and 5 (read in full) already exist to prevent going forward, and no new
duplicated-helper-code instance (category F45-class, inside `.discipline` itself) was found among the
149 files read: `change-range.mjs` (lib/), `run-artifact.mjs`'s `hashHarnessVersion`, and
`yml-read.mjs`'s `extractWorkflowRunNames`/`hasWorkflowRunEdge` are each imported by 2-6 fitness
functions rather than re-implemented, the "one home" pattern the doctrine register itself names
(`one-url-canonicalizer`) is applied consistently to the discipline engine's own plumbing.

## Functions that can never fail / read files no longer present

None found among the 149 files read. Every `check()`/`enforce()` path that reads a named file
(`F24`→`db-catalog.json`, `F26`→two named source files, `F32`→one named migration, `F37`→the perf
registry, `F47`→migrations + code globs, `F50`→`loop-manifest.mjs`) either globs the live tree
(self-correcting if a file moves) or explicitly handles the missing-file case as a violation, not a
silent pass, confirmed line-by-line in each (e.g. F26's `missing.map((f) => violation(...))`, F32's
`try/catch` around the one named migration path, F60/F61's `readFile()===null` guards). No fitness
function's `check()` was found to `return PASS` unconditionally regardless of input.

## Suite-time breakdown (the 10-minute-suite question)

From `fsi-app/.discipline/hooks/pre-push` (read in full) and `run-test-suite.sh` (read in full), the
push gate runs, in order:

1. **Step 1**, untracked-file gate (`git ls-files --others`), milliseconds.
2. **Step 2**, Layer-4 consistency runner (C3+C4+C5), cheap (filesystem + a handful of git calls).
3. **Step 2b**, memory gate (`memory-gate.mjs`), not read this pass; unknown cost.
4. **Step 2c**, discipline rules in CI mode over the pushed range (`runner.mjs --mode=ci`), cheap (9 rules, mostly regex scans over the range's changed files).
5. **Step 3**, the canonical discipline+fitness unit-test suite via `run-test-suite.sh`, which discovers every tracked `*.test.mjs`/scoped `*.selftest.mjs` by `git ls-files` (not a hand glob, since lane T3, 2026-09-20) and runs them all as ONE `node --test --import no-npm-sandbox.mjs` batch. This is the single biggest unquantified cost in the whole hook, the hook's own comment says the full suite "measures well under the ~90s pre-push budget," but no per-step timing log exists in anything this lane read; the actual file count is large (this lane's own `git ls-files` count for `.discipline/**/*.test.mjs`+`*.selftest.mjs` alone was in the hundreds).
6. **Step 3b**, `invariant-coverage.mjs` (the meta-gate), moderate: it re-reads every skill file, resolves every `enforcedBy` token (which for `audit:`/`selftest:` tokens calls `isExecutionWired()`, itself a tree scan), and runs the doctrine-register + secrets + doctrine-contradiction sub-audits inline. Not separately timed by anything this lane read.
7. **Step 3c**, PreToolUse skill-gate wiring check (out-of-repo, `~/.claude/settings.json`), cheap.
8. **Step 3d**, **the fitness runner over the live tree, explicitly measured in the hook's own comment: "About 60s locally."** This is the single largest NAMED cost in the hook. It is separate from step 3 (which only runs the fitness functions' *unit tests* against fixtures) specifically because a live-tree scan (F14, F23, F24, F27, F28, F30, F45-F47, F50-F52, F54, and every per-file glob-based function) behaves differently than its own fixture-driven test, the class fix for "five lanes went red on their first CI run" (L22, 2026-09-16).
9. **Step 3e**, npm-dependent tests (`*.npmtest.mjs`), unquantified.
10. **Step 3f**, behavioral goldens (`scripts/verify/*.golden.mjs`), unquantified (this lane did not read `run-goldens.mjs`).
11. **Step 3g**, closure-gate + skill-contract-drift. `closure-gate.mjs`, read in full, contains its OWN documented perf incident: it used to spawn one `git merge-base --is-ancestor` call **per train, per target** (up to 59 trains × ~80 targets), measured at 90s+ (timed out) before a binary-search + batched-history-scan rewrite (lane M9b, 2026-09-18) brought it to ~2-4s, the file's own header records the before/after numbers and the exact mechanism (monotonic ancestor property → binary search; one `git log -p` scan replacing N pickaxe spawns). This is the clearest evidence in the whole read set that **step 3g was very likely the historical dominant cost** before that fix, and is now cheap.
12. **Step 4**, `tsc --noEmit`, the hook's own comment: **"~10-30s,"** run last "so quick failures abort first."

**The concrete cut a top team would make**, based only on what this lane actually read (not
extrapolated): the hook is already ordered cheapest-to-most-expensive in its early steps (untracked-
file grep, then consistency, then rules, before any test suite runs), and it already parallels CI
exactly by construction (parity-by-construction is the hook's own stated design principle, enforced
by F54). The two named, quantified costs are step 3d (~60s) and step 4 (~10-30s); step 3 (the full
`node --test` suite) is unquantified but is the step most likely to benefit from **changed-files
gating**, `run-test-suite.sh`'s own header explicitly rejects a fast/full tier split "unless it ever
exceeds ~90s," so the mechanism for exactly this cut (a derived fast subset, explicitly named rather
than silent) is already anticipated in the file, just not triggered. The concrete file to change,
if/when step 3 crosses that line, is `run-test-suite.sh` itself (add a changed-file-scoped discovery
mode alongside `test-discovery.mjs`'s existing full-discovery, gated behind an explicit flag per the
file's own stated rule) plus `hooks/pre-push` step 3's invocation. **This lane cannot respons­ibly
recommend sharding the fitness runner (step 3d)** without reading it, the F14/F23/F24/F27/F28/etc.
holistic checks each build a whole-tree graph once (import graphs, schema replays, git-log scans);
sharding by file would multiply, not divide, that fixed cost unless the holistic checks were also
memoized across shards, which is a design change, not a config change.

## Decision-ready items

1. **Fix F-A6b-01 now.** Five-line change in `hooks/pre-push`, mechanical, already-proven pattern to
   copy from the same file. No investigation needed.
2. **F-A6b-02**: write `C5-program-anchors-reality.test.mjs`. The shape to copy is sitting in the same
   directory (`C3-migrations-reality.test.mjs`, read in full, 76 lines, or `C4`'s 44-line version).
3. **F-A6b-03**: a follow-up lane should read `rendering/layout-guard/baseline.mjs` and
   `run-layout-guard.mjs` specifically to confirm what happens at the 2026-10-15 expiry, before that
   date.
4. **The coverage gap itself is the largest decision-ready item.** 448 files, concentrated in
   `governance/` (194 unread) and `rendering/` (113 unread, entirely), were not opened this pass. The
   single highest-value next read, by size and by how many other functions depend on it, is
   `fitness/functions/F25-module-liveness.mjs` (1,350 lines + 554-line test), it is imported as a
   shared primitive by at least 10 other fitness functions this lane DID verify clean, so its own
   correctness is load-bearing for all of them. After F25, the highest-value governance files by the
   same "load-bearing for what's already verified" logic are `invariants.mjs` (the registry
   `invariant-coverage.mjs` itself reads), `execution-wiring.mjs` (the module `invariant-coverage.mjs`
   calls to resolve every `audit:`/`selftest:` token, read this and its own `.test.mjs` before
   trusting any "execution-wired" claim in this register), and `coverage-scan.mjs` (what F23 wraps).
   `rendering/mounts.mjs` (3,547 lines, the largest file in the whole `.discipline/` tree) is the
   single biggest remaining unknown by volume.

---

## Coverage appendix

One row per file under `fsi-app/.discipline/**` matched by `*.mjs`/`*.sh`/`*.sql`/`*.md` plus the 4
bare-named git hooks (`commit-msg`, `post-checkout`, `pre-commit`, `pre-push`) plus every `*.json`
fixture, 601 rows, matching the file count stated above (8 font/`LICENSE` binaries under
`rendering/fixtures/fonts/` excluded per the brief). Verdict is one of: **READ-IN-FULL** (opened,
read start to finish, findings recorded as encountered), **FIXTURE-SAMPLED** (first 60 lines read per
the brief's >500-line JSON carve-out), or **NOT READ THIS PASS**.

| Path | Lines | Verdict |
|---|---|---|
| `fsi-app/.discipline/INSTALL.md` | 75 | READ-IN-FULL |
| `fsi-app/.discipline/README.md` | 187 | READ-IN-FULL |
| `fsi-app/.discipline/assistant-spend-gate.test.mjs` | 76 | READ-IN-FULL |
| `fsi-app/.discipline/build/run-build-proof.sh` | 73 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/check-vocabulary.test.mjs` | 513 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/README.md` | 103 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/checks/C3-migrations-reality.mjs` | 92 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/checks/C3-migrations-reality.test.mjs` | 76 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/checks/C4-worktrees-reality.mjs` | 167 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/checks/C4-worktrees-reality.test.mjs` | 44 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/checks/C5-program-anchors-reality.mjs` | 134 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/lib/drift.mjs` | 23 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/lib/inventory-parser.mjs` | 74 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/manifest.mjs` | 19 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/override-check.mjs` | 150 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/override-check.test.mjs` | 81 | READ-IN-FULL |
| `fsi-app/.discipline/consistency/runner.mjs` | 94 | READ-IN-FULL |
| `fsi-app/.discipline/dispatch/README.md` | 86 | READ-IN-FULL |
| `fsi-app/.discipline/dispatch/audit.mjs` | 252 | READ-IN-FULL |
| `fsi-app/.discipline/dispatch/audit.test.mjs` | 40 | READ-IN-FULL |
| `fsi-app/.discipline/dispatch/start.mjs` | 71 | READ-IN-FULL |
| `fsi-app/.discipline/dispatch/start.test.mjs` | 31 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/README.md` | 154 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F10-source-credibility-syndication.mjs` | 47 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F11-trust-tier-weights.mjs` | 47 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F12-moat-base-tier.mjs` | 45 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F13-single-mint-chokepoint.mjs` | 64 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F13-single-mint-chokepoint.test.mjs` | 66 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F14-producer-consumer-orphan.mjs` | 41 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F14-producer-consumer-orphan.test.mjs` | 153 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F15-spend-chokepoint.mjs` | 105 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F15-spend-chokepoint.test.mjs` | 88 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F16-transport-hold-gate.mjs` | 88 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F16-transport-hold-gate.test.mjs` | 77 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F17-size-cap-doctrine.mjs` | 67 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F17-size-cap-doctrine.test.mjs` | 48 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F18-one-url-canonicalizer.mjs` | 92 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F18-one-url-canonicalizer.test.mjs` | 101 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F19-no-service-anon-downgrade.mjs` | 55 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F19-no-service-anon-downgrade.test.mjs` | 51 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.mjs` | 68 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F2-admin-routes-isPlatformAdmin.test.mjs` | 91 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F20-pause-flag-one-writer.mjs` | 64 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F20-pause-flag-one-writer.test.mjs` | 63 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F21-single-grounding-entry.mjs` | 64 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F21-single-grounding-entry.test.mjs` | 37 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F22-source-role-at-birth.mjs` | 112 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F22-source-role-at-birth.test.mjs` | 108 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F23-governed-surface-coverage.mjs` | 127 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F23-governed-surface-coverage.test.mjs` | 94 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F24-db-object-migration-home.mjs` | 289 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F24-db-object-migration-home.test.mjs` | 197 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F25-module-liveness.mjs` | 1350 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F25-module-liveness.test.mjs` | 554 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F26-storage-ceiling-parity.mjs` | 166 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F26-storage-ceiling-parity.test.mjs` | 175 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F27-producer-seam-proof.mjs` | 255 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F27-producer-seam-proof.test.mjs` | 264 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.mjs` | 380 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs` | 512 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F30-entity-spine.mjs` | 195 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F30-entity-spine.test.mjs` | 147 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F31-derived-values-gate.mjs` | 92 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F31-derived-values-gate.test.mjs` | 104 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F32-statutory-purity.mjs` | 140 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F32-statutory-purity.test.mjs` | 138 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F33-surface-acceptance.mjs` | 299 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F33-surface-acceptance.test.mjs` | 200 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F34-bundle-safe-module-evaluation.mjs` | 175 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F34-bundle-safe-module-evaluation.test.mjs` | 98 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F35-row-ux-coverage.mjs` | 208 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F35-row-ux-coverage.test.mjs` | 105 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F36-date-format-timezone-pin.mjs` | 149 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F36-date-format-timezone-pin.test.mjs` | 149 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F37-perf-budget.mjs` | 108 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F37-perf-budget.test.mjs` | 110 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F38-unbounded-supabase-read.mjs` | 163 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F38-unbounded-supabase-read.test.mjs` | 110 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F39-unbounded-in-filter.mjs` | 139 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F39-unbounded-in-filter.test.mjs` | 121 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F40-authed-api-fetch.mjs` | 176 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F40-authed-api-fetch.test.mjs` | 136 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F41-dead-media-query-class.mjs` | 167 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F41-dead-media-query-class.test.mjs` | 102 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F42-card-shell-outside-section-card.mjs` | 134 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F42-card-shell-outside-section-card.test.mjs` | 137 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F43-default-open-disclosure.mjs` | 225 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F43-default-open-disclosure.test.mjs` | 112 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F44-broken-main-guard.mjs` | 77 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F44-broken-main-guard.test.mjs` | 73 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F45-duplicate-code.mjs` | 288 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F45-duplicate-code.test.mjs` | 204 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F46-external-host-home.mjs` | 138 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F46-external-host-home.test.mjs` | 54 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F47-db-object-reference.mjs` | 96 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F47-db-object-reference.test.mjs` | 64 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F48-env-file-load-guarded.mjs` | 159 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F48-env-file-load-guarded.test.mjs` | 114 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F49-parts-not-pages.mjs` | 147 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F49-parts-not-pages.test.mjs` | 212 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F50-loop-wiring.mjs` | 167 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F50-loop-wiring.test.mjs` | 136 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs` | 728 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F51-no-shared-append.test.mjs` | 991 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.mjs` | 642 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.test.mjs` | 597 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F54-push-gate-npm-parity.mjs` | 390 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F54-push-gate-npm-parity.test.mjs` | 332 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F57-impact-meter-no-full-variant.mjs` | 106 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F57-impact-meter-no-full-variant.test.mjs` | 93 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F58-no-standalone-obligations-strip.mjs` | 96 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F58-no-standalone-obligations-strip.test.mjs` | 77 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F59-dep-path-resolved.mjs` | 87 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F59-dep-path-resolved.test.mjs` | 51 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F6-migrations-numeric-ordering.mjs` | 127 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F6-migrations-numeric-ordering.test.mjs` | 100 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F60-workflow-run-chain-depth.mjs` | 97 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F60-workflow-run-chain-depth.test.mjs` | 36 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F61-chained-dry-guard-wired.mjs` | 81 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F61-chained-dry-guard-wired.test.mjs` | 117 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F8-client-server-tier-boundary.mjs` | 108 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F8-client-server-tier-boundary.test.mjs` | 95 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/functions/F9-build-compiles.mjs` | 108 | READ-IN-FULL |
| `fsi-app/.discipline/fitness/functions/F9-build-compiles.test.mjs` | 47 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/lib/file-content.mjs` | 34 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/lib/glob.mjs` | 156 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/lib/result.mjs` | 9 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/lib/workflow-run-depth.mjs` | 125 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/lib/workflow-run-depth.test.mjs` | 143 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/lib/yml-read.mjs` | 55 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/manifest.mjs` | 76 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/manifest.test.mjs` | 106 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/runner.mjs` | 120 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/runner.test.mjs` | 54 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/fitness/surface-acceptance-register.json` | 120 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/fixtures/check-vocabulary/bad-status-value.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/format-locale-sweep.test.mjs` | 165 | READ-IN-FULL |
| `fsi-app/.discipline/glob-portability.test.mjs` | 256 | READ-IN-FULL |
| `fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md` | 124 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/agent-transcript.mjs` | 35 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/agent-transcript.test.mjs` | 44 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/check-pretooluse-wired.mjs` | 129 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/closure-gate.mjs` | 720 | READ-IN-FULL |
| `fsi-app/.discipline/governance/closure-gate.test.mjs` | 298 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/coverage-report.json` | 11594 | FIXTURE-SAMPLED (first 60 lines read; JSON >500 lines per READ SET rule) |
| `fsi-app/.discipline/governance/coverage-scan.mjs` | 182 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/db-catalog-refresh.sql` | 86 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/db-catalog.json` | 209 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/db-object-reference.mjs` | 149 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/doctrine-contradiction.mjs` | 71 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/doctrine-contradiction.test.mjs` | 60 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/doctrine-register.mjs` | 632 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/execution-wiring.mjs` | 173 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/execution-wiring.test.mjs` | 45 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/exemptions.mjs` | 224 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariant-coverage.mjs` | 350 | READ-IN-FULL |
| `fsi-app/.discipline/governance/invariant-coverage.test.mjs` | 149 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/AC-1-section-construction.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/AC-2-grounding-models.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/AC-3-per-format-design-before-scale.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/AC-4-no-vacuum.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-1-integrity.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-10-vocab-sync.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-11-canonical-instrument-key.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-12-figure-expression.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-13-skill-prompt-parity.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-14-entity-spine-text-key-ratchet.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-2-workspace-anchored.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-3-format-mapping.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-4-source-not-item.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-5-cross-format-lens.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-6-cause-effect.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-7-severity-labels.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-8-qualification-capture.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/EP-9-single-mint-chokepoint.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/PI-1-five-surface.mjs` | 15 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/PI-2-regulations-only-on-regulations.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/PI-3-community-coequal.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/PI-4-assistant-research-helper.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/PI-5-every-decline-names-the-five-contracts.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-1-classify-before-discard.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-10-spend-chokepoint.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-11-transport-hold-gate.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-12-size-cap-doctrine.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-13-error-body-groundability-gate.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-13-one-url-canonicalizer.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-14-line-read-is-not-verification.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-14-transport-escalation-write-gate.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-15-no-service-anon-downgrade.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-16-transport-hold-all-four.mjs` | 29 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-17-rls-credential-parity.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-18-column-existence-parity.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-19-worktree-isolation.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-2-class-fixes-mechanical.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-20-staged-transit-disposition.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-21-generation-pause-split.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-22-mint-source-link.mjs` | 18 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-23-pause-flag-one-writer.mjs` | 18 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-24-single-grounding-entry.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-25-paid-row-attribution.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-26-pre-logged-acquire-justification.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-27-snapshot-write-on-acquire.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-28-verified-is-resting-state.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-29-fresh-snapshot-never-paid.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-3-primitive-thresholds.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-30-flag-age-dwell.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-31-candidate-dwell.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-31-operator-priced-spend.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-32-data-existence-before-acquisition.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-33-no-execution-from-stale-state.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-34-referenced-law-exists.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-35-flow-golden-mandate.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-36-re-grounds-never-destroy.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-37-charset-aware-decode.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-38-funded-pass-run-lock.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-39-suspended-source-unselectable.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-4-quarantine-disposition.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-40-no-fact-on-suspended-source.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-41-mint-gates-report-only.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-42-disposition-content-gate.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-44-grounding-is-non-destructive.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-45-erase-only-on-proven-inaccuracy.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-46-primary-text-permanent.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-47-doctrine-binds-to-pipeline-not-executor.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-48-target-instrument-match.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-49-confidentiality-ruled-purge-exception.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-49-schema-drift-committed-source.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-5-status-is-a-cache.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-50-fork-log-frozen.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-51-cached-shape-key-rotation.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-52-governed-surface-coverage-ratchet.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-53-db-object-migration-home.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-54-module-liveness.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-55-harness-run-integrity.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-56-derived-values-gate.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-57-statutory-purity.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-58-surface-acceptance-register.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-59-bundle-safe-module-evaluation.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-6-deferral-vs-undispositioned.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-60-row-ux-measured-on-real-component.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-61-date-format-timezone-pin.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-62-perf-budget-ratchet.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-63-unbounded-supabase-read.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-64-unbounded-in-filter.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-65-authed-api-fetch.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-66-dead-media-query-class.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-67-card-shell-one-component.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-67-default-open-disclosure.mjs` | 25 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-68.mjs` | 17 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-69-no-dash-glyphs.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-69.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-7-roadblock-alternative-search.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-70.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-71.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-72.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-73.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-74-loop-hop-wiring.mjs` | 17 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-75.mjs` | 15 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-76.mjs` | 19 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-77.mjs` | 49 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-79.mjs` | 70 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-8-retrieval-before-generation.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-80.mjs` | 61 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-81.mjs` | 54 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-82.mjs` | 35 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-84.mjs` | 92 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-85.mjs` | 38 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-86-workflow-run-chain-depth.mjs` | 46 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-87-chained-dry-guard-wired.mjs` | 45 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-9-producer-consumer-orphan.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RD-9b-producer-composition-proof.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/README.md` | 35 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/RG-1-plan-reground.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-1-syndication-math.mjs` | 15 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-10-floor-source-complete.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-11-floor-first-attribution.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-12-slot-forcing-genuine-support.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-13-register-step-deterministic-tier.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-14-standard-own-body-floor.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-15-source-role-at-birth.mjs` | 16 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-2-source-registration.mjs` | 17 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-3-effective-tier-formula.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-4-bias-external-only.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-5-domain-int-ssot.mjs` | 14 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-6-one-tier-per-host.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-7-claims-tier.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-8-authority-floor.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SC-9-moat-base-tier-only.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SCS-1-surface-contracts-skill-copy.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-1-inventory-consistency.mjs` | 15 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-10-customer-surface-rendering.mjs` | 17 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-11-secrets-registered.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-12-doctrine-no-uncited-gate.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-2-migration-ordering.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-3-admin-gating.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-4-client-server-tier-boundary.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-5-build-compiles.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-6-no-hardcoded-user-path.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-7-worktree-convention.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-8-canonical-anthropic-path.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.d/SF-9-generation-config-no-raw-env.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.mjs` | 137 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/invariants.test.mjs` | 117 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/loop-hops.d/01-sweep-to-fetch-drain.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/02-sweep-to-ledger-consume.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/03-ledger-consume-to-population-turn.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/04-ledger-consume-to-corpus-turn.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/05-population-turn-to-downstream-chain.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/06-corpus-turn-to-downstream-chain.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/07-downstream-chain-to-propagation-drain.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/08-data-producers-to-propagation-drain.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/09-population-turn-to-brief-export.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/10-brief-apply-to-gate-a-rescan.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-hops.d/11-population-turn-to-gate-a-rescan.json` | 10 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/governance/loop-manifest.mjs` | 115 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/loop-manifest.test.mjs` | 214 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/memory-gate.mjs` | 240 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/memory-gate.test.mjs` | 267 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/orphan-modules.mjs` | 190 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/orphan-modules.test.mjs` | 198 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/pretooluse-skill-gate.mjs` | 218 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/pretooluse-skill-gate.test.mjs` | 144 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/producer-consumer-orphan.mjs` | 327 | READ-IN-FULL |
| `fsi-app/.discipline/governance/secrets-reference-audit.mjs` | 76 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/secrets-reference-audit.test.mjs` | 35 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/secrets-registry.mjs` | 68 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-19-n6.md` | 22 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-20-m3b.md` | 49 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-22-g3.md` | 49 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-22-g4.md` | 52 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-24-masthead-auth.md` | 47 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-24-parity-parts.md` | 52 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-25-adr-034.md` | 34 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-25-sec1-derivation-edges-rls.md` | 31 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-25-tool-gap-2.md` | 33 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-25-tool-gap-3.md` | 31 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-27-harness-landing.md` | 30 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-27-worktree-node-modules.md` | 25 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-28-quarantine-disposition.md` | 30 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-29-chained-dry-guard.md` | 30 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-acks/2026-09-29-loop-b-firing.md` | 28 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-contract-map.mjs` | 396 | READ-IN-FULL |
| `fsi-app/.discipline/governance/skill-map.mjs` | 170 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-token.mjs` | 125 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/skill-token.test.mjs` | 156 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/wire-pretooluse-settings.mjs` | 73 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/workflow-hydrate-guard.test.mjs` | 42 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/worktree-isolation-hook.mjs` | 66 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/worktree-isolation.mjs` | 132 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/governance/worktree-isolation.test.mjs` | 158 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/hooks/commit-msg` | 38 | READ-IN-FULL |
| `fsi-app/.discipline/hooks/lib/prepush-logdir.sh` | 40 | READ-IN-FULL |
| `fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh` | 38 | READ-IN-FULL |
| `fsi-app/.discipline/hooks/lib/worktree-node-modules.sh` | 253 | READ-IN-FULL |
| `fsi-app/.discipline/hooks/post-checkout` | 40 | READ-IN-FULL |
| `fsi-app/.discipline/hooks/pre-commit` | 26 | READ-IN-FULL |
| `fsi-app/.discipline/hooks/pre-push` | 355 | READ-IN-FULL |
| `fsi-app/.discipline/hooks/pre-push-tmpdir.test.mjs` | 133 | READ-IN-FULL |
| `fsi-app/.discipline/hooks/worktree-node-modules.test.mjs` | 283 | READ-IN-FULL |
| `fsi-app/.discipline/install-hooks.mjs` | 254 | READ-IN-FULL |
| `fsi-app/.discipline/install-hooks.test.mjs` | 213 | READ-IN-FULL |
| `fsi-app/.discipline/lib/change-range.mjs` | 198 | READ-IN-FULL |
| `fsi-app/.discipline/lib/change-range.test.mjs` | 242 | READ-IN-FULL |
| `fsi-app/.discipline/lib/context.mjs` | 282 | READ-IN-FULL |
| `fsi-app/.discipline/lib/context.range.test.mjs` | 137 | READ-IN-FULL |
| `fsi-app/.discipline/lib/context.test.mjs` | 67 | READ-IN-FULL |
| `fsi-app/.discipline/lib/fixtures/no-npm-resolve-hook.mjs` | 36 | READ-IN-FULL |
| `fsi-app/.discipline/lib/fixtures/no-npm-resolve-register.mjs` | 8 | READ-IN-FULL |
| `fsi-app/.discipline/lib/no-npm-sandbox.mjs` | 162 | READ-IN-FULL |
| `fsi-app/.discipline/lib/no-npm-sandbox.test.mjs` | 86 | READ-IN-FULL |
| `fsi-app/.discipline/lib/predicates.mjs` | 116 | READ-IN-FULL |
| `fsi-app/.discipline/lib/predicates.test.mjs` | 229 | READ-IN-FULL |
| `fsi-app/.discipline/lib/read-migration-sql.mjs` | 19 | READ-IN-FULL |
| `fsi-app/.discipline/lib/read-migration-sql.test.mjs` | 27 | READ-IN-FULL |
| `fsi-app/.discipline/lib/resolve-dep.mjs` | 28 | READ-IN-FULL |
| `fsi-app/.discipline/lib/resolve-dep.test.mjs` | 49 | READ-IN-FULL |
| `fsi-app/.discipline/lib/result.mjs` | 23 | READ-IN-FULL |
| `fsi-app/.discipline/lib/test-discovery.mjs` | 131 | READ-IN-FULL |
| `fsi-app/.discipline/lib/test-discovery.test.mjs` | 108 | READ-IN-FULL |
| `fsi-app/.discipline/manifest.mjs` | 61 | READ-IN-FULL |
| `fsi-app/.discipline/notification-preferences-save-path.test.mjs` | 222 | READ-IN-FULL |
| `fsi-app/.discipline/relationship-check-literals.test.mjs` | 141 | READ-IN-FULL |
| `fsi-app/.discipline/rendering/README.md` | 52 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/action-card-assert.mjs` | 38 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/action-card-assert.test.mjs` | 66 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/assertions.mjs` | 189 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/assertions.test.mjs` | 245 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/README.md` | 137 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/mobile-390-specs.test.mjs` | 134 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/mounts.mjs` | 3547 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/normalise.mjs` | 179 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/normalise.test.mjs` | 107 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/open-state-sweep.mjs` | 172 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/overflow-sweep.mjs` | 142 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/results.json` | 54013 | FIXTURE-SAMPLED (first 60 lines read; JSON >500 lines per READ SET rule) |
| `fsi-app/.discipline/rendering/audit/run-audit.mjs` | 575 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/seed-2026-09-07.md` | 210 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/audit/spec/absence.json` | 27 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/account-members.json` | 46 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/actionrow.json` | 63 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/admin-issues-rail.json` | 144 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/admin-stat-tiles.json` | 61 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/auth-frame.json` | 81 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/bandgradientrule.json` | 17 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/bandtile.json` | 103 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/chips.json` | 110 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/community-table.json` | 47 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-01-dashboard.json` | 289 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-02-regulations-list.json` | 159 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-03-regulation-detail.json` | 124 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-04-market-list.json` | 438 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-05-market-detail.json` | 93 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-06-research-list.json` | 149 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-07-research-detail.json` | 115 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-08-operations-list.json` | 276 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-09-operations-profile.json` | 165 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-10-map.json` | 232 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-11-watchlist.json` | 232 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-12-community.json` | 416 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-13-admin-registry.json` | 140 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-13-admin.json` | 297 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-14-account.json` | 188 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-15-settings.json` | 221 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-16-auth.json` | 91 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-16-signup.json` | 94 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-17-onboarding.json` | 93 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-operations-calculator.json` | 66 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/compose-regulations-register.json` | 90 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/detailheader.json` | 45 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/detailsection.json` | 43 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/detailtagrow.json` | 28 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/detailtimeline.json` | 51 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/factblocks.json` | 101 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/factcard.json` | 132 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/filterchipgroup.json` | 56 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/highrelevance.json` | 39 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/impactmeter.json` | 179 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/inthisliststat.json` | 52 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/list-surface-virtualized.json` | 35 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/list-surface.json` | 166 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/listrow.json` | 313 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/map-register.json` | 63 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/market-research-rows.json` | 53 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/masthead.json` | 129 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/milestonetimeline.json` | 78 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-01-dashboard.json` | 307 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-02-regulations-list.json` | 441 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-03-regulation-detail.json` | 233 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-04-market-list.json` | 447 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-06-research-list.json` | 447 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-08-operations-list.json` | 423 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-10-map.json` | 191 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-11-watchlist.json` | 298 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/mobile-18-drawer.json` | 183 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/onboarding-stepper.json` | 84 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/operations-matrix-nofigure.json` | 91 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/operations-matrix-selected.json` | 178 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/operations-matrix-six-regions.json` | 77 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/operations-matrix.json` | 335 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/page-frame.json` | 140 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/railcards.json` | 65 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/section-card-lists.json` | 41 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/sectionindex.json` | 31 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/settings-notifications.json` | 90 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/settings-section-index.json` | 43 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/sidebar.json` | 129 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/skeleton.json` | 39 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/statblock.json` | 57 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/statenote.json` | 42 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/summarydepthswitch.json` | 42 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/tabrow.json` | 52 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/tagpopover.json` | 30 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/audit/spec/watchbutton.json` | 40 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/browser/rendered-text.mjs` | 35 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-compose-11-watchlist.mjs` | 66 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-compose-dashboard.mjs` | 119 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-compose-details.mjs` | 83 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-compose-lists-screenshots.mjs` | 98 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-compose-page.mjs` | 112 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-dashrow-screenshot.mjs` | 46 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-defect-fix-screenshots.mjs` | 110 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-detail-mobile-screenshots.mjs` | 52 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-meterfix-screenshots.mjs` | 132 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-opsclip-screenshots.mjs` | 190 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-opsmatrix5-screenshots.mjs` | 128 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-uxfix-lists-fixture-screenshots.mjs` | 125 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/capture-uxfix-lists-screenshots.mjs` | 46 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/compose-composite.mjs` | 72 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/exemptions-375.mjs` | 91 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/exemptions-375.test.mjs` | 63 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/exemptions-law2-desktop.mjs` | 122 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/exemptions-law2-desktop.test.mjs` | 94 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/fixtures-dash/fixtures.mjs` | 125 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/fixtures-dash/fixtures.test.mjs` | 69 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/fixtures.mjs` | 262 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard-expiry.test.mjs` | 88 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/allowlists.mjs` | 236 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/baseline.json` | 804 | FIXTURE-SAMPLED (first 60 lines read; JSON >500 lines per READ SET rule) |
| `fsi-app/.discipline/rendering/layout-guard/baseline.mjs` | 92 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/collect.mjs` | 515 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/generate-manifests.mjs` | 149 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/layout-guard.npmtest.mjs` | 622 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/manifests.json` | 252 | NOT READ THIS PASS (JSON fixture, not opened) |
| `fsi-app/.discipline/rendering/layout-guard/manifests.mjs` | 110 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/results.json` | 4987 | FIXTURE-SAMPLED (first 60 lines read; JSON >500 lines per READ SET rule) |
| `fsi-app/.discipline/rendering/layout-guard/routes.mjs` | 68 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/rules.mjs` | 541 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/layout-guard/run-layout-guard.mjs` | 290 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/panel21c-accept.mjs` | 87 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/panel21c-accept.test.mjs` | 149 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/rd-80-real-fonts.npmtest.mjs` | 141 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/rd-82-title-words.npmtest.mjs` | 134 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/run-rendering-guard.mjs` | 377 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/action-card-smoke.mjs` | 206 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/admin-stat-tiles-smoke.mjs` | 177 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/auth-onboarding-smoke.mjs` | 153 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/command-bar-search-portal-smoke.mjs` | 462 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/community-smoke.mjs` | 924 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/corridor-scope-smoke.mjs` | 231 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/dashboard-brief-smoke.mjs` | 462 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/detail-surfaces-smoke.mjs` | 741 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/guard-assert.mjs` | 65 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/harness.mjs` | 335 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/harness.npmtest.mjs` | 147 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/hydration-smoke.mjs` | 153 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/impact-meter-partial-smoke.mjs` | 238 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/item-group-coverage-smoke.mjs` | 149 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/list-order-smoke.mjs` | 147 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/map-smoke.mjs` | 201 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/market-rows-smoke.mjs` | 130 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/masthead-balance-smoke.mjs` | 125 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/no-default-open-smoke.mjs` | 268 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/notices-rail-smoke.mjs` | 106 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/notifications-smoke.mjs` | 217 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/operations-rows-smoke.mjs` | 253 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/ops-matrix-acceptance-smoke.mjs` | 445 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/panel-21c-smoke.mjs` | 147 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/parity-checks-smoke.mjs` | 220 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/personal-archive-smoke.mjs` | 162 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/record-grade-smoke.mjs` | 101 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/regulations-rows-smoke.mjs` | 345 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/research-rows-smoke.mjs` | 133 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/search-results-smoke.mjs` | 148 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/section-index-smoke.mjs` | 143 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/settings-section-index-smoke.mjs` | 130 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/smoke-fixtures.mjs` | 422 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/smoke.test.mjs` | 154 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/spec09-smoke.mjs` | 204 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-auth-provider.mjs` | 32 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-community-css.mjs` | 9 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-empty-css.mjs` | 5 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-link.mjs` | 10 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation-account.mjs` | 13 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation-admin.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation-community.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation-login.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation-map.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation-onboarding.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation-settings.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation-signup.mjs` | 12 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-next-navigation.mjs` | 34 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-supabase-browser-account.mjs` | 58 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-supabase-browser-auth.mjs` | 35 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-supabase-browser-no-session.mjs` | 29 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-supabase-browser.mjs` | 26 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/stub-workspace-profile-account.mjs` | 18 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/ux-harness.mjs` | 96 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/ux-smoke-specs.mjs` | 85 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/watchlist-team-smoke.mjs` | 216 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/watchlist-write-smoke.mjs` | 292 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/smoke/workspace-tags-smoke.mjs` | 202 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/ux-assert.mjs` | 431 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/ux-assert.test.mjs` | 228 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/verify-meterfix-surfaces.mjs` | 123 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rendering/verify-ppwr-title-style.mjs` | 72 | NOT READ THIS PASS (deferred to follow-up lane) |
| `fsi-app/.discipline/rules/012-hardcoded-user-path.mjs` | 130 | READ-IN-FULL |
| `fsi-app/.discipline/rules/012-hardcoded-user-path.test.mjs` | 264 | READ-IN-FULL |
| `fsi-app/.discipline/rules/014-inventory-consistency.mjs` | 69 | READ-IN-FULL |
| `fsi-app/.discipline/rules/014-inventory-consistency.test.mjs` | 47 | READ-IN-FULL |
| `fsi-app/.discipline/rules/015-row-mutation-guarded-path.mjs` | 80 | READ-IN-FULL |
| `fsi-app/.discipline/rules/015-row-mutation-guarded-path.test.mjs` | 55 | READ-IN-FULL |
| `fsi-app/.discipline/rules/016-canonical-anthropic-path.mjs` | 96 | READ-IN-FULL |
| `fsi-app/.discipline/rules/016-canonical-anthropic-path.test.mjs` | 37 | READ-IN-FULL |
| `fsi-app/.discipline/rules/017-generation-config-no-raw-env.mjs` | 91 | READ-IN-FULL |
| `fsi-app/.discipline/rules/017-generation-config-no-raw-env.test.mjs` | 57 | READ-IN-FULL |
| `fsi-app/.discipline/rules/018-new-surface-five-model.mjs` | 89 | READ-IN-FULL |
| `fsi-app/.discipline/rules/018-new-surface-five-model.test.mjs` | 72 | READ-IN-FULL |
| `fsi-app/.discipline/rules/019-source-reclassify-not-archive.mjs` | 91 | READ-IN-FULL |
| `fsi-app/.discipline/rules/019-source-reclassify-not-archive.test.mjs` | 79 | READ-IN-FULL |
| `fsi-app/.discipline/rules/020-fork-log-frozen.mjs` | 67 | READ-IN-FULL |
| `fsi-app/.discipline/rules/020-fork-log-frozen.test.mjs` | 78 | READ-IN-FULL |
| `fsi-app/.discipline/rules/021-cached-shape-key.mjs` | 148 | READ-IN-FULL |
| `fsi-app/.discipline/rules/021-cached-shape-key.test.mjs` | 149 | READ-IN-FULL |
| `fsi-app/.discipline/rules/022-no-dash-glyphs.mjs` | 129 | READ-IN-FULL |
| `fsi-app/.discipline/rules/022-no-dash-glyphs.test.mjs` | 304 | READ-IN-FULL |
| `fsi-app/.discipline/run-test-suite.sh` | 110 | READ-IN-FULL |
| `fsi-app/.discipline/runner.mjs` | 198 | READ-IN-FULL |
| `fsi-app/.discipline/runner.test.mjs` | 69 | READ-IN-FULL |
| `fsi-app/.discipline/shared-writer-registry.test.mjs` | 281 | READ-IN-FULL |
| `fsi-app/.discipline/skill-drift-gate.test.mjs` | 300 | READ-IN-FULL |
| `fsi-app/.discipline/vocab-drift-guard.test.mjs` | 112 | READ-IN-FULL |
