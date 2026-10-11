# 2026-10-11 MIGTEST-2 (lane migtest2-header-from-map)

## Accomplished
- Defect confirmed on PR 1108 run 38112370846: `387_drop_caller_less_category_rpcs.test.mjs` asserted the literal `-- NOT APPLIED.` and the absence of a ledger version, so it went red at the executor's apply and flip.
- 387's header test now asserts `headerProblems(RAW, file)` from `supabase/migrations/_lib/applied-status.mjs`: the expected state is derived from APPLIED-MAP.json (row listed: APPLIED with that ledger version; not listed: NOT APPLIED). Green on master now (map has no 387 row, header NOT APPLIED) and after 1108 merges (map lists it, header flipped), by construction.
- New helper export `literalNotAppliedAssertions(text)`: reports each `assert.` line carrying the literal `NOT APPLIED` that is not a negative assertion.
- Helper test file: an ATTACK test (fixture test asserting the literal while the map lists the file is reported), a forms test (positive forms caught; negative assertions, test names, comments and the derived form not), and a committed-tree test that runs the check over every `supabase/migrations/*.test.mjs`.
- Sweep: only 387 asserted the literal positively (grep over `*.test.mjs`, case-sensitive and case-insensitive). 352 to 362 already used `headerProblems`; 374 to 382 assert the APPLIED form (survives the flip) and only use `doesNotMatch` for the literal. No other conversion owed.

## Red then green
- Helper tests with the new tests and no export: red (import error). With the export and old 387: the committed-tree test red, naming `387...test.mjs:16`. After converting 387: 25 of 25 pass (helper test file plus 387 test).
- Flip simulation in the worktree (header line 4 set to APPLIED with a version, a map row added, both reverted afterwards): old 387 test red (header test), new 387 test 6 of 6 green.

## Read and reused
- Read `_lib/applied-status.mjs`, its test, the 352 test, the 374 to 382 header tests, `APPLIED-MAP.json` tail. Reused `headerProblems` and `expectedHeaderFor` (MIGTEST-1, ENGINE-FIX-1); the new check is one added export in the same module, no second helper.

## Decisions
- The check lives in the helper and its own test file (the write set), run over the committed tests there; no new workflow or gate file.

## NOT done
- 374 to 382 keep their typed ledger versions in an APPLIED assertion; these survive a flip and are not the defect. [NOT-WORK: not the NOT APPLIED literal this lane's brief covers]

## Open items
- None. [NOT-WORK: no residue]
