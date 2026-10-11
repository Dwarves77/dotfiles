# RULES-X-1: which honest operations do the gates refuse, and where do two gates disagree (fact lane, 2026-10-09)

Fact lane, read-only. No fixes, no proposals. Rule 14 status token on every finding; rule 13 disposition tokens are the coordinator's and are absent on purpose. Runs were on a scratch repo built from `git archive` of origin/master (first at 910f35a75, re-synced to 77eade280; the engine files for rules, lib, runner, hooks, closure, memory and docs-only gates are byte-identical between the two, `git diff --stat` showed only the skill gate, its tests and one smoke spec changed). The scratch repo was deleted at the end.

## 0. Declared

- Operations run through the real hooks (`commit-msg`, `pre-commit`, `pre-merge-commit`, installed by the real `install-hooks.mjs` with `--settings` and `--user-hooks-dir` pointed at scratch, so no user-level file was touched) in linked worktrees of the scratch repo, CI shape through `BASE_REF=master PR_HEAD=<sha> node runner.mjs --mode=ci` (the resolver's `ci-pr` source). Pure gate functions (`evaluateGate`, `memoryGateVerdict`, `isDocsOnlyPath`, `headerProblems`, `collectOpenFindings`) were called from the origin/master code.
- NOT run: pre-push as a whole (step 0b needs an npm install the scratch does not have), the consistency runner on scratch (C3 reports 1 drift record at baseline in a bare archive, so it cannot discriminate; on the real tree it reports 0), actionlint (not installed), the browser jobs, any CI job on GitHub. Those cells are `h` (read only) in the matrix.
- Side effects on the main checkout: `git fetch` (refs only); `node --test` of the C3 file seven times (gitignored telemetry under `fsi-app/.discipline/out/` and the firing log may have grown; `git status` stayed clean); the live user-level gate blocked two of this lane's own commands, which were rerun from script files.
- Seed 4 note: this lane's own command containing the text of the gated pattern inside a `node -e` payload was denied by the live gate (it scans interpreter payloads). [CONFIRMED: the live deny, exact text "BLOCKED ... Missing: remediation-discipline, environmental-policy-and-innovation"] [NOT-WORK: fact, no action]

## 1. Totals

- Cells run: 113 (rule 022: 16; rules 012/015: 7; closure gate: 3; memory gate: 10; applied-status: 2; F51 check 4: 4; docs-only classifier: 16; PreToolUse command classification: 26 commands, each under two skill states = 52 verdicts; tool-name routing: 22; dispatch refusal: 4; branch protection and the PR timeline: 2; consistency baseline on the real tree: 1). Separate: 7 timing runs of the C3/F64 RACE test.
- Refused-honest cells: 24 (rule 022: 4; rules 012/015: 2; closure NEVER-RUN: 1; memory gate: 4; applied-status: 1; F51 check 4: 3; skill gate on read-only or scratch commands: 6; dispatch refusal: 3). Asked (prompt, not refusal) honest cells: 6 (merge, rebase, checkout of a path from a ref, worktree add, reset --hard, branch -D). [NOT-WORK: fact, no action]
- Disagreeing pairs: 12 (section 4).
- Exemptions in the tree: 22 exported lists, 122 entries, 9 further lists present and empty; ISO `until` dates exist only in closure-gate NEVER_RUN_DORMANT (18 entries: 17 until 2026-11-30, 1 until 2026-10-22). The other "dated" lists carry `reviewByPhase` prose, which no gate compares with a clock (section 5).

## 2. Seed collisions (status on origin/master 77eade280)

| # | Seed | Status today | Evidence |
|---|---|---|---|
| S1 | rule 022 vs merge of master | FIXED by PR 1043 (RULE-MERGE-1) | [CONFIRMED: ran] merge of a master that carries a glyph line: commit accepted, baseline label "merge commit: lines in neither parent"; conflict resolved by taking master's line verbatim: accepted. Residual: a conflict resolved with text in neither parent that carries the glyph is charged (R03), by design. |
| S2 | rule 022 vs verbatim move across files (SKILL-SLIM-1) | FIXED by PR 1052 for the paired-removal form; STILL REFUSED when the moved line is edited | [CONFIRMED: ran] a glyph line moved to a new file while its source line was replaced by unrelated text: accepted (R07). The same move with a "- " prefix added: refused (R05). |
| S3 | per-commit validation vs squash after a mid-PR tightening | FIXED by PR 1048 (RULE-RANGE-1) for a `ci-pr` range | [CONFIRMED: ran] commit 1 adds a glyph (landed with --no-verify as "before tightening"), commit 2 removes it: per-commit 022 fails, printed "superseded: content rule 022 is judged on the whole-range diff", whole-range clean. Residuals: R14/R15/R21/R22 (revert PR), and repo settings allow_merge_commit and allow_rebase_merge are both true (only the squash is judged) [CONFIRMED: gh api]; the effect of a non-squash merge is [HYPOTHESIS]. The last 40 commits on master are one commit per PR, i.e. squash merges [CONFIRMED: git log]. |
| S4 | skill gate vs read-only `git merge-tree --write-tree` | STILL REFUSED | [CONFIRMED: ran evaluateGate on 77eade280 code] in scope, no skills loaded: deny; both skills loaded: ask. Pattern `--write\b` (skill-map.mjs:175) matches `--write-tree`. Same for `git push --dry-run`, `grep -rn truncate`, `grep -rn delete from`, `--execute --dry-run`, `rm -rf` of a scratch dir. |
| S4b | skill gate vs copying a script to scratch (AT-5 observation) | [REFUTED as stated] | [CONFIRMED: ran] `cp fsi-app/scripts/verify/run-goldens.mjs /tmp/scratch/` returns allow with no skills loaded. AT-5's blocked commands also created a fixture file; the denying text is not in the register, so which part of those commands matched is not known. |
| S5 | skill gate message vs the lane contract's stop-on-hook rule | RECONCILED in the brief text only | [CONFIRMED: read] the deny text says to invoke the Skill and retry; COMMON.md rule 13 of this wave says a skill-naming PreToolUse block is not a failure. `docs/dispatches/lane-common-contract.md` carries no hook-stop sentence and no such reconciliation (grep). COMMON.md is in the scratchpad, not versioned. [HYPOTHESIS] FLAG-1's "lane contract versus gate contradiction check" covers this; not read. |
| S6 | closure NEVER-RUN vs a workflow added in the same PR | STILL REFUSED for a dispatchable workflow | [CONFIRMED: ran] a new `workflow_dispatch` workflow: NEVER-RUN FAIL; passes only after a `NEVER_RUN_DORMANT` entry is added to `closure-gate.mjs` (a governed file edit). A `pull_request`-only workflow is not a target (migration-proof.yml has no entry and passes) [CONFIRMED: read `isDispatchable` in gatherNeverRunTargets]. The entry is audited both ways: once the ledger holds a row the entry itself fails as stale [CONFIRMED: read closure-gate.mjs:185-186]. |
| S7 | memory-gate evidence rule vs pre-existing session logs | STILL | [CONFIRMED: ran isMemoryEvidence over every session-log.d file] 147 of 276 fail (95 of 105 in September, 52 of 171 in October; 9 of the 2026-10-08 logs). Bites only when a PR's sole memory entry is an edited old log, or a new log is written in the old format. |
| S8 | GATE-9 loop-id vs the export landing later | tests FIXED by PR 1051; the cause STANDS (section 3, X1) | [CONFIRMED: gh timestamps and the LOOPID-1 log] |
| S9 | applied-status header test vs prose "NOT APPLIED" in a migration | STILL REFUSED | [CONFIRMED: ran headerProblems on migration 376 with one prose line added] "the header still says NOT APPLIED although the ledger holds the row". PR 1050 reworded the migration comment; `_lib/applied-status.mjs` last changed in 4ee8bbee3 (PR 1035) [CONFIRMED: git log]. The same mechanism cost PR 1050 two red runs (success, failure, failure on the branch) [CONFIRMED: gh run list]. |
| S10 | F51 check 4 vs coordinator work on a lane/ branch | STILL REFUSED for any branch not master, main or coord/* | [CONFIRMED: ran] lane/ branch editing PROGRAM-BOARD: refused; renamed coord/: "skipped: coordinator branch"; detached HEAD with no ref name: refused; detached with GITHUB_HEAD_REF=lane/x: refused. All 5 executor refresh PRs use coord/mig-headers-* [CONFIRMED: gh pr list]. |
| S11 | dispatch while findings are open (FLAG-1, merged as PR 1055, e959a317e) | REFUSED | section 3, X2 |

## 3. Findings by blast radius

X1. [CONFIRMED: gh pr view 1041/1042 mergedAt and run list, LOOPID-1 log] `strict: false` on master protection lets a PR merge green against a stale base, and the heavy gates (unit tests, fitness, rendering guard) run on `pull_request` only (discipline.yml `if: github.event_name == 'pull_request'` on test-discipline-engine, fitness-check, rendering-guard; master pushes run validate-commits and consistency-backstop only). Incident: PR 1042 (GATE-9) last full CI run 2026-10-08T22:56:54Z on head 0255e396, green; PR 1041 (committed ledger export) merged 23:03:14Z; PR 1042 merged 23:35:14Z with no run against the new base; every PR's unit-test job was red from then until PR 1051 (LOOPID-1). The executor's merge-tree check is procedure, not enforcement. Branch protection read: 6 required contexts, enforce_admins true, allow squash, merge and rebase; the required list does not contain "Migration proof (apply on a local stack)" (MIG-CI, PR 1019) or the design-audit job.

X2. [CONFIRMED: ran evaluateGate on a clean archive of 77eade280; collectOpenFindings] The FLAG-1 dispatch gate denies Agent, Task, Workflow and SendMessage while any finding in session logs (Not done, Open items, Open questions, Residual sections, dated 2026-10-01 or later) or in any `*register*.md` under fsi-app/scripts/tmp has no disposition token; only a prompt containing DISPOSITION-LANE passes. Clean master: 26 open (6 lane logs). The coordinator's checkout: 104 open (26 in session logs, 78 in gitignored scratch registers), so the verdict depends on local untracked files. The lane contract and COMMON rule 11 require each lane's log to list what is NOT done, and 6 of 6 post-FLAG-1 lane logs carry at least one undispositioned line, including "None blocking." and "No migration, no live access, no change to any other file." Every lane report therefore closes the next dispatch until a disposition lane runs. `audit-finding-status.mjs --strict` (run-test-suite.sh:131) exits 0 with 104 open, because strict fails only on docs/audits.

X3. [CONFIRMED: ran] A new dispatchable workflow in a PR fails closure NEVER-RUN until `NEVER_RUN_DORMANT` gains a dated entry. 18 entries exist now; 17 expire together on 2026-11-30. Build mode (rule 16, ADR-023, "no data population until every build layer is complete") is the reason none was dispatched, so on that date the gate demands a dispatch or deletion for 17 workflows. Whether the build is finished by then is [HYPOTHESIS: not determinable from the tree].

X4. [CONFIRMED: ran] The skill gate answers deny (no skills loaded) or ask (both loaded) to `git merge-tree --write-tree`, `git push --dry-run`, `grep -rn truncate`, `grep -rn delete from`, `node x.mjs --execute --dry-run` and `rm -rf <scratch>`; every lane push is gated by two skills. Branch-moving git forms ask even in an assigned worktree (merge, rebase, worktree add, checkout of a path from a ref, reset --hard, branch -D). `git restore --source`, `git stash`, `gh pr merge`, `git worktree remove` are allowed. Whether an "ask" blocks a non-interactive sub-agent is [HYPOTHESIS].

X5. [CONFIRMED: ran, local commit-msg and CI `ci-pr` range] A revert PR that restores a file carrying a rule 012, 015 or 022 pattern is accepted as one commit (the `Revert ` subject skips the trigger) and refused as soon as a second commit exists: the next local commit fails on the restored lines, and the CI whole-range pass fails (runner exit 1). The memory gate asks for a log in the same PR, so the second commit is the normal shape. `post-commit` lists cherry-pick, rebase and am in its case; a `revert:` reflog subject is not in it [CONFIRMED: read hooks/post-commit].

X6. [CONFIRMED: ran memoryGateVerdict] Memory-gate verdicts: new-format log accepted; old-format log (no dated heading plus Accomplished line) refused for a code change; an old log edited in place refused; the executor refresh shape (migration SQL, APPLIED-MAP, inventory, old-format log) refused; `harness-ledger-export.json` alone refused (it sits under `fsi-app/.discipline/`, and only `scripts/harness-runs/` data is excluded); `package.json` alone refused; workflow alone refused; workflow plus PROGRAM-BOARD edit accepted.

X7. [CONFIRMED: ran headerProblems] Applied migration with prose "NOT APPLIED" anywhere in its first 30 header lines (outside the `-- subject:` line) fails the applied-status test; the next migration whose header explains why another is unapplied hits it again.

X8. [CONFIRMED: sizes via git cat-file; read skill-slim.test.mjs] Gate-demanded skill cores against the 12000-byte cap: environmental-policy-and-innovation 11953 (47 bytes headroom), source-credibility-model 11928 (72), sprint-followups-discipline 11918 (82), remediation-discipline 11799 (201), caros-ledge-platform-intent 11012, analysis-construction-spec 10750. Conservation is strict against base 023d47588 and `ACKNOWLEDGED_LINE_CHANGES` is empty, so an honest correction of a pre-split line needs a second file edit. An edit actually failing these is [HYPOTHESIS: not run, the test needs the pinned commit and the skill files in a worktree].

X9. [CONFIRMED: ran isDocsOnlyPath, read both tests] Two files read by heavy tests are classed docs-only, so a docs-only PR skips the jobs that read them: `fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md` (F25-module-liveness.test.mjs:541 asserts every registry row resolves) and `docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md` (rendering/audit/generated-on.test.mjs:32 parses its stamp line). Also `docs/audits/dead-code-manifest-2026-08-11.txt` (read by F25 and orphan-modules). The first red appears on a later unrelated code PR. That an edit changes the verdict is [HYPOTHESIS: not run].

X10. [CONFIRMED: ran] F51 check 4 and branch naming: see S10. A coordinator or executor branch not named coord/ is refused; so is a detached HEAD without GITHUB_HEAD_REF or GITHUB_REF_NAME.

X11. [CONFIRMED: ran] Rule 022 refuses a rename plus edit of a glyph-bearing line when the file is small enough that git does not detect the rename (7-line file, similarity under 50%; R11); the same edit in place is accepted (R12).

X12. [CONFIRMED: 7 runs] C3/F64 RACE test (`C3-migrations-reality.test.mjs`, timeout 300000 ms at line 177) on the real tree at 77eade280: in-test durations 106.1, 105.9, 113.3, 101.9, 102.2 s (runs 5 and 6 recorded wall time only: 112 and 110 s); wall time 110 to 122 s; 6 passed, 1 failed (run 3, 113.3 s, not a timeout; the failure text was not captured). AT-5's cancellation at 300 s was not reproduced on this machine. The cause of the run-3 failure is [HYPOTHESIS: flake under concurrent load].

X13. [CONFIRMED: read] F25's expiry oracle is the highest `waveN` in `git log --oneline origin/master` subjects (F25 lines 401-411); the newest tag in master's history is wave71, the same frozen counter GATE-8 removed from the closure gate. F25's 17 allowlist entries carry `reviewByPhase` prose and no enforced date, so the oracle has nothing to compare against; the fitness job's shallow checkout returns null (F25's own header says so).

## 4. Pairs of gates that disagree on one operation

1. FLAG-1 dispatch gate vs memory gate plus lane contract (X2): one demands a log with a "not done" list, the other turns that list into an open finding. [CONFIRMED]
2. Docs-only fast path vs F25 test and generated-on test (X9). [CONFIRMED classification; verdict change HYPOTHESIS]
3. Closure NEVER-RUN vs build mode rule 16: the gate wants a dispatch, the rule forbids dispatching until build complete (X3). [CONFIRMED text of both] [CLOSED: PR 1056]
4. Closure NEVER-RUN entry audit vs the exemption it needs: once the ledger holds a row the entry fails as stale, so every exemption is a two-edit sequence to a governed file. [CONFIRMED: read] [CLOSED: PR 1056]
5. Local commit-msg (cumulative baseline) vs revert subject exemption: single revert passes, revert plus log commit fails, and CI agrees (X5). [CONFIRMED] Local per-commit vs CI squash judge no longer disagree after PR 1048. [CONFIRMED] [CLOSED: PR 1066]
6. Memory gate evidence vs applied-status vs executor shape: the refresh PR must carry a new-format log (X6) and a migration whose header contains no NOT APPLIED prose (X7). [CONFIRMED]
7. Skill gate (ask on branch-moving forms inside a worktree) vs the lane contract's worktree-first rule (every lane runs `git worktree add` and `git merge origin/master`). [CONFIRMED asks]
8. Skill gate DANGER vs read-only intent: `--write` matches `--write-tree`, `--dry-run` does not exempt (X4). [CONFIRMED]
9. PR-only heavy jobs vs strict:false (X1). [CONFIRMED incident]
10. Branch protection required list vs the workflows that exist: migration-proof and design-audit are not required. [CONFIRMED gh api]
11. F51 check 4 vs executor and coordinator branch naming (X10). [CONFIRMED]
12. skill-slim conservation plus byte cap vs the skill gate's demand that the skill be loaded before editing it (X8). [CONFIRMED sizes; failure HYPOTHESIS]

## 5. Exemptions, allowlists, dated entries (from importing each module on the 77eade280 archive)

| List | Entries | What it stands in for (read from header only for F15, F25, F51, closure; the rest by name: [HYPOTHESIS]) |
|---|---|---|
| closure-gate NEVER_RUN_DORMANT | 18 (17 until 2026-11-30, 1 until 2026-10-22) | dispatch-only workflows never dispatched (build mode); design-audit.yml awaiting its first ledger row |
| exemptions.EXEMPTIONS | 19 | governed-surface files exempted from skill-map coverage with a reason |
| F25 LEGACY_ALLOWLIST | 17 (reviewByPhase prose) | modules with no production importer, named debt |
| F36 PRE_EXISTING_ALLOWLIST | 14 | files with pre-existing unpinned date formatting |
| F64 RLS_ENABLE_ALLOWLIST | 12 | tables allowed without RLS enable |
| F21 SANCTIONED | 7 | sanctioned single-grounding entries |
| F9 ALLOWED_TSCONFIG_EXCLUDES | 6 | tsconfig exclusions allowed |
| F15 LEGACY_ALLOWLIST | 5 (reviewByPhase) | direct model-call sites not yet moved to the spend chokepoint |
| F15 SANCTIONED / F16 SANCTIONED / F13 adversarial | 3 / 2 / 1 | sanctioned chokepoint callers |
| F40 BEARER_BUILDER_ALLOWLIST | 3 | bearer-header builders |
| F51 MIGRATION_DUPLICATE_ALLOWLIST / ZERO_CEILING_ALLOWLIST | 2 / 2 | duplicate prefixes 006 and 007; constant-zero ceilings F46 and F47 |
| F47 ALLOWLIST, TERMINAL_SINK_ALLOWLIST | 2, 2 | operator decisions to keep objects code does not touch; tables written and never read |
| F34 ALLOWLIST, F69 SECURITY_ALLOWLIST_FILES, 375 exemptions, law2 desktop exemptions, overflow attrs, NET_EGRESS | 1, 1, 1, 1, 2, 1 | single-file or single-object exceptions |
| Empty lists | 9 | F22, F24 broken-ref and cron, F27, F38, F64 admin, closure stale-next and writer-reader, test-discovery |

Not exported, not counted: F2 WORKER_SECRET_ALLOWLIST, per-site markers (`glyph:verbatim`, F41-F43 site markers). Enforced clocks: only NEVER_RUN_DORMANT (closure ledger clock 2026-10-08). The 2026-10-22 entry expires in 14 days.

## 6. Matrix

Cell = expected/observed. A accepts, R refuses, a asks. `*` run in the scratch repo or by calling the gate function; `h` read only [HYPOTHESIS]; `c` conditional (see note). Unlisted cells are not applicable or not distinguishing. Columns: MG merge master into lane; MV verbatim move across files; SQ squash of multi-commit PR; TI rule tightened mid-PR; NW new workflow; NT new tool name; NM new migration; NR new rule; NS new skill file; RG generated file regenerated; EX executor refresh PR; DO docs-only PR; RN rename; RV revert; CB coord/ branch edit; LB lane/ branch edit; DS dispatch while findings open.

| Gate (source) | Cells |
|---|---|
| rule 022 (rules/022:165, context.mjs buildIntroduced) | MG A/A*; MG(conflict, regenerated text) A/R*c; MV A/A* (same commit, two commits, paired removal), MV(edited line) A/R*; SQ A/A*; TI A/A*; RN A/A*, RN(tiny file, glyph line edited) A/R*; RV(1 commit) A/A*, RV(2+) A/R*; RG A/R*c |
| rule 012 (rules/012) | MV A/A*; RN A/A*; edit of a line carrying the pattern A/A*; RV(2+) A/R*; MG A/A h |
| rule 015 (rules/015) | MV A/A*; RN A/A*; edit of raw update line A/A*; RV(2+) A/R*; MG A/A h |
| rules 017, 019 | RV(2+) A/R h (same introducedLines baseline and the same Revert trigger skip, rules/017:99, 019:95); MV A/A h |
| rule 018 | RN(page into a non-five-surface top-level route) A/R h; RV A/R h |
| rule 021 | MG(both sides changed the interface) A/R h (decides on the blob; correct refusal until the key is recomputed) |
| rule 023 | all A/A h |
| pre-commit, pre-merge-commit (RD-19) | MG in a worktree A/A*; any commit or merge in the main checkout R by design; CB A/A h; LB A/A h |
| post-commit | RV: no rules run on a landed revert (case list lacks revert) A/A* (a miss, not a refusal) |
| commit-msg baseline (lib/baseline.mjs) | TI: next commit re-surfaces an earlier --no-verify violation A/R* (X5 mechanism) |
| PreToolUse skill gate (skill-map.mjs, gate.mjs) | MG a*; NR/NS: governed edit A/A after load h; EX: `git push` a*; read-only commands in X4 A/R* (6 cells); branch-moving forms A/a* (6 cells); RN (`git mv`) A/A*; RV (`git revert`) A/A*; CB/LB A/A* |
| PreToolUse routing (wire-pretooluse-settings.mjs negative matcher) | NT: unknown MCP tool name A/a*; unknown non-MCP tool name A/A* (ungated); get_/list_ MCP names A/A* |
| FLAG-1 dispatch gate (gate.mjs dispositionRefusal) | DS: Agent A/R*, SendMessage A/R*, Workflow A/R*, Agent with DISPOSITION-LANE A/a* |
| memory gate (memory-gate.mjs) | EX(old-format log) A/R*; NM(new-format log) A/A*; NW(no log) R by design *; DO A/A* (docs are not code); RN out of code A/A h (source path counted by GATE-7); old log edited A/R* |
| docs-only classifier (docs-only-range.mjs) | DO A/A* (15 path verdicts); RN(src to docs) A/A* (not docs-only); X9 files A/A* with a downstream miss c |
| closure NEVER-RUN | NW(dispatchable) A/R*; NW(pull_request only) A/A*; EX n/a |
| closure WRITER-READER | NM(DDL only) A/A*; NM(writer, no reader) R by design h |
| closure STALE-NEXT | CB A/A h; LB A/R h |
| F51 check 4 | CB A/A*; LB R by design *; EX(coord/mig-headers) A/A*; detached A/R* |
| F51 checks 1-3 | NM(duplicate number against a concurrent PR) R by design h |
| F45 duplicate-code (ratchet vs merge-base) | MV A/A h; RN A/A h; RV A/A h (CI compares the merge checkout with base tip) |
| F25 module liveness | NW A/A h; SQ/TI A/A h (oracle X13) |
| F52 workflow validity, F68 artifact budget | NW A/A h (actionlint absent in scratch) |
| C3 migrations.md parity | NM(never applied) A/A h (MIGTEST-1b exception); EX A/A h; RG A/A h |
| applied-status test | EX(prose NOT APPLIED) A/R*; EX(clean) A/A* |
| skill-slim conservation and cap | NS A/A h; edit to a gate-demanded skill A/R h (X8) |
| invariant-coverage, execution-wiring | NR A/R h (new rule needs an invariants.d file and doctrine entry; not run) |
| branch protection (gh api) | SQ/TI/NW: merge against stale base A/A* (X1) |

Notes: R03 regenerated text is charged because the lines are in neither parent; whether any generator emits a glyph is [HYPOTHESIS], though 5 inventory files and the ledger export on master contain glyph lines (5 inventories, 1 JSON). R15 and R22 are the CI runs. All R/A cells with `*` were run once.
