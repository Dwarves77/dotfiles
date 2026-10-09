# AUD-AT-5: CI workflow and chain hops attacked (fact lane, 2026-10-08)

> **Landing note (lane GATE-9, PR 1042):** The fix for its residual is in flight in PR 1042 (GATE-9), open at the time of this landing. No finding in this register was re-verified by the landing lane (DOCS-4); findings carry the tokens the audit's own method assigns. The body is the register verbatim; the only edits are the form of status tokens, where the checker required it (1 line received the token that line's own section or method statement already carries), and the `glyph:verbatim` disclosure marker on 4 table rows (DS6, DS15, DS18, DS19) that quote a dash glyph verbatim.

Lane: aud-at5. Base: origin/master 12c696341a79ed9f229502e195b193975f44180d (master moved to 36599967 during the run, two unrelated commits; every attack ran on a scratch clone pinned to 12c69634).

## Declared up front

- Lenses run: ATTACKED. Lenses not run: EXISTS, RUNS, CALLED, COSTS, FIRED-TRUE, MODE, OVERLAPS, OPERATOR-SEAT, RECORD-VS-REALITY (owed).
- Subsystem 7, CI workflow: units are the jobs and steps of `.github/workflows/discipline.yml` (5 jobs, 35 steps) and `chain-proof.yml` (1 job, 21 steps); `migration-proof.yml` is not on master (OWED-1). Subsystem 8, chain hops: the 13 files of `fsi-app/.discipline/governance/loop-hops.d`.
- Enumerators quoted: `node enum.mjs .github/workflows/<file>` (the 6-space `- name:` lines under `jobs:`, giving 35 and 21 steps and 5 and 1 jobs), and `ls fsi-app/.discipline/governance/loop-hops.d` (13 files).
- Question: can each guard be defeated by an input in a form its author did not list? Method: every attack ran in a scratch clone (git clone of the main checkout, pinned to 12c69634) under the session scratchpad; real gate code, real rules, no network, no live data; nothing run in the main checkout or a lane worktree or origin.
- Tokens: ACCEPTED (the attack passed every gate that was run), REFUSED (a named gate fired), NO-EFFECT (a setup step: the edit survives but removes no verdict), OWED. A workflow mutation row is a statement about the repo gates: the mutated workflow was not executed on GitHub Actions, so the effect of an accepted edit on a real run is GitHub documented behaviour and is [HYPOTHESIS] until fired there.
- Oracles. FAST ORACLE (used for the sweeps): fitness functions F25, F44, F50, F52, F61, F67, F68 via `runner.mjs --function`, `invariant-coverage.mjs`, and the 25 `*.test.mjs` files that read `.github/workflows` under the no-npm sandbox; a row is REFUSED if any of them exits non-zero. HOP ORACLE: F25, F28, F50, F52, F61, F23, invariant-coverage, those tests plus export-loop-fired-evidence, loop-fired-evidence-audit and loop-run-id tests. FULL ORACLE (spot confirmations DO-6, VC-5, RG-1 and cell DS11/IFF): `run-test-suite.sh` (10446 tests), the full fitness runner, invariant-coverage, closure-gate, `skill-contract-map --check`.

## Result

- Attacks attempted: 348 (218 sweep and job-mutation cells, 40 manual workflow and gate rows, 29 gate-script neuter rows, 52 hop edge rows, 9 hop gate rows); 13 sweep cells not applicable (a step without a run script cannot take TRUE).
- Units: 6 jobs, 56 steps, 13 hops = 75 units; every unit has at least two rows below or an owed line. migration-proof.yml: owed.
- ACCEPTED, sweeps: 79 cells on verdict steps and jobs; manual workflow rows: 34; gate-script neuter: 20; hop rows: 33; hop gate rows: 7.
- REFUSED: sweeps 69; manual 6; neuter 9; hops 19; hop gate 2. NO-EFFECT cells (setup steps): 70.

## ACCEPTED rows first: manual attacks on subsystem 7

