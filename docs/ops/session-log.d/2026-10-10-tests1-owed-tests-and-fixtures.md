# 2026-10-10, lane TESTS-1 (tests1-owed-tests-and-fixtures), resumed: the RLS persona matrix, the C3 race split and the owed gate tests

Rows worked: the 48 `[WORK: TESTS-1]` lines on origin/master (docs/audits and docs/ops/session-log.d, the dispo1 table excluded). This lane does not edit them; the executor applies the dispositions below at merge. Previous agents on this lane were killed mid-work; their 11 uncommitted changes were read in full, kept (all matched the brief) and finished.

## Accomplished

1. RLS persona attack matrix (AT1 section 4 items 1 and 2): `fsi-app/scripts/verify/fixtures/rls-personas.mjs` adds P2 (org viewer) and P4 (org member) users to the chain-proof fixture set (P3 is its `member_b`, P1 is anon); `fsi-app/scripts/verify/attacks/rls-persona-matrix.mjs` runs SELECT, INSERT, UPDATE, DELETE and TRUNCATE on every public base table as each persona inside one always-rolled-back transaction (121 x 5 = 605 cells per persona on the current schema) and holds three invariants (full coverage, no persona passes the TRUNCATE privilege check, no broken probe); `.github/workflows/rls-persona-matrix.yml` (new workflow, adds no step to an existing one) runs it on the local stack after the replay and the pending-migration apply, so it covers migration 382 once the executor applies it.
2. Seeded-row attacks in `rls-persona-attacks.mjs` (attack-engine step shape, attack plus control): four workspace_tags attacks (P1, P2, P3, P4), and two added in this resume: `rls-persona-status-columns-self-authorise-refused` (the exact spec owed by the SEC-2 log: nine status-column self-updates and a self-insert refused 42501, request_verification() returns pending from none and is refused 55000 from active) and `rls-persona-profiles-guard-trigger-stands-alone` (AT1 item 5: the column UPDATE grant is restored inside the rolled-back transaction and the profiles_privilege_guard trigger alone must still refuse 42501 with its own message).
3. `rls-persona-matrix.test.mjs` (21 tests, a scripted fake database): coverage, classification, invariants, CLI refusal outside the local stack, teardown on error, and an attack on the attacker for each leak (viewer insert, cross-org read, TRUNCATE, status-column write, guard trigger gone).
4. C3 and F64 race (AT5 line 254, TESTFIX-1 line 37): `C3-migrations-reality.test.mjs` is now ten independent round tests each capped at 120000 ms (was one test capped at 300000 ms over ten rounds) plus a final test that the real tree is unchanged; `C3-race-shape.test.mjs` fails on the old cumulative shape.
5. `F28-currency-boundaries.test.mjs` (STALE RUN and NEVER RUN at the day-30, day-31, day-90, day-91 edges with dated ledger rows), `F45-origin-base.test.mjs` (F45 against a real bare origin and a clone; the merge-base, not the advanced tip, is the base), `closure-gate-git-dates.test.mjs` (CLOSURE NEVER-RUN introducedAt equals the `git log --diff-filter=A` date for every dispatchable workflow, no maintenance step undated).
6. `recompute-tiers-cadence.test.mjs` (the real `readAll("system_state", "scrape_cadence")` leg of `buildDeps().readCadence`, fail closed to off), a research-assessment-producer test for the `item_forward_events` join, and two real-symlink legs in `worktree-node-modules.test.mjs` (run on Linux CI; on a Windows machine without the symlink right the second test asserts the refusal code and the first returns early).

## Read and reused

Read: root CLAUDE.md, COMMON and the TESTS-1 section of batch2, the 48 row lines with their context, the 11 uncommitted changes, `attack-engine.mjs` (runStep, evaluateExpect, roleStatements), `scripts/proof/attacks/fixtures.mjs`, migration 367 (guard function, request_verification, error codes), the SEC-2 and SEC-8 session logs, `migration-proof.yml` and the local-stack composite action. Reused: the PROOF-4 attack engine and its fixtures (no second engine), `assertLocalOnly` from run-attacks.mjs, the composite local-stack action and the replay and apply scripts of migration-proof, `isMainModule`, the existing F28, F45 and closure-gate exports.

## Red then green

