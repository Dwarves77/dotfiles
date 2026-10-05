# 2026-10-05 Loop hops enforce fired

- Flipped `enforceFired` to true on two hops: `sweep-to-fetch-drain` and `ledger-consume-to-corpus-turn`.
- Evidence: `fsi-app/.discipline/governance/loop-fired-evidence.json` (exported from `harness_runs`, PR 938). fetch-drain-run-006 (trigger workflow_run, 2026-09-29) and corpus-turn-run-003 (trigger workflow_run_forced_dry, 2026-09-29). F50 accepts both triggers via FIRED_TRIGGERS.
- F50 standalone: PASS, 0 violations, "hops not yet enforced: 9". F50 test file: 22 of 22 pass.
- Nine hops remain unfired. The downstream-chain row is unmapped.