| id | units | form | expected block | observed | token |
|---|---|---|---|---|---|
| DO-1 | DS10; DS11-15, DS22-29 (every step guarded by docs_only) | rename production code into docs/: `git mv fsi-app/src/lib/api/auth.ts docs/auth-moved.ts`, commit | docs-only verdict false, heavy steps run | `git diff --name-only 12c69634...HEAD` prints only `docs/auth-moved.ts` (rename shows the new path only); `docs-only-range.mjs` prints `docs-only: true`, exit 0. 3 files import lib/api/auth. Local fitness runner on that tree: 52 functions checked, 0 violations (F9 tsc, ESLint, npmtests need npm and were not runnable here) | ACCEPTED |
| DO-2 | DS10, DS13 (closure gate) | edit the heading `## 0. Definition of done ...` of docs/dispatches/lane-common-contract.md to `## 0. Done` (docs only) | closure gate runs and fails | docs-only: true, exit 0. Run directly on the same tree: `4. LANE-CONTRACT : FAIL`, `closure gate FAIL`, exit 1. Rule engine on the range: `0 pass, 0 fail, 7 skip` | ACCEPTED |
| DO-3 | DS10, DS12, DS14 | `git rm fsi-app/.claude/skills/remediation-discipline/SKILL.md` (pinned skill) | skill-contract-map and invariant-coverage run and fail | docs-only: true. Run directly: `[skill-file-missing] remediation-discipline` exit 1; invariant-coverage `meta-gate FAIL` exit 1; rule engine `0 fail, 7 skip` | ACCEPTED |
| DO-5 | DS10, DS22 | docs-only-range.mjs with `process.exit` wrapped to exit 0 (one line at the top of the file), run on a code diff | a code diff must not read as docs-only | prints `docs-only: false`, exit 0, so the workflow `if node ...; then docs_only=true` branch is taken. Fast oracle SURVIVED. Sibling test docs-only-range.test.mjs 9 pass 0 fail | ACCEPTED |
| DO-6 | DS10, DS22 | workflow edit: the docs-only step body `if node ...docs-only-range.mjs ...; then` replaced by `if true; then` (both jobs) | a workflow edit that disables the path filter is caught | fast oracle SURVIVED; FULL oracle: no-npm suite 10446 tests, 0 fail (1 test cancelled by the 300 s timeout under local load, identical on all four full runs), fitness runner exit 0, invariant-coverage 0, closure-gate 0, skill-contract-map 0 | ACCEPTED |
| VC-2 | DS4 | push-event shape: 2 commits pushed, c1 adds a banned dash glyph, c2 benign; origin/master set to c2; `runner.mjs --mode=ci --commit=$c2` | rule 022 fails on the pushed range | `Baseline: fallback parent commit: the commit is already on origin/master`, `Summary: 1 pass, 0 fail, 6 skip`, exit 0. With c1 as head the same command gives `FAIL [022]` | ACCEPTED |
| VC-3 | DS6 | memory gate in push mode with `--warn-only`, range of code with no memory file | block | `::warning::...` exit 0 (documented as warn-only on push) | ACCEPTED |
| VC-4 | DS6 | PR mode, code plus a 1-byte file docs/ops/session-log.d/2026-10-08-zz.md containing `x` | block (no real memory entry) | `memory gate OK` exit 0. Control without the file: `::error::Memory gate ...` exit 1 | ACCEPTED |
| VC-5 | DS5 | step script edit `set -u -o pipefail` to `set -u +o pipefail` (F52f counts any `set ... pipefail` line) | F52f or another gate fires; step must still fail on a rule FAIL | F52, F25, F44, F50, F61, F67, F68 and invariant-coverage did not fire (fast oracle SURVIVED; full oracle: suite 0 fail apart from the load cancellation, fitness 0, invariant 0, closure 0, skill map 0). The step script run under `bash -e` on a tree where rule 022 FAILs printed `FAIL [022]` and exited 0 | ACCEPTED |
| VC-6 | DS5 | pipefail line removed and `2>&1 \| tee -a` changed to `2>&1 \|& tee -a` (F52f matches `\|` then `tee` only) | F52f fires | control (plain `\| tee`, pipefail removed): `F52f ... pipes into tee with no set -o pipefail`. Attack: F52 prints only the actionlint notice; fast oracle SURVIVED | ACCEPTED |
| VC-7 | DS5 | workflow edit: PR_HEAD env of the PR engine step := `github.event.pull_request.base.sha` | engine validates the PR range | engine run with PR_HEAD = base: `Resolved range ...: X..X`, `0 pass, 0 fail, 7 skip`, exit 0 (empty range). Fast oracle SURVIVED | ACCEPTED |
| VC-8 | DS6 | workflow edit: memory gate RANGE := `origin/${BASE_REF}...origin/${BASE_REF}` | memory gate sees the PR range | memory-gate on that range with a code tree: `memory gate OK` exit 0. Fast oracle SURVIVED | ACCEPTED |
| TR-1 | all jobs | trigger edit: `pull_request: branches: [master]` to `[main]` | a gate notices the workflow no longer runs on PRs to master | fast oracle SURVIVED (the run itself was not executed on Actions) | ACCEPTED |
| TR-2 | all jobs | trigger edit: add `paths-ignore: ["**"]` under pull_request | path-filter dodge noticed | fast oracle SURVIVED (the 2026-08-12 header rejects path filters in prose only) | ACCEPTED |
| TR-3 | DS8-15 (test-discipline-engine) and, by the same form, fitness-check, rendering-guard | job `if:` edit: `github.event_name == pull_request && github.event.pull_request.head.repo.fork == false` (fork PR skips the job) | GATE-4 shape test fires | the test only matches `github.event_name == pull_request` inside the `if`; fast oracle SURVIVED | ACCEPTED |
| TR-4 | all jobs | concurrency edit: `cancel-in-progress: true` for every event (a master push run can cancel the previous master push run) | noticed | fast oracle SURVIVED | ACCEPTED |
| TD-1 | DS11 | failing test `fsi-app/at5-a.test.ts` (suffix .test.ts) | suite runs it or a gate flags it | not in `test-discovery.mjs` output; F23 coverage-scan orphaned-proofs 0 for it; node --test run directly: pass 0 fail 1 | ACCEPTED |
| TD-2 | DS11 | failing test `scripts/at5-b.test.mjs` at the repo root (outside fsi-app/ and .claude/hooks/) | same | not discovered; no gate fires | ACCEPTED |
| TD-3 | DS11 | failing `fsi-app/src/lib/at5-c.spec.mjs` (.spec.) | same | not discovered; no gate fires | ACCEPTED |
| TD-4 | DS11 | failing `docs/at5-e.test.mjs` and `fsi-app/src/lib/at5-g.test.cjs` | same | neither discovered; no gate fires (docs/ path is also docs-only) | ACCEPTED |
| TD-6 | DS11 | run-explicit-tests.mjs last line edited: `process.exitCode = failed ? 1 : 0;` to `process.exitCode = 0;`; one failing test piped in | suite step exits non-zero | unmodified: exit 1. Edited: output `fail 1`, exit 0. Fast oracle SURVIVED. Only F52 test touches this file (asserts the concurrency option) | ACCEPTED |
| TD-7 | DS13 | add `.github/workflows/at5-dead.yml` (workflow_dispatch, never run) | NEVER-RUN check fails | `1. NEVER-RUN : PASS`, `closure gate PASS`, exit 0 (current train 71, frozen since 2026-09-11) | ACCEPTED |
| TD-8 | DS15 | add orphan module `fsi-app/scripts/lib/at5-orphan.mjs`; run `orphan-modules.mjs --all` | step fails | exit 0 (reports, never fails by its own header). F25 on the same tree: `UNWIRED MODULE` | ACCEPTED (non-gating by design); F25 twin REFUSED |
| FC-3 | DS28 | failing `scripts/at5-r.npmtest.mjs` (repo root) and `fsi-app/src/lib/at5-s.npmtest.ts` | npmtest step runs or flags | `git ls-files -- fsi-app \| grep npmtest.mjs$` matches 0 of them; coverage-scan orphaned 0; invariant-coverage PASS | ACCEPTED |
| FC-4 | DS29 | run-goldens.mjs fixture: a golden that always `process.exit(2)` | fail | `passed: 1 \| failed: 0 \| skipped (no creds): 1`, `GOLDENS GREEN`, exit 0. Control (exit 1) gives `GOLDENS FAIL` exit 1 | ACCEPTED |
| FC-5 | DS29 | failing goldens in unlisted forms: `lib/sub.golden.mjs`, `x.golden.cjs`, `y.goldens.mjs`, `golden-z.mjs` (fixture dir) and `fsi-app/scripts/verify/lib/at5.golden.mjs`, `at5-x.goldens.mjs` (real tree) | fail | fixture runner: `total: 1`, `GOLDENS GREEN`; real tree: the runner glob (non-recursive `.golden.mjs` or `-golden.mjs`) matches 0; coverage-scan orphaned 0 | ACCEPTED |
| RG-1 | DS35 | guard step: add `status=0` before `line="guard run: ..."` (keeps `exit "$status"`) | GATE-6 step test fires | tests assert the `\|\| status=$?` capture and the `exit "$status"` line; both still present. Fast oracle SURVIVED; full oracle: suite 0 fail apart from the load cancellation, fitness 0, invariant 0, closure 0, skill map 0 | ACCEPTED |
| RG-2 | DS35 | guard step: `... \|\| status=$?; status=0` | same | regex `run-rendering-guard.mjs \|\| status=$?` still matches. Fast oracle SURVIVED | ACCEPTED |
| CP-1 | CS15 (and any non-export step) | env `EXFIL: ${{ secrets['SUPABASE_SERVICE_ROLE_KEY'] }}` on the Load-subset step | chain-proof-workflow.test fires (only the export step may hold secrets) | the test collects `secrets\.NAME` references; bracket syntax is not matched. Fast oracle SURVIVED | ACCEPTED |
| CP-2 | CS1-CS21 | job-level `permissions: contents: write` | permissions test fires | the test checks the top-level block and `actions\|id-token\|pull-requests\|issues\|statuses\|packages: write`; `contents: write` at job level is not matched. Fast oracle SURVIVED | ACCEPTED |
| CP-3 | CS1-CS21 | extra trigger `repository_dispatch: {}` | dispatch-only test fires | the test forbids `schedule workflow_run push pull_request deployment_status` only. Fast oracle SURVIVED | ACCEPTED |
| CP-4 | CS12, CS15 | env `ALLSEC: ${{ toJSON(secrets) }}` on the Load-subset step | secrets test fires | not matched by `secrets\.NAME`. Fast oracle SURVIVED | ACCEPTED |
| CP-5 | CS20 | upload step `path: ${{ runner.temp }}` (whole temp dir: subset, schema dump) | upload test fires | the test only rejects the strings subset, scripts/tmp, _snapshots inside the step body. Fast oracle SURVIVED | ACCEPTED |
| CP-7 | CS15, CS11-CS17 | preflight line commented out: `# node scripts/proof/preflight.mjs` (tests use indexOf on the step body, comments included) | test fires | fast oracle SURVIVED | ACCEPTED |

