# 2026-10-10, lane TESTS-2 (tests2-owed-tests-residue): routes ATTACKED and the owed test residue

Work in progress entry, completed before the final push. Rows: the `[WORK: TESTS-2]` lines on origin/master.

## Accomplished

1. Routes ATTACKED runner (`fsi-app/scripts/verify/attacks/routes-attacked.mjs`, personas in `fsi-app/scripts/verify/fixtures/route-personas.mjs`): reads the AT2 register, sends one request per route method per persona to `next start` on the local stack, holds the COVERAGE, TOKENS, ANON, ADMIN, WORKER and WRITES invariants. 19 unit tests with an attack on the attacker for each leak.

## NOT done

- Work in progress. [NOT-WORK: placeholder replaced before the final push]
