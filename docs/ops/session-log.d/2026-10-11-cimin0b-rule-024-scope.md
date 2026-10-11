# 2026-10-11, lane CI-MIN-0b (cimin0b-rule-024-scope): rule 024 applies only to commits made after it landed

## Accomplished

1. **Defect confirmed**: PR 1097 run 38106594677 failed three `FAIL [024]` on `WIP cifix2: ...` commits authored 2026-10-10, before rule 024 existed (PR 1102 merged as ab3dcaa87). CI's validate-commits job walks every commit of merge-base..head, so the rule was retroactive for every open PR.
2. **Rule 024 cutoff** (`fsi-app/.discipline/rules/024-wip-commit-skips-ci.mjs`): constant `RULE_024_LANDED = '2026-10-11T02:52:00Z'`. In per-commit CI mode (the context carries a commit sha) a commit whose committer date (`git log -1 --format=%cI`) is before the instant is SKIPPED with reason `commit predates the rule`, printing `024 skip: commit predates the rule`. An unreadable or unparseable date is judged, never skipped. commit-msg mode (no sha) and the whole-range squash-parity pass (no sha) are unchanged.
3. **Tests** (`024-wip-commit-skips-ci.test.mjs`, 16 pass): fixture level (WIP without token dated 2026-10-10 skipped, dated 2026-10-12 or at the cutoff fails, normal commit passes either side, unparseable date judged) and real git with `GIT_COMMITTER_DATE` through the real runner in CI mode and commit-msg mode (WIP without token fails regardless of date). Red-then-green: against master's rule file the test file fails to load (`RULE_024_LANDED` export missing); with the change, 16 pass.
4. **Invariant** `RD-98-wip-commit-skips-ci` text states the cutoff in one sentence.

## Read and reused

Read: COMMON, the brief, rule 024 and its test, `lib/result.mjs` (`skip`), `lib/context.mjs` (`commitSha`, `getRepoRoot`), `runner.mjs` (`runCiRange`, skip printing), the validate-commits steps of `discipline.yml`. Reused: the engine's `skip()` verdict and `getRepoRoot`; no second mechanism and no engine change.

## Decisions

- The committer date is the cutoff key, as the brief states. A pre-rule WIP commit that is later rebased gets a new committer date and is then judged; update-branch by merge (the CI path) keeps the dates.

## NOT done

- Rewording history of the six open PRs. [NOT-WORK: the cutoff makes it unnecessary]