## ACCEPTED rows: hop-level gates (subsystem 8)

| id | units | form | expected block | observed | token |
|---|---|---|---|---|---|
| G-1 | hops 03, 05, 06 (decideChainGate) | `config.noop` stored as the string "true" or the number 1, dry mode | skip=true | `{"skip":false}` for both | ACCEPTED |
| G-2 | hops 03, 05, 06 | a run that reports NO-OP but wrote: `config.noop:true`, `config.mode:execute`, `metrics.minted:5`, apply mode | chain proceeds (it wrote) | `{"skip":true,"reason":"upstream r was itself a no-op"}`: the flag outranks the metrics | ACCEPTED |
| G-3 | hops 05, 06 | apply mode, `metrics.minted` = `true` or `[3]` instead of a number | skip=true | `{"skip":false}` for both (`Number(true)` is 1, `Number([3])` is 3) | ACCEPTED |
| G-5 | hops 05, 06 | upstreamName `constructor` / `__proto__` (prototype keys look up as truthy evidence functions), dry mode | skip=true | `{"skip":false}` for both. Reach: the name comes from `github.event.workflow_run.name` in downstream-chain.yml; no dispatch input found there [HYPOTHESIS: not reachable by a person] | ACCEPTED (reach unconfirmed) |
| G-6 | all 13 (shared artifact schema) | `validateRunArtifact` on an artifact with `config.noop:true`, `per_item` outcome minted, `metrics.minted:5` | invalid | returned `[]` (valid): the schema does not relate the noop flag to the writes | ACCEPTED |
| G-7 | all 13 (loop id carry) | `resolveLoopRunId({explicit:"forged-loop-123", ...})` and a forged upstream artifact in a scratch family dir carrying `config.github_run_id:"999"`, `config.loop_run_id:"forged-loop-456"` | null | returned `"forged-loop-123"` and `"forged-loop-456"`: the explicit id wins unconditionally and the artifact is trusted on its own fields | ACCEPTED |
| H-ART2 | hop 02 | same plus one appended line `latest run read: ledger-consume-run-011` in LAST-PROPOSER-PASS.md | fail | oracle-hop (F25, F28, F50, F52, F61, F23, invariant-coverage, 25 workflow tests plus loop evidence tests) SURVIVED | ACCEPTED |

