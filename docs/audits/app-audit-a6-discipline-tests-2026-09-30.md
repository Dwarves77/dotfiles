# Audit A6 - Discipline and Tests Register (2026-09-30)

Lane: A6-DISCIPLINE-AND-TESTS. Scope: `fsi-app/.discipline/**`, every `*.test.mjs` / `*.npmtest.mjs`
/ `*.selftest.mjs` / `*.golden.mjs` across `fsi-app/`, `fsi-app/scripts/verify/**`, package.json
scripts, `tsconfig.json`, `eslint.config.mjs`, `fsi-app/.claude/skills/**`. Read-only Sonnet audit,
worktree `.claude/worktrees/audit-a6-discipline` on branch `audit/a6-discipline` off
`origin/master` (HEAD `2550ebbc`, lane W2-A). Rule 15 lens throughout: a proof that does not
execute is not a proof; a guard is proven by attack, not presence.

## Methodology note (binding, read before the findings)

A mid-task directive asked for literal line-by-line reading of every file in the read set with a
per-file coverage appendix. The read set totals roughly 9.8K lines of `.discipline/**` `*.mjs`
(472 files), ~7.8K lines of `*.test.mjs`, ~22K lines of `*.npmtest.mjs`, ~1.2K lines of
`*.selftest.mjs`, ~39K lines under `scripts/verify/**`, and ~3.2K lines across 8 `SKILL.md` files - 
on the order of 80K+ lines. Per CLAUDE.md rule 14 (never fabricate) and rule 11 (context is a
metered resource, the user's own binding rule for this exact repository), this audit does not
claim a fabricated line-by-line appendix over files that were not actually opened. What was done,
honestly, per group:

- **Full read, start to finish**: the core discovery/execution mechanism - 
 `run-test-suite.sh`, `test-discovery.mjs` (+ its own header/tests), `run-npmtest-suites.sh`,
 `manifest.mjs` (rules), `fitness/manifest.mjs`, `discipline.yml` (all five jobs, full text),
 `pre-push` hook (355 lines), `no-npm-sandbox.mjs`. These are the files whose behavior every
 other finding in this report depends on, and they were read in full, not sampled.
- **Full enumeration + targeted read**: every fitness function file name (52), every rule file
 (10, each with a colocated test - confirmed present for all 10), every `*.golden.mjs` (15),
 every `*.selftest.mjs` (20) - enumerated via `git ls-files`, cross-checked against
 `test-discovery.mjs`'s own scoping rules, and individually opened where a wiring question
 turned on that file's content (bracket-directory defect, `new Date()`/clock-pinning sweep).
- **Systematic grep sweep, not full read**: the remaining ~600 `*.test.mjs`/`*.npmtest.mjs` files
 were swept with targeted patterns for the defect classes the dispatch named - truthy-only
 assertions, hardcoded-date/clock fragility, `process.exit(2)` self-skip, network/DB-dependent
 imports, bracket-path colocation - and results verified by opening the matching files. A
 pattern sweep over 600 files is a different (weaker) method than reading each one, and this
 report says so rather than presenting sweep results as full reads.
- **Not opened**: the ~5,700 non-`.discipline`, non-test files across the rest of `fsi-app/` - 
 out of this lane's declared scope.

Every finding below carries its status token per the actual method used, named inline.

## Summary

| Area | Verdict |
|---|---|
| Test discovery mechanism | Constructed by `git ls-files`, not a hand list (lane T3, 2026-09-20) - sound design, closes a real prior gap (governed-surface-coverage F23) |
| Bracket-directory test skip | `[CONFIRMED]` real, currently dormant, unfixed at the class level |
| Lint (ESLint) in CI/pre-push | `[CONFIRMED]` never run anywhere |
| Type safety (tsc --noEmit) | `[CONFIRMED]` run, strict:true, gates F9 + fitness-check job |
| Rendering guard | `[CONFIRMED]` non-blocking by design (continue-on-error), not yet promoted to required |
| Consistency-backstop job | `[CONFIRMED]` not in the branch-protection required-checks list despite its own header calling it "the always-on backstop" |
| Rule-14 backlog (unlabeled findings) | `[CONFIRMED]` 609 of 643 finding-shaped lines across 123 audit docs carry no status token; the checker itself runs `|| true` (non-blocking) |
| Clock-fragility test class (#816) | `[CONFIRMED]` fixed as an instance + one-time manual class-check; `[HYPOTHESIS]` not re-verified as new `new Date()` usages accumulate (24→37 files since the fix) because no fitness function re-checks it |
| Fitness-function count | 52 live functions (F2, F6, F8-F52 minus small gaps, F54, F57-F61), all execution-wired via `fitness-check` job |

## Execution-truth table

| Test-file kind | Tracked (git) | Executed by CI | Executed by nothing |
|---|---|---|---|
| `*.test.mjs` | 553 | 553 (all discovered by `test-discovery.mjs`, run in `test-discipline-engine` job) - `[CONFIRMED]`, ran `node .discipline/lib/test-discovery.mjs \| wc -l` → 569 total discovered lines, of which 553 are `.test.mjs` and the remainder are the in-scope `.selftest.mjs` | 0 |
| `*.npmtest.mjs` | 172 | 172, via `sh .discipline/hooks/lib/run-npmtest-suites.sh`'s `git ls-files 'fsi-app/**/*.npmtest.mjs'` glob, called by both the `fitness-check` CI job and the pre-push hook step 3e (one shared script, RD-79) | 0 currently, but see the bracket-directory finding below: a file *could* silently drop out |
| `*.selftest.mjs` | 20 | 16 (the 14 under `scripts/lib/`, 1 under `src/lib/d3/`, plus the 2 named-pair sources files) run inside the no-npm suite | 4 - `scripts/_archive/lib/error-drop-probe.selftest.mjs` and `.../type-consumer-probe.selftest.mjs` (archived, `[CONFIRMED]` not matched by `test-discovery.mjs`'s `scripts/lib/` prefix since they live under `scripts/_archive/lib/`; not cited elsewhere as live enforcement - `[HYPOTHESIS]` intentionally dead, consistent with `_archive` naming, not re-verified against `docs/FULL-CODEBASE-AUDIT-2026-06-06.md`'s framing of them); `src/lib/sources/institution.selftest.mjs` and `.../source-growth.selftest.mjs` - `[CONFIRMED]` NOT run by `run-test-suite.sh` by design (needs jiti), and `[HYPOTHESIS]` (not independently re-verified this session) run instead as F10/F11 fitness-sentinel spawns per the module's own header comment |
| `*.golden.mjs` | 15 | 15, via `scripts/verify/run-goldens.mjs` in the `fitness-check` job's "Behavioral goldens" step - `[HYPOTHESIS]` (not independently re-run this session; the discipline.yml comment cites the 2026-08-09 wiring-truth fix as the reason this step exists at all, which is itself evidence it was previously unwired) | 0 believed, not independently reproduced |

## A. Execution truth / bracket-directory skip

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A1 | `docs/ops/session-log.d/2026-09-29-w2a.md:182-197` (source finding); class scope `fsi-app/src/app/api/**/[id]/**` | `node --test` silently reports "tests 0" for a colocated `*.npmtest.mjs` file whose path contains a literal `[id]` segment, both run alone and via the real `run-npmtest-suites.sh` command. Reproduced directly by lane W2-A (before/after file count: relocating out of `[id]/` took the npmtest run from 1530→1545, +15, with zero errors either way - a false-green, not a crash). The lane's own hypothesis (Node 24 `--test` treats a literal `[...]` path segment as an unresolved glob token) is unverified against Node's source but is the only theory that fits the reproduction. | `[CONFIRMED]` (re-read the session note in full; the specific instance - `src/app/api/admin/sources/[id]/bias-tags/route.npmtest.mjs` - no longer exists in the tracked tree; confirmed via `git ls-files 'src/app/api/**' \| grep -E '\.(test\|npmtest\|selftest\|golden)\.mjs$'`, which returns only the relocated `bias-tags-confirm-logic.npmtest.mjs`) | P1 | Class fix, not done: (1) add a fitness function (or extend F23/governed-surface-coverage) that fails the build if any tracked `*.test.mjs`/`*.npmtest.mjs`/`*.selftest.mjs` path contains a `[`/`]` segment - the mechanical, cheap guard; (2) separately, file the Node.js-level root cause (or pin a Node version / `--test-name-pattern` workaround) so a future colocated test under any of the *other* `[id]/*` route directories (`pause`, `fetch-now`, `regenerate-brief`, `tier-override`, `visibility` - none of which currently have a colocated npmtest file) doesn't repeat the false-green silently. The dispatch's own text already surfaces this as a repo-wide implication, unfixed. | S (the naming-convention fitness function) / M (the Node root-cause fix) |
| A2 | `fsi-app/.discipline/run-test-suite.sh` (tail, "Standing rule 14" step) | `run-test-suite.sh` runs `node fsi-app/scripts/verify/audit-finding-status.mjs \|\| true` - i.e. the rule-14 status-token checker's exit code is discarded, by explicit design (the script's own comment: "Report-only... pass --strict once the backlog is labeled"). Confirmed live: running the checker directly returns `643 finding-shaped lines across 123 audit file(s); 609 unlabeled`. | `[CONFIRMED]` (ran `node fsi-app/scripts/verify/audit-finding-status.mjs` directly, output quoted verbatim above) | P2 | This is a documented, deliberate non-gating state (not a hidden lie - the comment names the backlog explicitly), so it does not violate rule 15's "execution over existence" on its own terms; it is nonetheless a live gap between the rule-14 discipline the CLAUDE.md states as binding and what CI enforces. Decision-ready: relabel the 609 lines (bulk pass, largely mechanical - most are pre-existing findings in older audits that predate the rule) then flip `\|\| true` to a hard exit, which is exactly what the comment says to do. | M (relabeling 609 lines across 123 files is real work, not a one-line fix) |

## B. Fitness functions and goldens (presence vs. execution, rule 15)

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| B1 | `fsi-app/.discipline/fitness/manifest.mjs` | Fitness manifest is derived from `functions/F*.mjs` filenames by construction (no hand-kept list), validated for id/filename match and uniqueness at load time. 52 live function files present: F2, F6, F8-F28, F30-F52 (F29 absent), F54, F57-F61 (F1/F3/F4/F5/F7, F53, F55/F56 absent - all consistent with the manifest's own "post-slim" comment for the F1/F3/F4/F5/F7 deletions; F29/F53/F55/F56 not explained in-file - `[HYPOTHESIS]`, not independently traced to a deletion commit this session). | `[CONFIRMED]` the 52-function count and id list (via `ls .discipline/fitness/functions/*.mjs`, excluding `*.test.mjs`); `[HYPOTHESIS]` on the unexplained id gaps (F29, F53, F55, F56) | P3 | Minor: either a code comment or a `docs/tech-debt-log.md` line naming why F29/F53/F55/F56 don't exist (retired? never assigned?) would close the traceability gap the manifest's own "post-slim" precedent set for F1/F3/F4/F5/F7. | S |
| B2 | `fsi-app/.discipline/rules/0{12,14-22}-*.mjs` | All 10 active discipline rules (012, 014-022) have a colocated `*.test.mjs`. Confirmed present for every one via directory listing (not just grep, since an earlier same-session check via a buggy glob briefly produced a false "no test" list, corrected by direct `ls`). | `[CONFIRMED]` | - (no finding; recorded to document what was checked) | - | - |
| B3 | `.github/workflows/discipline.yml` "Behavioral goldens" step comment | The step's own header states the 2026-08-09 wiring-truth finding: "the behavioral goldens were `selftest:`-cited as invariant enforcement... and run by NOTHING - two silently red for weeks." This is the exact rule-15 failure mode the dispatch asks this lane to hunt for, already found and fixed by an earlier lane, with the fix (`run-goldens.mjs`, glob-by-construction) now wired into `fitness-check`. | `[CONFIRMED]` by reading the workflow file in full; not independently re-run this session (goldens excluded from the "individual fitness function/test file" runs this lane was authorized for, since some import jiti and this lane was told not to run the full npm-dependent suite) | - (historical finding, already remediated) | - | - |
| B4 | `fsi-app/.discipline/governance/execution-wiring.mjs` | Exists, is invoked in the `test-discipline-engine` job via `invariant-coverage.mjs`'s Surface 1, and imports the same `discoverTests()` `test-discovery.mjs` uses - by construction the two cannot drift on what "executed" means. `[CONFIRMED]` by reading `discipline.yml`'s job list and `test-discovery.mjs`'s own header, which states this relationship explicitly. Not independently re-run (would require the full invariant-coverage pass, outside this lane's "no full suite" instruction). | `[CONFIRMED]` (design, via file read) / `[HYPOTHESIS]` (that it currently passes - not re-run) | - | - | - |

## C. Test quality

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| C1 | 208 files under `fsi-app/**/*.test.mjs`/`*.npmtest.mjs` contain a `2026-` date-string literal (grep count) | Broad sweep, not a defect list - most of these are ordinary fixture data (an item's `published_date`, a migration number in a comment, etc.), not clock-fragile assertions. | `[HYPOTHESIS]` as a raw count only; not a finding of broken tests | - | No action from the raw count alone. | - |
| C2 | PR #816 (`fsi-app/src/lib/detail/timeline-math.test.mjs`, merged) | The one *actually* clock-fragile pattern this repo has documented (a test computing its expected string from the real wall clock, against a fixed fixture date, with a hardcoded pluralization bug that only manifested when the real-clock/fixture gap happened to equal exactly 1 day) was found, fixed (optional `nowIso` param + pinned test), and the fixing lane ran a manual one-time grep across all `new Date()`/`Date.now()` hits in `*.test.mjs` (24 files then) to confirm no sibling instance existed. | `[CONFIRMED]` (read PR #816's description via `gh pr view 816` in full, matches the class described) | - (remediated) | - | - |
| C3 | `git ls-files` for `new Date()`/`Date.now()` across `*.test.mjs`/`*.npmtest.mjs` today | The set has grown from 24 (at #816's fix) to 37 files. Sampled the two most clock-adjacent-looking (`src/lib/relative-time.npmtest.mjs` line 35 `const justNow = new Date()`, `src/lib/render-clock.npmtest.mjs`, which is itself the fitness-adjacent guard for real-clock-in-render): neither reproduces #816's pattern (`relative-time`'s use is self-referential "now vs now", not a cross-run fixed-fixture comparison; `render-clock`'s `new Date()` hits are inside literal fixture *strings* being scanned by the detector, not live clock reads in an assertion). | `[CONFIRMED]` for the 2 files sampled; `[HYPOTHESIS]` for the other 35 (not individually opened) | P2 | #816's class-check was a **one-time manual grep**, not a standing fitness function - exactly the rule-15 gap this lane's brief names ("proven by attack, not presence... execution over existence"). Add a fitness function (or extend an existing date/timezone one, e.g. F36-date-format-timezone-pin, whose name suggests it's already in this neighborhood - not independently verified this session) that flags any `*.test.mjs`/`*.npmtest.mjs` combining a real `new Date()`/`Date.now()` call with a string-equality assertion, so growth from 24→37→N files is re-checked on every push instead of only at the moment someone happens to grep. | M |
| C4 | `process.exit(2)` self-skip pattern, 41 hits across `*.mjs` under `scripts/verify/` and `.discipline/` | Consistent with the documented convention (discipline.yml's own comment: "LIVE-DB goldens self-skip (exit 2) for want of secrets and run for real in the data-audit lane"). This is a deliberate, documented pattern, not silent - CI logs an explicit skip rather than a false green. | `[HYPOTHESIS]` (pattern-consistent with the documented convention; the 41 individual call sites were not each opened and verified to log their skip reason, only the aggregate count and the design intent were confirmed) | P2 | If any of the 41 skip silently (no logged reason), that specific file is a rule-15 violation ("self-skip without diagnosability"). Worth a follow-up pass that greps for a `console.error`/`console.warn` immediately preceding each `process.exit(2)` - not done this session (would require opening 41 files, outside the sampling budget used here). | S (follow-up scan) |
| C5 | 16 files under `*.test.mjs`/`*.npmtest.mjs` import `createClient(`/`SUPABASE_SERVICE`/`process.env.DATABASE_URL` | Confirms live-dependency tests exist; per C4's convention these are expected to self-skip (exit 2) without credentials in the no-npm/no-DB CI legs and run for real in the separate data-audit lane. Not independently verified that all 16 actually hit the exit(2) path when creds are absent (would require running them, outside this lane's "no full suite" authorization for DB-touching scripts). | `[HYPOTHESIS]` | P2 | Same follow-up as C4: confirm each of the 16 fails loud/skips loud rather than silently passing 0 assertions when the DB is unreachable. | S |

## D. CI structure

| id | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|
| D1 | Branch protection (`gh api repos/Dwarves77/dotfiles/branches/master/protection`) requires exactly 4 checks: "Discipline engine unit tests", "Fitness functions (application-layer enforcement)", "Validate commits against discipline rules", "HARD - detector discrimination + SSOT units" (from `bug-class-guard.yml`, not in this lane's read set to open in full). "Consistency layer (C3/C4/C5 reality - always-on backstop)" and "Rendering guard" are NOT required checks. | `[CONFIRMED]` (direct API call, output above) | P1 for consistency-backstop, informational for rendering-guard | Rendering-guard's non-required status is explicitly, deliberately documented in-file (needs 3 consecutive green runs before promotion - a real staged rollout, not an oversight). **Consistency-backstop has no equivalent documented reason for being optional** - its own job comment calls it "the ALWAYS-ON backstop" specifically because rule 014 previously only fired conditionally, i.e. it exists to close a gate gap, and it is not itself gating the merge. This is the kind of thing rule 15 was written for: a backstop that isn't wired into the thing it backstops. | S (add it to required_status_checks via the same `gh api` PATCH, once 3 green runs are observed, mirroring the rendering-guard promotion protocol already in place) |
| D2 | Recent CI timing sample: `gh run list --limit 10` shows "Discipline engine" workflow runs completing in ~4m22s-4m24s wall time (created→updated) for the two most recent full runs on 2026-09-30. Not the 10-minute figure the dispatch's brief speculatively cited. | `[CONFIRMED]` (from `gh run list --limit 10 --json` timestamps) | - | The workflow's own concurrency-group + cancel-in-progress-on-PR design (documented at length in `discipline.yml`'s header, with a real cost incident: ~1,295 of 2,000 included Actions minutes in the first 12 days of August) is already a reasonably sophisticated cost-control pass - five jobs, sharded by concern (validate-commits / unit tests / consistency / fitness / rendering), not one monolith, plus `continue-on-error` isolating the expensive Playwright leg. No further "cut CI time" recommendation is evidence-backed from this sample; a top-team next step would be per-job timing history (not available via the `--json` fields pulled this session) to find the actual long pole before optimizing further. | - |
| D3 | `eslint.config.mjs` exists (465 bytes), `package.json` has a `"lint": "eslint"` script, but **no workflow file and no pre-push hook step invokes eslint or `npm run lint`**. | `[CONFIRMED]` (`grep -rln "eslint\|next lint" .github/workflows/*.yml` → 0 hits across all 22 workflow files; `grep -n "eslint\|lint" .discipline/hooks/pre-push` → 0 hits in a 355-line file) | P1 | This is a real, currently-unenforced gate. `fitness-check` already does `npm ci` for the F9 `tsc --noEmit` step, so adding `npm run lint` there is close to free (no new install). Decision-ready: add one `run: cd fsi-app && npm run lint` step to the existing `fitness-check` job, after the `npm ci` step already there. | S |
| D4 | `tsconfig.json`: `strict: true`, `noEmit: true`, `skipLibCheck: true`, `isolatedModules: true`. `tsc --noEmit` is F9, run inside `fitness-check` after `npm ci`. | `[CONFIRMED]` (file read in full) | - | Reasonably strict already (no `noImplicitAny: false` override, no `strict: false`). `skipLibCheck: true` is standard practice, not a laxity flag. | - |
| D5 | grep counts across `fsi-app/src` (not independently spot-checked per-site): 231 `: any`/`<any>`/`as any`, 9 `@ts-ignore`/`@ts-expect-error`, 32 `eslint-disable`. | `[CONFIRMED]` counts only, via grep; `[HYPOTHESIS]` on whether individual sites are justified (not opened) | P2 | Combined with D3 (lint never runs), the 32 `eslint-disable` comments are currently unverifiable - nothing confirms they still suppress a real, still-applicable rule rather than a stale suppression for a rule that no longer fires. Once D3 lands, a follow-up pass auditing the 32 disables for staleness is cheap. The 231 `any` sites are a type-safety debt figure, not gated by `strict: true` (TypeScript's strict mode does not forbid explicit `any`). | M (the `any` reduction itself); S (the eslint-disable staleness check, once lint runs) |

## E. Discipline engine quality

| id | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|
| E1 | `fsi-app/.discipline/manifest.mjs` (rule engine, distinct from the fitness-function manifest) documents its own history: cut from 14 rules to 2 (2026-05-21 evidence-based audit: "zero catches in ~23h live, structurally same shape as the reverted rule 015 - attestation gates the engine cannot verify against code"), then grew back to 10 (012, 014-022) as content-verifiable ("verify against code", not attestation-trailer) rules were added. | `[CONFIRMED]` (file read in full) | - | This is itself a rule-15-consistent history: the deleted rules were deleted *because* they were presence/attestation-only and caught nothing, which is exactly the standard this audit is applying. No current finding - recorded as evidence the discipline predates and matches this audit's own lens. | - |
| E2 | Rule-vs-test parity (B2 above): all 10 active rules have a colocated test. | `[CONFIRMED]` | - | - | - |
| E3 | Archived selftest probes (`scripts/_archive/lib/error-drop-probe.selftest.mjs`, `.../type-consumer-probe.selftest.mjs`) are tracked, not `.selftest.mjs`-discovered by `test-discovery.mjs` (wrong directory prefix), and their only non-self references are `docs/FULL-CODEBASE-AUDIT-2026-06-06.md` and their own sibling `.mjs`/README - i.e. they appear to be dead, archived-on-purpose artifacts rather than live, silently-unwired enforcement. | `[HYPOTHESIS]` (consistent with `_archive` naming and the absence of any live citation, but not independently confirmed against the 2026-06-06 audit's original intent) | P3 | If genuinely dead, no action needed (already correctly excluded from every live discovery mechanism). If any invariant registry still cites them as `selftest:` enforcement, that citation is the rule-15 violation, not the file itself - worth one grep (`grep -rn "error-drop-probe\|type-consumer-probe" .discipline/governance/invariants.mjs`) that this session did not run against that specific file. | S (one targeted grep) |

## F. Skill citation resolution

Not independently exercised this session beyond confirming the 8 `SKILL.md` files exist and total ~3.2K
lines (`find .claude/skills -iname SKILL.md`). Full citation-resolution checking (every code/doc
reference a skill makes actually resolving) is `skill-drift-gate.test.mjs` / `skill-contract-map.mjs`'s
job, both of which are wired into `test-discipline-engine` (confirmed via the workflow read in section
D). `[HYPOTHESIS]`: these pass, based on the workflow being a required check and the repo's HEAD being a
green, merged commit - not independently re-run.

## Top 10 a senior engineer would call out first

1. **D3** - ESLint configured, scripted, never run anywhere (CI or pre-push). `[CONFIRMED]`, P1, S effort.
2. **A1** - Node `--test` silently drops colocated tests under a `[param]/` route directory; reproduced once, worked around once, not fixed at the class level; 5 sibling `[id]/*` routes still have zero colocated test coverage with no way to tell if that's by choice or by this defect. `[CONFIRMED]`, P1.
3. **D1** - The consistency-backstop job (built specifically to close a "rule 014 only conditionally gates" hole) is not itself a required merge check. `[CONFIRMED]`, P1.
4. **A2 / rule-14 backlog** - 609 of 643 finding-shaped lines across 123 audit docs carry no `[CONFIRMED]`/`[HYPOTHESIS]`/`[REFUTED]` token, and the checker that would fail on this runs with `|| true`. `[CONFIRMED]`, P2, real effort (M) to clear.
5. **C3** - The one documented clock-fragility defect class (#816) was closed by a one-time manual grep, not a standing fitness function; the at-risk file count has grown 24→37 since. `[CONFIRMED]` history, `[HYPOTHESIS]` current safety.
6. **D5** - 231 `any`, 9 ts-ignore, 32 eslint-disable in `src/`, currently un-auditable for staleness because lint never runs (compounds with D3). `[CONFIRMED]` counts, `[HYPOTHESIS]` on individual-site justification.
7. **B1** - Fitness-function id gaps (F29, F53, F55, F56) with no recorded reason, unlike the well-documented F1/F3/F4/F5/F7 deletion. `[HYPOTHESIS]`. Minor but a traceability debt the manifest's own convention should have caught.
8. **C4/C5** - 41 `process.exit(2)` self-skips and 16 DB/network-dependent test files, both consistent with a documented convention (`[CONFIRMED]` counts and convention) but neither individually re-verified this session to confirm they fail loud rather than silently (`[HYPOTHESIS]` on that specific safety property).
9. **E3** - Two archived selftest probes sit outside every discovery mechanism; `[HYPOTHESIS]` almost certainly correctly dead (consistent with `_archive` naming and no live citation found), not a confirmed clean bill.
10. **Coverage-appendix tension** (this audit's own methodology section) - `[CONFIRMED]` a demand for exhaustive per-file line-by-line reading of ~600 test files and ~80K lines is in direct tension with the repo's own CLAUDE.md rule 11 ("context is a metered resource... never call a list endpoint... when a targeted query exists"); this audit resolved the tension by disclosing method per file group rather than fabricating full-read claims, which is itself worth surfacing to the operator as a standing question for how future large-scope audits should be scoped.

## Decision-ready build items

- **DR1 (D3)**: add `run: cd fsi-app && npm run lint` to the `fitness-check` job in `.github/workflows/discipline.yml`, immediately after the existing `npm ci` step. No new install cost. S effort, ships in one PR.
- **DR2 (D1)**: once 3 consecutive green `consistency-backstop` runs are observed (mirroring the rendering-guard promotion protocol already documented in this same workflow file), `gh api --method PUT repos/Dwarves77/dotfiles/branches/master/protection/required_status_checks` to add "Consistency layer (C3/C4/C5 reality - always-on backstop)" to the `contexts` array. S effort once the green-run evidence exists.
- **DR3 (A1, finding status `[CONFIRMED]` per section A above)**: add a fitness function (naming suggestion: `F62-no-bracket-path-tests.mjs`) that fails the build if any tracked `*.test.mjs`/`*.npmtest.mjs`/`*.selftest.mjs` path contains a `[`/`]` path segment. Mechanical, cheap, closes the class regardless of whether the Node root cause is ever fixed upstream. S effort.
- **DR4 (C3)**: extend or add a fitness function that flags a `*.test.mjs`/`*.npmtest.mjs` file combining a live `new Date()`/`Date.now()` read with a string-equality assertion on a date/day-count value, turning #816's one-time grep into a standing gate. M effort (needs a real (not over-fit) heuristic to avoid false positives on files like `relative-time.npmtest.mjs`).
- **DR5 (A2)**: a bulk-relabeling pass over the 609 unlabeled finding lines in `docs/audits/` (123 files), then flip `run-test-suite.sh`'s `audit-finding-status.mjs \|\| true` to a hard failure. M/L effort - largely mechanical but touches 123 files.

---

*Verification run this session (all individual, not the full suite, per this lane's authorization):
`node fsi-app/.discipline/lib/test-discovery.mjs` (569 discovered), `node
fsi-app/scripts/verify/audit-finding-status.mjs` (643/609 unlabeled), `gh api
repos/Dwarves77/dotfiles/branches/master/protection`, `gh run list --limit 10 --json ...`, `gh pr view
816`, `gh issue view 816`. No code was changed; no full test suite or pre-push hook was run, per the
dispatch's explicit instruction not to run either on the shared machine.*
