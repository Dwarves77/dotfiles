# 2026-10-08 lane GATE-5 (gate5-baseline-and-race): the rules engine baseline, and the C3 / F64 race

Brief: scratchpad briefs-2026-10-04/gate5.md. Two gate defects found by DEAD-1 (PR 1007), fixed at the cause.

## 1. Rules engine baseline

Before [CONFIRMED, DEAD-1 session log and the code]: `ctx.introducedLines` was built from `git diff --cached` (index against HEAD) at commit-msg and `git show` (commit against its parent) in CI. "Introduced" therefore meant "not in the previous commit". A byte-identical restore of a master file, on a branch whose earlier commit had deleted it, read as a new file and rule 022 charged its glyphs.

After:
- `fsi-app/.discipline/lib/baseline.mjs` (new) is the one function, `resolveBaseline`. Staged: merge base of HEAD with `origin/<BASE_REF or master>`; commit (CI): merge base of that sha. The merge base itself comes from the existing `resolveRange` in `change-range.mjs` (reused, not copied). `lib/context.mjs` loads its one diff against it (`git diff --cached <base>`, `git diff <base> <sha>`); a range context keeps its own range, already a merge-base diff. Every rule reads `ctx.introducedLines` / `ctx.stagedFiles`, so every rule reads the one baseline, and no rule file was touched.
- Named fallbacks to the previous commit (never silent): no `origin/<base>` ref, HEAD or sha does not resolve, no common ancestor. A commit already on `origin/<base>` (push to master) also uses its parent, because its merge base is itself and the diff would be empty.
- `runner.mjs` prints `Baseline: <label>` for every context and writes it as a `baseline` field on every firing-log row. It also passes `cwd: getRepoRoot()` to `resolveRange` (before, it resolved against the engine's own checkout, which differs from the repo under test only in tests).
- Real firing-log row from this lane's own commit (`.hook-firings.log`): `{"ts":"2026-10-08T08:33:24.961Z","rule":"012","mode":"commit-msg","path":null,"line":null,"verdict":"PASS","baseline":"merge base with origin/master (5c57faa2)"}`. A FAIL row from the e2e test: `{"rule":"022","mode":"commit-msg","path":"docs/notes/fresh.md","line":1,"verdict":"FAIL","baseline":"merge base with origin/master (5a013def)"}`.

Tests (red then green, [CONFIRMED]): the new `runner.test.mjs` e2e tests run against `origin/master`'s `context.mjs` and `runner.mjs` failed 9 of 20 (restore passing 022 and 012; moved block across two commits; CI `--commit` restore; PR delete-then-restore walk including the range pass; push-to-master commit not an empty diff; the baseline label and log field). Against the new code 20 of 20 pass. Negative cases covered: a new glyph line beside a restore still fails and only the new line is charged; a restore that edits in a new glyph fails; the no-origin/master fallback charges the restore and says why; a different home path still fails 012. `lib/baseline.test.mjs` (11 tests) covers staged, commit, BASE_REF, moved origin, and each fallback. `lib/context.test.mjs` gained one real-git test (one diff load, baseline merge-base, restore introduces nothing).

Behavioural consequence, disclosed: the commit-msg diff now includes earlier commits of the same branch, so a glyph committed earlier on the branch (for example with `--no-verify`) is charged again by later commits, as it will be by the squash-parity range check in CI. The per-commit CI walk likewise charges cumulative branch content; the verdict for a PR is unchanged (it already failed on the range pass).

## 2. C3 fixture isolation

Before [CONFIRMED]: the C3 test wrote `999999_c3_test_fixture_never_committed.sql` into the real `fsi-app/supabase/migrations/` (and hand-edited the real `docs/inventories/migrations.md`) while F64's live test enumerated and read that directory. Old C3 test and F64 test run concurrently 10 times, with an observer polling the real directory: 6 of 10 rounds failed with F64 `ENOENT`; the observer saw the fixture in the real directory 1876 times.

After: `consistencyCheck.run({ migDir, docPath })` takes injected paths (defaults are the real tree, the consistency runner still calls `run()` with none). The C3 test runs its negative cases on a temp copy under the OS temp directory and asserts the real directory and page were never touched. The last test in the file is the runner script the brief asked for: it starts this file (guarded by `C3_RACE_CHILD` so it does not recurse) and F64's test file concurrently 10 times while polling the real tree; it fails on any child failure or any sighting. Result: 10 rounds, 0 failures, 0 sightings (about 41 s). F64's live test only reads the real tree and writes nothing, so no change was needed in it.

A first version of the runner went green in under a second for ten rounds: `NODE_TEST_CONTEXT` is set inside `node --test`, and a nested `node --test` that inherits it runs nothing. The runner now deletes that variable from the child environment and asserts each child reported passing tests.

## Read and reused

Read: root CLAUDE.md, `docs/dispatches/lane-common-contract.md`, the DEAD-1 session log (from `origin/lane/dead1-whole-file`), the GATE-1 session log, `lib/context.mjs`, `runner.mjs`, `lib/change-range.mjs`, rules 012 and 022, `hooks/commit-msg`, `discipline.yml` engine steps, C3 and its test, `scripts/inventories/generate-migrations-inventory.mjs`, F64 and its test, `run-test-suite.sh` / `test-discovery.mjs`. Reused: `resolveRange` (merge-base), the existing `introducedLines` / moved-line machinery, the existing e2e helpers in `runner.test.mjs`, the generator's `buildRows` / `buildInventoryPage` through C3.

## NOT done / open items

- The one comment line in `fsi-app/.discipline/manifest.mjs` listing the firing-log keys was granted by the coordinator after the first push and now lists `baseline`; nothing else in that file changed.
- No rule's substance changed; fitness runner, migrations and workflows untouched. The workflow already exports `BASE_REF` and `PR_HEAD` to the engine, so no workflow edit was needed.
- Full suite and fitness runner not run locally (CI is the gate, ADR-040).