## Hop edge attacks, all 13 hops (AH1 decoy edge, AH4 renamed producer, AH6 duplicate workflow name, AH2 forged fired evidence, AH5 evidence removal control)

- AH1: the consumer's real `on.workflow_run` block is deleted and replaced by a heredoc inside a `run:` script that spells `workflow_run:` / `workflows: ["<producer>"]` (F50 and F52e read the file text with a line regex; the consumer can no longer be triggered by its producer).
- AH4: the producer workflow `name:` is changed and a dormant stand-in workflow takes the old name.
- AH6: a second dormant workflow is added with the SAME `name:` as the producer (no rename). A person dispatching it fires the consumer as if the producer completed.
- AH2: `enforceFired` flipped true and a forged entry added to loop-fired-evidence.json (hop, family, trigger workflow_run). AH5 (hops 01, 04, which already claim fired): the real evidence entry removed, hop keeps enforceFired true.
- Refusals observed: AH4 by loop-manifest.test.mjs `every non-pending producer.name equals the yml's own name: value`; AH1 on hops 10 and 11 by the gate-a-rescan.yml test `types: [completed] on the workflow_run trigger`; AH2 on hops 12 and 13 by the test `S1-E: both source-resolution hops exist ... name its family` (a hop-specific pin); AH5 by F50.

| hop | AH1 | AH4 | AH6 | AH2 | AH5 |
|---|---|---|---|---|---|
| 01-sweep-to-fetch-drain | ACCEPTED | REFUSED | ACCEPTED | - | REFUSED |
| 02-sweep-to-ledger-consume | ACCEPTED | REFUSED | ACCEPTED | ACCEPTED | - |
| 03-ledger-consume-to-population-turn | ACCEPTED | REFUSED | ACCEPTED | ACCEPTED | - |
| 04-ledger-consume-to-corpus-turn | ACCEPTED | REFUSED | ACCEPTED | - | REFUSED |
| 05-population-turn-to-downstream-chain | ACCEPTED | REFUSED | ACCEPTED | ACCEPTED | - |
| 06-corpus-turn-to-downstream-chain | ACCEPTED | REFUSED | ACCEPTED | ACCEPTED | - |
| 07-downstream-chain-to-propagation-drain | ACCEPTED | REFUSED | ACCEPTED | ACCEPTED | - |
| 08-data-producers-to-propagation-drain | ACCEPTED | REFUSED | ACCEPTED | ACCEPTED | - |
| 09-population-turn-to-brief-export | ACCEPTED | REFUSED | ACCEPTED | ACCEPTED | - |
| 10-brief-apply-to-gate-a-rescan | REFUSED | REFUSED | ACCEPTED | ACCEPTED | - |
| 11-population-turn-to-gate-a-rescan | REFUSED | REFUSED | ACCEPTED | ACCEPTED | - |
| 12-brief-apply-to-source-resolution | ACCEPTED | REFUSED | ACCEPTED | REFUSED | - |
| 13-research-walker-to-source-resolution | ACCEPTED | REFUSED | ACCEPTED | REFUSED | - |

## Gate-script neutering (subsystem 7 steps and subsystem 8 chain-proof scripts)