- Race: the old shape is the red; `C3-race-shape.test.mjs` asserts against it (3 pass on the new shape) and the pre-change file fails its first assertion by construction (rounds looped inside one test, 300000 ms cap). `node --test` of the split file: 19 pass, 156 s total on this machine.
- Matrix: each leak in the fake database turns the run red naming the attack (tests 5 to 9 of the 21); the clean run is green (21 pass).
- Other new test files: 3, 4, 3 and 4 tests pass (F28, F45, closure dates, cadence); research-assessment-producer 36 pass; worktree-node-modules 13 pass.
- Three consecutive CI runs of the split race test (the brief's flake proof) are NOT yet cited: see NOT done.

## Row dispositions (file:line -> token; the executor applies them)

- aud-at1:66 -> [CLOSED: PR 1088]; aud-at1:67 -> [CLOSED: PR 1088]; aud-at1:70 -> [CLOSED: PR 1088]; aud-at1:71 -> [WORK: TESTS-2]; aud-at1:73 -> [WORK: TESTS-2]
- aud-at2:73 -> [WORK: TESTS-2]; aud-at2:74 -> [WORK: TESTS-2]; aud-at2:75 -> [WORK: TESTS-2]
- aud-at3:510 -> [WORK: TESTS-2]; aud-at3:511 -> [NOT-WORK: no blocking claim to attack, each hook exits 0 on every path]; aud-at3:512 -> [NOT-WORK: needs a throwaway Claude Code session started with each settings switch, which cannot exist in the repo]; aud-at3:513 -> [CLOSED: PR 1088]; aud-at3:514 -> [WORK: TESTS-2]; aud-at3:515 -> [NOT-WORK: the path form a live Claude Code session passes to the hook is a property of the harness, not of the repo]
- aud-at4:457 -> [WORK: TESTS-2]; aud-at4:458 -> [CLOSED: PR 1088]; aud-at4:459 -> [NOT-WORK: the live-catalog leg needs the production database]; aud-at4:460 -> [CLOSED: PR 1088]; aud-at4:461 -> [CLOSED: PR 1088]
- aud-at5:240 -> [WORK: TESTS-2] (premise stale: `git ls-tree origin/master .github/workflows/migration-proof.yml` now lists the file; the attack on it is still owed); aud-at5:241 -> [WORK: TESTS-2]; aud-at5:242 -> [NOT-WORK: no actionlint binary on this machine and no network to fetch one]; aud-at5:243 -> [NOT-WORK: browser-only leg, no browser in a lane; the CI rendering guard is the runtime]; aud-at5:244 -> [WORK: TESTS-2]; aud-at5:245 -> [NOT-WORK: GitHub branch protection is a repository setting read through the GitHub API, not repo content]; aud-at5:246 -> [NOT-WORK: needs production credentials]; aud-at5:247 -> [WORK: TESTS-2]; aud-at5:248 -> [WORK: TESTS-2]; aud-at5:254 -> [CLOSED: PR 1088]
- r11-checks:144 -> [WORK: TESTS-2]; l5:102 -> [REFUTED: `git grep -n tagsFacet origin/master -- fsi-app/src` lists only MarketIntelLedger.tsx, ResearchLedger.tsx has no such dependency]; ra-wf:170 -> [CLOSED: PR 1088]; s1c:32 -> [CLOSED: PR 1088]; s3b:142 -> [NOT-WORK: browser look at the real routes needs a dev server and data, neither exists in a lane]; s8b:24 -> [WORK: TESTS-2]; s8c:31 -> [WORK: TESTS-2]
- audit-catalogue:43 -> [WORK: TESTS-2]; daudit1:196 -> [WORK: TESTS-2]; daudit1:203 -> [WORK: TESTS-2]; daudit2:173 -> [WORK: TESTS-2]; daudit2:174 -> [WORK: TESTS-2]; daudit2:175 -> [WORK: TESTS-2]
- gate6:70 -> [NOT-WORK: layout-baseline-renewal.yml is dispatch-only, exercised only by an explicit dispatch]; gate6:71 -> [NOT-WORK: live-smoke.yml runs on a Production deployment or by dispatch, a production row]
- routes1:80 -> [WORK: TESTS-2]; sec2:60 -> [CLOSED: PR 1088]; sec4:69 -> [WORK: TESTS-2]; testfix1:37 -> [CLOSED: PR 1088]

## Decisions

- The race is fixed structurally (per-round tests with a per-round cap), not by a larger cap, as the brief requires.
- The persona matrix is its own workflow and its own check rather than a step in an existing workflow, so the required check migration-proof.yml reports is untouched; it decides inside the job whether the PR touched a migration, the matrix, its fixtures or the attack engine, so unrelated PRs pass in about a minute.
- The status-column and guard-trigger attacks run as the connection role for their setup steps, which the guard trigger sanctions (migration 367), inside the engine's always-rolled-back transaction.

## NOT done

- Routes ATTACKED (aud-at2:73, routes1:80): a scripted run of the 19 HYPOTHESIS route methods and the 25 service-client-write methods against `next start` with sessions of each persona on the local stack is not built; it needs a CI job that builds the app, boots the stack, mints per-persona sessions and carries the register as its input. [WORK: TESTS-2]
- Three consecutive CI runs of the split race test: the executor cites three CI runs after merge. [WORK: EXEC-4]
- AT1 item 6 view and function probes (derived_values_admissible, research_assessments_current, admin_set_judgement_drain) and the other lenses of subsystem 11. [WORK: TESTS-2]
- The remaining rows tagged TESTS-2 above (aud-at3:510 and 514, aud-at4:457, aud-at5:240, 241, 244, 247, 248, r11:144, s8b:24, s8c:31, audit-catalogue:43, daudit1:196 and 203, daudit2:173 to 175, sec4:69, aud-at2:74 and 75) were not started in this resume; each is a distinct build and none was attempted. [WORK: TESTS-2]

## Open items

- The closure gate (GATE-9 test in the Discipline engine unit tests) fails NEVER-RUN on source-monitoring.yml and spot-check-monthly.yml, both disabled_manually with out-of-window live runs, despite the platform-dormant note; not caused by this PR. Lane DORMANT-2 fixes the gate and the executor re-runs this PR after it merges. [WORK: DORMANT-2]
- The first CI run of the rls-persona-matrix job: 122 tables x 5 x 4 = 2440 cells held and five attacks held; the guard-trigger-alone attack was BROKEN by a privilege error on column reads in its SET expressions and was rewritten with constant right-hand sides plus a separate layer-1 control (coordinator ruling). The CLOSED rows marked from this job stay CLOSED only if the job is green on the final push, otherwise they become TESTS-2 rows. [NOT-WORK: the PR's own CI run is the proof, COMMON rule 9]
- (superseded note) The rls-persona-matrix job had not run yet: the matrix SQL, the fixtures' INSERTs and the two new attacks run on the stack for the first time in this PR's check. A red there is a finding about the schema or the probe, reported, not a reason to loosen an expectation. [NOT-WORK: the PR's own CI run is the proof, COMMON rule 9]
