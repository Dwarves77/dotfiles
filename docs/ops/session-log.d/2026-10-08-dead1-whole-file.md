# 2026-10-08 DEAD-1 (dead1-whole-file): whole-file dead code deletions

Lane DEAD-1, branch `lane/dead1-whole-file`, rebuilt as one commit from origin/master `5c57faa2` (first built on `dfb215db`). Scope: whole-file deletions named by
census sections 1a, 1b, 1c, 3, 4a, 4b, 7a, 8, 8a of `dead-code-census-2026-10-08` (the census file is also on master
under `docs/audits/`, untouched). Exported-symbol pruning (census 2a, 2b) is DEAD-1b, not done here.

Method per file [CONFIRMED]: uncapped `git grep` for the path, the basename with and without extension, and exported
symbol names across src, scripts, .discipline, .github, supabase, docs, package.json and vercel config; hits in
point-in-time records (docs/audits, docs/ops, docs/plans, docs/dispatches, docs/design, docs/archive,
docs/PROGRAM-BOARD.md, session logs, migrations, fsi-app/docs audits) are historical and were left as written.
Where a hit was a runtime or a test the file stayed. The full suite, the npm-deps suite, the fitness runner, tsc,
eslint and `next build` were then run on the result; a test that reads a deleted route from disk was the one
failure the grep missed (see section 4a, LinkedIn).

## Totals

- 110 files deleted: 45 live-tree files (modules, tests, routes, seed scripts, one sidecar json) and 65 inert-store files
  (31 under `_archive`, 34 tracked under `fsi-app/scripts/tmp`).