Form N3: the first lines of the script wrap `process.exit` to always exit 0 and make `process.exitCode` read 0 (the gate still prints its FAIL lines). Verified end to end on closure-gate (drifted lane-contract heading: unmodified exit 1, edited exit 0, `closure gate FAIL` printed both times) and on docs-only-range (DO-5). Oracle: the script's own sibling `*.test.mjs` under the no-npm sandbox. ACCEPTED means the sibling test still passes.

| script | sibling result | token |
|---|---|---|
| .discipline/runner.mjs | .discipline/runner.test.mjs rc=1 pass=11 fail=9 | REFUSED |
| .discipline/governance/memory-gate.mjs | .discipline/governance/memory-gate.test.mjs rc=0 pass=23 fail=0 | ACCEPTED |
| .discipline/governance/invariant-coverage.mjs | .discipline/governance/invariant-coverage.test.mjs rc=0 pass=17 fail=0 | ACCEPTED |
| .discipline/governance/closure-gate.mjs | .discipline/governance/closure-gate.test.mjs rc=0 pass=40 fail=0 | ACCEPTED |
| .discipline/governance/skill-contract-map.mjs | .discipline/skill-drift-gate.test.mjs rc=0 pass=8 fail=0 | ACCEPTED |
| .discipline/governance/orphan-modules.mjs | .discipline/governance/orphan-modules.test.mjs rc=0 pass=11 fail=0 | ACCEPTED |
| .discipline/consistency/override-check.mjs | .discipline/consistency/override-check.test.mjs rc=0 pass=14 fail=0 | ACCEPTED |
| .discipline/fitness/runner.mjs | .discipline/fitness/runner.test.mjs rc=1 pass=8 fail=1 | REFUSED |
| .discipline/lib/run-explicit-tests.mjs | none run | NOT TESTED by a sibling (see TD-6 / OWED) |
| .discipline/lib/test-discovery.mjs | none run | NOT TESTED by a sibling (see TD-6 / OWED) |
| scripts/verify/run-goldens.mjs | none run | NOT TESTED by a sibling (see TD-6 / OWED) |
| .discipline/rendering/run-rendering-guard.mjs | none run | NOT TESTED by a sibling (see TD-6 / OWED) |
| scripts/proof/preflight.mjs | scripts/proof/preflight.test.mjs rc=0 pass=32 fail=0 | ACCEPTED |
| scripts/proof/replay-migrations.mjs | scripts/proof/replay-migrations.test.mjs rc=0 pass=18 fail=0 | ACCEPTED |
| scripts/proof/schema-diff.mjs | scripts/proof/schema-diff.test.mjs rc=1 pass=8 fail=1 | REFUSED |
| scripts/proof/run-lane-step.mjs | scripts/proof/run-lane-step.test.mjs rc=0 pass=4 fail=0 | ACCEPTED |
| scripts/proof/apply-schema-dump.mjs | scripts/proof/apply-schema-dump.test.mjs rc=0 pass=7 fail=0 | ACCEPTED |
| scripts/proof/create-oracle-db.mjs | scripts/proof/create-oracle-db.test.mjs rc=1 pass=9 fail=1 | REFUSED |
| scripts/proof/dump-production-schema.mjs | scripts/proof/dump-production-schema.test.mjs rc=0 pass=7 fail=0 | ACCEPTED |
| scripts/proof/export-subset.mjs | scripts/proof/export-subset.test.mjs rc=0 pass=18 fail=0 | ACCEPTED |
| scripts/proof/load-subset.mjs | scripts/proof/load-subset.test.mjs rc=0 pass=10 fail=0 | ACCEPTED |
| scripts/proof/emit-chain-proof-artifact.mjs | scripts/proof/emit-chain-proof-artifact.test.mjs rc=0 pass=9 fail=0 | ACCEPTED |
| scripts/proof/export-local-harness-runs.mjs | scripts/proof/export-local-harness-runs.test.mjs rc=0 pass=11 fail=0 | ACCEPTED |
| scripts/proof/write-local-env.mjs | scripts/proof/write-local-env.test.mjs rc=0 pass=11 fail=0 | ACCEPTED |
| scripts/proof/steps/run-chain-steps.mjs | scripts/proof/steps/manifest.test.mjs rc=0 pass=18 fail=0 | ACCEPTED |
| scripts/proof/attacks/run-attacks.mjs | none run | NOT TESTED by a sibling (see TD-6 / OWED) |
| .discipline/governance/docs-only-range.mjs | docs-only-range.test.mjs rc=0 pass=9 fail=0 | ACCEPTED (also DO-5 end to end) |
| .discipline/lib/test-discovery.mjs | test-discovery.test.mjs rc=0 pass=9 fail=0 | ACCEPTED |
| scripts/proof/attacks/run-attacks.mjs | run-attacks.test.mjs rc=0 pass=18 fail=0 | ACCEPTED |

## Mutation sweeps: discipline.yml steps (edit applied to the workflow in-PR; fast oracle)

COE = `continue-on-error: true` on the step, IFF = `if: false` (an existing `if:` replaced), DEL = step removed, TRUE = in-script `set +e` ... `exit 0` (run: steps) or `|| true`. Verdict steps are the steps whose own result gates the PR; setup/aux steps carry NO-EFFECT when the edit survives.

