## 2026-10-11, lane GATE-PUSH-1b (gatepush1b-prepush-attacks): TESTS-2's pre-push step attacks fixed for the GATE-PUSH-1 hook

### Accomplished

- Cause confirmed: PR 1101 (TESTS-2) and PR 1106 (GATE-PUSH-1) each passed alone and merged minutes apart. On run 38111106652 the fixture in `fsi-app/.discipline/hooks/pre-push-step-attacks.test.mjs` copied only `pre-push` and `lib/prepush-logdir.sh`, so the hook stopped at step 0e with `pre-push: 212: .: cannot open .../lib/final-push-tier.sh: No such file`; 16 of 16 tests failed (also reproduced locally on origin/master 17109cdb9: 0 of 16 pass).
- Fixture fix only, hook unchanged: `final-push-tier.sh` is copied into the throwaway repository, and `runHook` takes an optional git stdin line (`refs`, default empty push as before).
- Two tests added for the new behaviour: a final push (tip without a skip token) with the opt-in off runs exactly steps 2, 2b, 3d, 3e and a failing 3d or 3e blocks; a WIP tip runs neither. Result: 18 of 18 pass.

### Read and reused

- Read the whole attack test file, the merged hook and `lib/final-push-tier.sh`. Reused the file's own stub-step fixture and trace mechanism.

### Decisions

- No hook change: the failures were a fixture missing a sourced library, not a regression (the hook passes all 16 original cases once the library is copied).

### NOT done

- None. [NOT-WORK: nothing owed by this lane]

### Open items

- None. [NOT-WORK: nothing owed by this lane]