- Edited (entries or docs lines naming a deleted file): F25 `LEGACY_ALLOWLIST` (9 entries), `exemptions.mjs` (1 entry removed,
  2 sibling reasons reworded), `test-discovery.mjs` (1 named selftest), `docs/specs/09-domain-extensions.md` (2 lines),
  `docs/tech-debt-log.md` (1 line), `docs/runbooks/CORPUS-TURN-RUNBOOK.md` (1 sentence),
  `fsi-app/docs/inventories/shared-dataset-ownership.md` (9 spots), `fsi-app/scripts/sources/README.md` (1 line),
  `fsi-app/.discipline/governance/coverage-report.json` (regenerated with `coverage-scan.mjs`, includes drift from
  other lanes' files since its last regeneration).
- No `.gitignore` change (see 1c). No inventory generator output changed: `docs/inventories/components.md` is manual and
  no component was deleted; `docs/inventories/migrations.md` is untouched by file deletions of this kind.

## Test counts (red then green is the suite)

| Run | Before (master tree) | After | Delta |
|---|---|---|---|
| `run-test-suite.sh` (no-npm suite) test files discovered | 689 | 683 | 6 files |
| `run-test-suite.sh` tests | 10266 (10218 pass, 1 fail, 47 skipped) | 10211 (10164 pass, 0 fail, 47 skipped) | 55 tests |
| `run-npmtest-suites.sh` tests | 1887 | 1864 (1864 pass) | 23 tests |
| fitness runner | 51 functions | 51 functions, 0 violations | 0 |

The before-run was executed in the main checkout read-only; it carried one failing test ("every shared-dataset writer
under scripts/, src/, and supabase/functions/ carries a SHARED-WRITER marker") that does not fail in this worktree; the
main checkout has untracked files this worktree does not, so that failure is environmental and not changed by this lane
[HYPOTHESIS: cause not isolated, not investigated further].

Deleted tests accounted for by file, counts measured by running each file on the master tree:

| Deleted test file | Tests |
|---|---|
| `scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.test.mjs` | 13 |
| `src/lib/llm/program-total.test.mjs` | 6 |
| `src/lib/sources/instrument-identity.selftest.mjs` | 4 |
| `src/__tests__/contracts-corridor-id.test.mjs` | 15 |
| `scripts/lib/liveness.selftest.mjs` | 5 |
| `scripts/_archive/lib/funded-release-plan.test.mjs` | 12 |
| subtotal no-npm suite | 55 |
| `src/lib/intake/census-writer.npmtest.mjs` | 12 |
| `scripts/lib/decision-anchors.npmtest.mjs` | 6 |
| `scripts/lib/exclusion-audit.npmtest.mjs` | 5 |
| subtotal npm-deps suite | 23 |

Archive-only selftests (`error-drop-probe`, `type-consumer-probe`) were never discovered by either suite.

## Census 1a: the 24 F25 LEGACY_ALLOWLIST entries

| # | Path | Decision | Evidence | Allowlist / docs |
|---|---|---|---|---|
| 1 | scripts/maintenance/repair-smoke-account.mjs | LIVE [REFUTED] | open item 24 on `docs/PROGRAM-BOARD.md` names it as an unrun repair command for the smoke account; the board is not this lane's to edit; an F23 exemption entry also names it | kept |
| 2 | scripts/turns/import-stranded-harness-branches.mjs | DELETED | hits only F25 entry, generated coverage report, comments, migration 331 comment (immutable); the import was executed by hand per `2026-09-27-harness-runs-db-design.md` | F25 entry removed; `shared-dataset-ownership.md` tombstoned |
| 3 | scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.mjs | DELETED with its test and its source-urls sidecar json | reversal completed 2026-10-01 per the board; only importer was its own test | F25 entry removed |
| 4 | scripts/turns/read-brief-export-queue.mjs | LIVE [REFUTED] | `scripts/drain/plan-drain.mjs:212` spawns it; `scripts/drain/kinds.mjs:154` lists it as an export argv | kept |
| 5 | scripts/turns/dry-run-structured-actions.mjs | LIVE [REFUTED] | `scripts/harness-runs/structured-actions/family.json` lists it in governing_files | kept |
| 6 | src/components/resource/SectorSynopsis.tsx | SKIPPED, doctrine | `fsi-app/.claude/CLAUDE.md` Sector Activation: "DO NOT remove `SectorSynopsisView`" (operator SHELVE ruling 2026-04-30) and F47 records the same; a doctrine prohibition is not a docs pointer and the file is outside this lane's edit grant | kept |
| 7 | src/lib/intake/census-writer.mjs | DELETED with its npmtest | only comment and docs hits; note it was W1 register #11 HOLD (crawl-rebuild scope) | F25 entry removed; inventory rows and CORPUS-TURN-RUNBOOK sentence updated |
| 8 | src/lib/intake/intake-url-corpus.mjs | LIVE [REFUTED] | imported by `src/lib/intake/intake-gates-golden.test.mjs:12`; named in F46 | kept |
| 9 | src/lib/llm/metered-gate.mjs | LIVE [REFUTED] | F69 exempt list line 31 and invariant RD-92 cite it and its test; W1 register #4 KEEP | kept |
| 10 | src/lib/llm/program-total.mjs | DELETED with its test | only F25 entry and prose mentions in `spend-guard.mjs` | F25 entry removed |
| 11 | src/lib/sources/instrument-identity.ts | DELETED with its selftest | comment hits only; `scripts/mint/lib/instrument-identity.mjs` is a different, live module and was not touched | F25 entry removed; `test-discovery.mjs` named-selftest entry removed |
| 12 | src/lib/contracts/corridor-id.mjs | DELETED with its test | importer was only its own test; migration 258 comments only | F25 entry removed; F23 exemption entry removed, two sibling exemption reasons reworded; spec 09 two lines |
| 13 | scripts/lib/decision-anchors.mjs | DELETED with its npmtest | only importers were archived files and its test | F25 entry removed; inventory row tombstoned |
| 14 | scripts/lib/exclusion-audit.mjs | DELETED with its npmtest | same | F25 entry removed; inventory row tombstoned; `scripts/sources/README.md` line updated |
| 15 | scripts/lib/inconclusive-probe.mjs | LIVE by CI test | `.github/workflows/bug-class-guard.yml:50` runs `inconclusive-probe.npmtest.mjs` in the HARD job on purpose (coordinator ruling: expansion DENIED) | kept |
| 16 | scripts/lib/liveness.mjs | DELETED with its selftest | only importers were archived files and its test | F25 entry removed; inventory row tombstoned |
| 17 | scripts/lib/batch-primitives.mjs | LIVE [REFUTED] | pinned skill `remediation-discipline/SKILL.md` lines 193, 227, 626 name it the reference implementation; editing a pinned skill needs a skill-ack outside this grant | kept |
| 18 | src/components/figures/StatutoryFigure.tsx | SKIPPED, normative spec | `docs/specs/08-flywheel-design.md` lines 517 and 660 define it as spec Layer 4; not a pointer line | kept |
| 19 | src/lib/statutory/types.contractable-barrier.check.ts | SKIPPED, normative proof | spec 08 line 660 names it as the compiled proof of Layer 2; it is part of the `tsc --noEmit` input set by design | kept |
| 20 | scripts/_ruling/null-tier-host-ruling.mjs | LIVE [REFUTED] | imported by `src/lib/sources/host-authority-ruling-conformance.test.mjs` | kept |
| 21 | scripts/lib/is-main-fixture.mjs | LIVE [REFUTED] | spawned by `scripts/lib/is-main.test.mjs` | kept |
| 22 | src/test-support/fake-supabase.mjs | LIVE [REFUTED] | referenced by 5 files under fsi-app (tests) | kept |
| 23 | scripts/producers/regional/state-cost-facts-producer.mjs | LIVE [REFUTED] | `scripts/harness-runs/state-cost/family.json` governing_files; `scripts/lib/r14-held-producer-cli.mjs` shared extraction | kept |
| 24 | scripts/producers/market/carrier-ets-surcharge-producer.mjs | LIVE [REFUTED] | `src/lib/market/series-registry.mjs:119` `producerScript` string; `harness-runs/carrier-ets-proxy/family.json` | kept |

## Census 1b: modules reachable only from dead modules

| Path | Decision | Evidence |
|---|---|---|
| scripts/lib/drift-check.mjs | LIVE by CI test | imported by `scripts/lib/surface-registry.mjs:25`; the chain is executed by `bug-class-guard.yml:50` (inconclusive-probe.npmtest.mjs, HARD job) |
| scripts/lib/fetch-negative-probe.mjs | LIVE by CI test | imported by `scripts/lib/inconclusive-probe.mjs:35` (kept, row 15) |
| scripts/lib/surface-registry.mjs | LIVE by CI test | imported by `inconclusive-probe.mjs:34` and `fetch-negative-probe.mjs:36` |
| scripts/lib/verify.mjs | LIVE by CI test | imported by `surface-registry.mjs:26` |
| src/components/resource/IntelligenceBrief.tsx | SKIPPED | imported only by SectorSynopsis.tsx, which stays (row 6) |
| src/components/resource/IntelligenceMetadataStrip.tsx | SKIPPED | same; also named in `fsi-app/.claude/CLAUDE.md` Key Files |
| src/lib/contracts/verbatim-grounding.mjs | LIVE [REFUTED] | re-exported by the two envelope modules below |
| src/lib/market/carrier-ets-surcharge-envelope.mjs | LIVE [REFUTED] | imported by the kept producer (row 24), 3 tests, `series-registry.mjs` |
| src/lib/regional/state-cost-facts-envelope.mjs | LIVE [REFUTED] | imported by the kept producer (row 23) and its test |

## Census 1c: inert-by-construction stores

| Row | Decision | Evidence |
|---|---|---|
| 31 tracked files under `fsi-app/scripts/_archive` and `fsi-app/src/_archive` | DELETED | only mentions outside the directories are scope-exclusion constants in fitness functions (harmless, left), prose in the shared-dataset inventory (updated) and a historical ledger |
| 34 tracked files under `fsi-app/scripts/tmp` | DELETED | `.gitignore:25` already ignores `fsi-app/scripts/tmp/` (confirmed with `git check-ignore`), so no pattern was added; the only name hits are two comments in migrations 070 and 087 (immutable) |

Archive removal also dissolves the "orphaned by archive" cluster: their only other importers were archived files.

## Census 3: components

| # | Component | Decision |
|---|---|---|
| 1 | SubTabBar (AccountPrimitives.tsx) | not whole-file (live file), left for DEAD-1b |
| 2 | EstimatedFigure (EstimatedFigure.tsx) | not whole-file (live sibling export DerivedFigure), left for DEAD-1b |
| 3 | StatutoryFigure | SKIPPED, row 18 |
| 4 | SectorSynopsisView | SKIPPED, row 6 |
| 5 | IntelligenceBrief | SKIPPED, 1b |
| 6 | IntelligenceMetadataStrip | SKIPPED, 1b |

No component file was deleted, so `docs/inventories/components.md` was not regenerated or edited.

## Census 4a: routes (4b method: no vercel cron, workflow or runbook calls these)

| # | Route | Decision | Evidence |
|---|---|---|---|
| 1 | /api/admin/users | LIVE [REFUTED by PR 1006] (deleted in an earlier build of this lane, then kept; this commit never touches it) | lane SEC-5 (PR 1006, cut after this lane base) now calls it from `admin/page.tsx`; the route had no test file and no allowlist entry to restore |
| 2 | /api/auth/linkedin/start | LIVE [REFUTED] after the suite ran | deleted first, then restored; its sibling callback is read from disk by `supabase/migrations/367_profiles_status_columns.test.mjs:240` and named by migrations 364 and 367 as the writer of the privilege columns; the start route and `logic.ts` (F46 host home for www.linkedin.com) are the unit's entry, kept with it |
| 3 | /api/workspace/members | DELETED | only comments in `OwnerTeamCard.tsx` and `item-collab-shared.mjs` |
| 4 | /api/version | LIVE [REFUTED] | operator-approved public route in `fsi-app/.claude/CLAUDE.md`; ADR-029 verification step is `curl .../api/version` |
| 5 | /api/auth/linkedin/callback | LIVE [REFUTED] | see row 2 |
| 6 | /api/intelligence-items/[id]/metadata | SKIPPED | only caller is IntelligenceMetadataStrip (kept) |

4b (8 routes reached by a workflow, script or runbook): untouched, live by definition.

## Census 7a: scripts

| # | Path | Decision | Evidence |
|---|---|---|---|
| 1 | scripts/coordinator/lane-gate-cloud.sh | LIVE [REFUTED] | `docs/dispatches/lane-common-contract.md` instructs cloud lanes to run it |
| 2 to 26 | the 25 files under `fsi-app/supabase/seed/` named in the census (W4_2, W4_3, W4_4, add-building-standards, add-source-registry, apply-116-117, apply-120, apply-122-institutions, apply-123-source-label, apply-124, apply-access-method-3-source-remediation, audit-orphan-staged-updates, audit-source-attribution, backfill-missing-provisionals, canonical-source-classify, cost-projection, generate-seed.ts, spot-check-all-h-tier, sprint4-111, sprint4-112, sprint4-115, sprint4-provenance-distribution, test-extract-sections, url-health-check, verify-end-to-end) | DELETED | zero code, workflow, runbook or package.json references for 23; `W4_3` named by one tech-debt line (updated); `verify-end-to-end.mjs` named by a comment in `.gitignore` line 4 (left, `.gitignore` is outside the grant for this item); none reference sources.api_* |
| 27 | scripts/remediate-rule14.mjs | DELETED | named only by `docs/ops/session-log.d/2026-10-01-r10-relabel.md` (historical) |

The repo-root `scripts/` directory is now empty and no longer exists in the tree.

## Census 8 and 8a: workflows

| Workflow | Decision | Evidence |
|---|---|---|
| data-audit-lane.yml | LIVE [REFUTED] | runs `run-data-audit-lane.mjs`, which the execution-wiring gate counts as the wiring for the 45 marker-carrying verifiers; named in `secrets-registry.mjs` and CLAUDE.md rule 15 |
| source-monitoring.yml | LIVE [REFUTED] | ADR-015 names it as the re-arm point; `secrets-registry.mjs` consumers; comments in the check-sources route |
| spot-check-monthly.yml | LIVE [REFUTED] | `secrets-registry.mjs` consumers; ADR-015; `inconclusive-probe.mjs` audit table |
| chain-proof.yml | LIVE [REFUTED] | `family.json`, `closure-gate.mjs`, `chain-proof-workflow.test.mjs` reads it, ADR-045, runbook 64 |

No `workflow_run` edge names any of the four; F50 and F52 do not list them. Nothing deleted.

## Read and reused

Read: root `CLAUDE.md`, `docs/dispatches/lane-common-contract.md`, census sections 1a, 1b, 1c, 3, 4a, 4b, 7a, 8, 8a, the F25
module, `exemptions.mjs`, `test-discovery.mjs`, `coverage-scan.mjs`, `run-test-suite.sh`, `run-npmtest-suites.sh`, the
shared-dataset inventory sections that name the files. Reused, not rebuilt: F25's stale-entry check as the removal
oracle, F46/F23/F25 as the verification gates, `coverage-scan.mjs` as the generator for the coverage report, and the
repo's own suite runners for the counts.

## NOT done

- Census 2a and 2b (symbol pruning): DEAD-1b.
- Rows skipped above for a live hit, doctrine or normative spec text. Coordinator rulings after the first push: the
  bug-class-guard.yml line 50 expansion is DENIED (live by CI test); the SectorSynopsis family, StatutoryFigure and
  contractable-barrier skips are correct; the census-writer deletion stands.
- Comment lines naming deleted modules in `skill-map.mjs`, `apply-mint-batch.mjs`, `run-source-sweep.mjs` and the
  `.gitignore` line 4 comment were edited under a coordinator grant (comments only). Other comments in live files
  that mention deleted modules were not touched.

## Open items

- `census-writer.mjs` was a W1 register HOLD (crawl-rebuild scope). If the source-loop wave wires it, restore with
  `git checkout <this branch's parent> -- fsi-app/src/lib/intake/census-writer.mjs fsi-app/src/lib/intake/census-writer.npmtest.mjs`
  and re-add the F25 entry.

## Follow-up facts for a later lane: F64 live test vs C3 temporary fixture [CONFIRMED]

Not fixed here, by ruling. Seen in both of two runs of `DISCIPLINE_PREPUSH_FULL=1 DISCIPLINE_HOOK_TRAMPOLINE=1 sh fsi-app/.discipline/hooks/pre-push` (its step 3 runs `run-test-suite.sh`); absent when `F64-rls-admin-gate-class.test.mjs` runs alone (20 of 20 pass), in a plain `run-test-suite.sh` run, and in CI on PR 1007.

- Fixture path C3 writes: `fsi-app/supabase/migrations/999999_c3_test_fixture_never_committed.sql`, written by `withFixtureFile()` in `fsi-app/.discipline/consistency/checks/C3-migrations-reality.test.mjs` (lines 22 to 30: `writeFileSync`, then `rmSync` in a `finally`).
- Reader that races it: the test `LIVE: the real migration corpus passes F64 clean under the two dated allowlists` at `fsi-app/.discipline/fitness/functions/F64-rls-admin-gate-class.test.mjs:244`, which lists `fsi-app/supabase/migrations` with `readdirSync` and then reads each file. `src/lib/supabase-server-rpc-scope.test.mjs:219` already skips that fixture name by hand.
- Failure output, run 1 (1462.5874 ms): `ENOENT: no such file or directory, open` on the fixture path under the worktree's `fsi-app\supabase\migrations`, with `errno: -4058, code: 'ENOENT', syscall: 'open'`; then `tests 10211, pass 10163, fail 1`.
- Failure output, run 2 (1449.7171 ms): the same ENOENT, same path, same test line, same totals.
- Reproduction on the unchanged master tree (main checkout, no edits): `node --test` on `F64-rls-admin-gate-class.test.mjs` and `C3-migrations-reality.test.mjs` together failed in 1 of 3 runs, so the race is intermittent on master and independent of this lane. In this worktree the follow-up `run-test-suite.sh` runs failed with the same single F64 test twice (10211 tests, 10163 pass, 1 fail) while the first-commit run and CI on PR 1007 passed.

## Rule 022 scoping defect [CONFIRMED]

Observed while committing a follow-up that restored `fsi-app/src/app/api/admin/users/route.ts` byte-for-byte as it is on origin/master. The pre-commit rule 022 (no dash or section-sign glyphs in added prose) treated the restored file as new text because it scopes against the previous commit, not the merge base with master, so three existing comment lines in that file were flagged. Hook output, verbatim:

```
FAIL  [022] No dash/section-sign glyphs in added prose
      3 added line(s) contain a banned dash/section-sign glyph (U+2014, U+2013, or U+00A7).
      Offending lines:
          fsi-app/src/app/api/admin/users/route.ts: // POST /api/admin/users <em dash> create a user and assign to org
          fsi-app/src/app/api/admin/users/route.ts: // supplies one. No silent fallback to a dev org <em dash> if neither is available,
          fsi-app/src/app/api/admin/users/route.ts: // GET /api/admin/users <em dash> list org members
Summary: 3 pass, 1 fail, 3 skip (of 7 rules).
```

The coordinator ruled option 2: the lane branch was rebuilt as one commit from origin/master `5c57faa2` that never touches `admin/users`, and force-pushed with lease; PR 1007 keeps its number. The rule defect is for a separate lane.

## Verification of the rebuilt tree (base `5c57faa2`) [CONFIRMED]

- `tsc --noEmit` clean; `eslint .` 0 errors (one unused-directive warning in the untracked, build-generated `.well-known/workflow/v1/flow/route.js`); `next build` passes; fitness runner 51 functions, 0 violations.
- No-npm suite: 10262 tests, 10215 pass, 0 fail, 47 skipped (the F64 versus C3 race did not hit on this run). The earlier counts above were measured on base `dfb215db`; master gained tests from PRs 1003 and 1008 since.
- npm-deps suite: 1899 tests, 1899 pass.
- `F64-rls-admin-gate-class.test.mjs` run alone: 20 tests, 20 pass.