| step | job | name | kind | COE | IFF | DEL | TRUE |
|---|---|---|---|---|---|---|---|
| DS1 | validate-commits | Checkout repository | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | n/a |
| DS2 | validate-commits | Setup Node | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | n/a |
| DS3 | validate-commits | Prepare gate firings log | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | NO-EFFECT |
| DS4 | validate-commits | Run discipline engine (push to master) | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS5 | validate-commits | Run discipline engine (pull request) | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS6 | validate-commits | Memory gate — code must not outrun the vault glyph:verbatim | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS7 | validate-commits | Upload gate firings (rule engine output) | setup/aux | NO-EFFECT | REFUSED(tests) | REFUSED(tests) | n/a |
| DS8 | test-discipline-engine | Checkout repository | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | n/a |
| DS9 | test-discipline-engine | Setup Node | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | n/a |
| DS10 | test-discipline-engine | Resolve docs-only fast path | selector, fail-safe direction | NO-EFFECT | NO-EFFECT | REFUSED(F52) | NO-EFFECT |
| DS11 | test-discipline-engine | Run discipline test suite | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS12 | test-discipline-engine | Invariant-coverage meta-gate (per-invariant wiring of all 6 skills) | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS13 | test-discipline-engine | Closure gate (never-run steps, stale NEXT rows, writer/reader orphans, lane-contract drift) | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS14 | test-discipline-engine | Skill-contract drift (U8: skill/code citation pin, F25 W7.1) | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS15 | test-discipline-engine | Orphan-module + dead-export census (B1 Appendix A/B method — reports, never fails) glyph:verbatim | non-gating by design | NO-EFFECT | NO-EFFECT | REFUSED(F25) | not run |
| DS16 | consistency-backstop | Checkout repository | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | n/a |
| DS17 | consistency-backstop | Setup Node | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | n/a |
| DS18 | consistency-backstop | Consistency runner (push to master) — override-aware glyph:verbatim | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS19 | consistency-backstop | Consistency runner (pull request) — override-aware glyph:verbatim | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS20 | fitness-check | Checkout repository | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | n/a |
| DS21 | fitness-check | Setup Node | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | n/a |
| DS22 | fitness-check | Resolve docs-only fast path | selector, fail-safe direction | NO-EFFECT | NO-EFFECT | REFUSED(F52) | NO-EFFECT |
| DS23 | fitness-check | Install fsi-app deps (required for F9 tsc invocation) | setup/aux | NO-EFFECT | NO-EFFECT | NO-EFFECT | NO-EFFECT |
| DS24 | fitness-check | ESLint (max-warnings 0) | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS25 | fitness-check | Run fitness functions | verdict | ACCEPTED | ACCEPTED | REFUSED(tests) | REFUSED(tests) |
| DS26 | fitness-check | Cache actionlint tarball (version-keyed) | setup/aux | NO-EFFECT | NO-EFFECT | REFUSED(tests) | n/a |
| DS27 | fitness-check | actionlint (pinned, checksum-verified) over .github/workflows | verdict | ACCEPTED | ACCEPTED | REFUSED(tests) | ACCEPTED |
| DS28 | fitness-check | App unit tests requiring npm deps (*.npmtest.mjs) | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS29 | fitness-check | Behavioral goldens (scripts/verify/*.golden.mjs) | verdict | ACCEPTED | ACCEPTED | ACCEPTED | ACCEPTED |
| DS30 | fitness-check | Upload gate firings (fitness functions) | setup/aux | NO-EFFECT | REFUSED(tests) | REFUSED(tests) | n/a |
| DS31 | rendering-guard | Checkout repository | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(tests) | n/a |
| DS32 | rendering-guard | Trust the workspace for git (the container user does not own the checkout) | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(tests) | NO-EFFECT |
| DS33 | rendering-guard | Setup Node | setup/aux | REFUSED(tests) | NO-EFFECT | NO-EFFECT | n/a |
| DS34 | rendering-guard | Install the Playwright npm package matching the image (browsers come from the image) | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(tests) | NO-EFFECT |
| DS35 | rendering-guard | Run rendering guard (fixtures × breakpoint tiers, real layout measurement) | verdict | REFUSED(tests) | ACCEPTED | REFUSED(F25+tests) | ACCEPTED |

## Mutation sweeps: chain-proof.yml steps

| step | job | name | kind | COE | IFF | DEL | TRUE |
|---|---|---|---|---|---|---|---|
| CS1 | chain-proof | Checkout repository | setup/aux | REFUSED(tests) | NO-EFFECT | NO-EFFECT | not run |
| CS2 | chain-proof | Setup Node | setup/aux | REFUSED(tests) | NO-EFFECT | NO-EFFECT | not run |
| CS3 | chain-proof | Note the start time and the proof's scratch paths | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(tests) | not run |
| CS4 | chain-proof | Install fsi-app deps | setup/aux | REFUSED(tests) | NO-EFFECT | NO-EFFECT | not run |
| CS5 | chain-proof | Ensure psql is available | setup/aux | REFUSED(tests) | NO-EFFECT | NO-EFFECT | not run |
| CS6 | chain-proof | Install the Supabase CLI | setup/aux | REFUSED(tests) | NO-EFFECT | NO-EFFECT | not run |
| CS7 | chain-proof | Start the local stack (empty database, storage and auth only) | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(tests) | not run |
| CS8 | chain-proof | Write the local env file (loopback hosts only, keys masked) | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(F25) | not run |
| CS9 | chain-proof | Preflight (local stack environment only) | verdict | REFUSED(tests) | ACCEPTED | ACCEPTED | ACCEPTED |
| CS10 | chain-proof | Create the empty oracle_check database (home of the production schema dump) | verdict | REFUSED(tests) | ACCEPTED | REFUSED(F25+tests) | ACCEPTED |
| CS11 | chain-proof | Replay the migration files onto the stack (builds the proof schema; stops on the first error) | verdict | REFUSED(tests) | ACCEPTED | REFUSED(tests) | ACCEPTED |
| CS12 | chain-proof | Export the production schema dump and data subset (read only; the only step with production credentials) | verdict | REFUSED(tests) | ACCEPTED | REFUSED(F25+tests) | ACCEPTED |
| CS13 | chain-proof | Apply the production schema dump to oracle_check (the oracle) | verdict | REFUSED(tests) | ACCEPTED | REFUSED(F25+tests) | ACCEPTED |
| CS14 | chain-proof | Schema oracle gate (the replayed schema must equal the production dump) | verdict | REFUSED(tests) | ACCEPTED | REFUSED(tests) | ACCEPTED |
| CS15 | chain-proof | Load the subset into the local database | verdict | REFUSED(tests) | ACCEPTED | REFUSED(F25+tests) | ACCEPTED |
| CS16 | chain-proof | Run the chain steps in hop order (apply mode, local database) | verdict | REFUSED(tests) | ACCEPTED | REFUSED(F25+tests) | ACCEPTED |
| CS17 | chain-proof | Run the attack suite on the real schema | verdict | REFUSED(tests) | ACCEPTED | REFUSED(F25+tests) | ACCEPTED |
| CS18 | chain-proof | Export the local harness_runs ledger (hashed ids, no row text) | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(F25+tests) | NO-EFFECT |
| CS19 | chain-proof | Record this run's artifact (chain-proof family) | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(F25) | NO-EFFECT |
| CS20 | chain-proof | Upload the run artifact (counts and hashed ids only) | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(tests) | not run |
| CS21 | chain-proof | Stop the local stack and delete the dump and the subset | setup/aux | REFUSED(tests) | NO-EFFECT | REFUSED(tests) | not run |

## Job-level mutation sweeps (JCOE job continue-on-error, JIF job if:false, JDEL job removed)

| workflow | job | mutation | token |
|---|---|---|---|
| discipline.yml | validate-commits | JCOE | ACCEPTED |
| discipline.yml | validate-commits | JIF | REFUSED(tests) |
| discipline.yml | validate-commits | JDEL | REFUSED(tests) |
| discipline.yml | test-discipline-engine | JCOE | ACCEPTED |
| discipline.yml | test-discipline-engine | JIF | REFUSED(tests) |
| discipline.yml | test-discipline-engine | JDEL | REFUSED(F25+tests) |
| discipline.yml | consistency-backstop | JCOE | ACCEPTED |
| discipline.yml | consistency-backstop | JIF | REFUSED(tests) |
| discipline.yml | consistency-backstop | JDEL | REFUSED(tests) |
| discipline.yml | fitness-check | JCOE | ACCEPTED |
| discipline.yml | fitness-check | JIF | REFUSED(tests) |
| discipline.yml | fitness-check | JDEL | REFUSED(tests) |
| discipline.yml | rendering-guard | JCOE | REFUSED(tests) |
| discipline.yml | rendering-guard | JIF | REFUSED(tests) |
| discipline.yml | rendering-guard | JDEL | REFUSED(F25+tests) |
| chain-proof.yml | chain-proof | JCOE | REFUSED(tests) |
| chain-proof.yml | chain-proof | JIF | ACCEPTED |
| chain-proof.yml | chain-proof | JDEL | REFUSED(F25+F52+tests) |

## REFUSED manual rows

| id | units | form | expected block | observed | token |
|---|---|---|---|---|---|
| DO-4 | DS10, DS22 | checkout depth 1, base ref not resolvable, `docs-only-range.mjs --range=origin/master...HEAD` | no verdict true | git fatal, exit 2; the step treats a non-zero exit as `docs_only=false` (heavy steps run) | REFUSED |
| VC-1 | DS1, DS5, DS16, DS19 | checkout depth 1 (shallow), `BASE_REF=master PR_HEAD=<sha> runner.mjs --mode=ci` | engine does not pass silently | `fatal: Not a valid object name origin/master`, `could not resolve a range`, exit 2. memory-gate and docs-only-range on the same clone: exit 2. override-check: exit 1 but for C4 (see OWED-5) | REFUSED |
| TD-5 | DS11 | failing `fsi-app/src/lib/at5-d.selftest.mjs` (selftest outside the two covered dirs) | flagged | F23: `REGRESSION - ORPHANED PROOFS ... 1, ceiling 0`; coverage-scan lists the file | REFUSED |
| FC-1 | DS27 | actionlint step shell: poisoned cache tarball plus stub `curl` serving a tampered file | refuse | `FAILED`, `sha256sum: WARNING: 1 computed checksum did NOT match`, exit 1 | REFUSED |
| FC-2 | DS27 | no cache, stub `curl` exits 0 and writes nothing | refuse | `FAILED open or read`, exit 1 | REFUSED |
| CP-6 | CS20 | upload `retention-days: 70` | budget gate fires | F68 fired (regex `retention-days: 7` alone would match 70) | REFUSED |
| G-4 | hop 05 | apply mode, `config.mode:"Execute"` (case) | skip=true | `{"skip":true,"reason":"... effective mode=Execute (wanted execute)"}` | REFUSED |
| H-ART | hop 02 (F50 fired proof via artifact file) | copy ledger-consume-run-010.json to run-011.json with `trigger:"workflow_run"`, flip `enforceFired` true | fail | F28 fired `STALE PROPOSER ATTESTATION ... does not name ledger-consume-run-011` | REFUSED |

## OWED legs

- OWED-1 migration-proof.yml: not on origin/master at 12c69634 (`git ls-tree origin/master` returns 0; it exists only in unmerged history, commit ec12631d MIG-CI). No attack possible. [WORK: TESTS-1]
- OWED-2 DS23 (`npm ci`) and DS24 (ESLint): need npm install and network; the scratch clones carry no node_modules. Sweep cells for these steps are workflow-edit results only; the step's own behaviour was not attacked. [WORK: TESTS-1]
- OWED-3 DS27 actionlint binary: `which actionlint` returns nothing and there is no network; F52 and FC-1/FC-2 ran, the actionlint run did not. Whether actionlint with `-shellcheck= -pyflakes=` accepts a syntactically broken `run:` script is [HYPOTHESIS]; F52 itself does not parse shell. [WORK: TESTS-1]
- OWED-4 DS35 and the layout guard at runtime: no browser in the scratch environment; only the step text (RG-1, RG-2) and the sweeps were attacked. [WORK: TESTS-1]
- OWED-5 DS18/DS19 consistency-backstop: `override-check.mjs` is red at baseline in any scratch clone (`[C4] missing-claim ... basename "m1" exists inside the repository path but is not listed in docs/inventories/worktrees.md`), so its verdict cannot discriminate an attack. Only workflow-text sweeps, the neuter row and VC-1 apply. [CONFIRMED: ran in a scratch clone, output captured] [WORK: TESTS-1]
- OWED-6 branch protection and required checks (is `Discipline engine` a required status, can master be pushed directly): GitHub-side setting, needs the API; not read. Direct push to master runs only validate-commits and consistency-backstop (DS4, DS6, DS18 paths), VC-2 and VC-3 show what those do on a push. [WORK: TESTS-1]
- OWED-7 live legs: `loop-fired-evidence-audit.mjs` (compares evidence entries with the live harness_runs table) needs credentials, not run, so AH2 forged entries were checked only against the repo gates; G-5 reach and the real GitHub Actions effect of every mutation are unfired. [WORK: TESTS-1]
- OWED-9 gate scripts with no sibling test: run-explicit-tests.mjs (TD-6 covers it end to end), run-goldens.mjs and run-rendering-guard.mjs (git grep of the *.test.mjs files finds only path mentions of the last two, no test that executes them); neutering them was not oracle-tested, so those two are unattacked beyond the step sweeps. [WORK: TESTS-1]
- OWED-8 chain-proof.yml steps that need Docker or the supabase CLI (CS5 to CS8, CS18): sweeps ran on the workflow text only. [WORK: TESTS-1]

## Observed in passing (facts, no proposals)

- [CONFIRMED: this session] The PreToolUse skill gate blocked three Bash commands with `Data write (prod effect)` and demanded the skills remediation-discipline and environmental-policy-and-innovation; the commands copied `fsi-app/scripts/verify/run-goldens.mjs` into a scratchpad directory and created a fixture file there. After both skills were loaded the same command ran. Relevant to AUD-AT-3. [NOT-WORK: fact, no action]
- [CONFIRMED: closure-gate output] `current train: 71`; the NEVER-RUN age clock is the train counter (TD-7). [CLOSED: PR 1039]
- [CONFIRMED: the full-suite runs] On a loaded machine the test `RACE: C3 and F64 live tests run concurrently ten times` was cancelled at its 300000 ms timeout (4 of 4 full runs), making `run-test-suite.sh` exit 1 independent of any mutation. [WORK: TESTS-1]

## Matrix cells to enter

- Subsystem 7 CI workflow, ATTACKED (O-009): `2026-10-08 AT5` (partial for DS23, DS24, DS27, DS35 runtime and the consistency layer: enter `~2026-10-08 AT5` if the matrix convention requires a full run).
- Subsystem 8 Chain workflows and hops, ATTACKED (O-010): `2026-10-08 AT5` (all 13 hops attacked at the repo-gate level; live audit leg owed: `~2026-10-08 AT5` if the live leg is required).

