# 2026-10-04 Loop firing evidence exported from harness_runs

- Produced by `node scripts/verify/export-loop-fired-evidence.mjs --write --out <worktree>/fsi-app/.discipline/governance/loop-fired-evidence.json`, run from the main checkout's fsi-app (the `--out` option landed in PR 936, GATES-2). The main checkout stayed clean.
- Exporter output, exact:
  - `40 harness_runs row(s) read, 2 of 11 hop(s) have fired.`
  - `FIRED  sweep-to-fetch-drain  fetch-drain-run-006  workflow_run  2026-09-29T12:31:56.324+00:00`
  - `FIRED  ledger-consume-to-corpus-turn  corpus-turn-run-003  workflow_run_forced_dry  2026-09-29T18:26:30+00:00`
  - `none` for: sweep-to-ledger-consume, ledger-consume-to-population-turn, population-turn-to-downstream-chain, corpus-turn-to-downstream-chain, downstream-chain-to-propagation-drain, data-producers-to-propagation-drain, population-turn-to-brief-export, brief-apply-to-gate-a-rescan, population-turn-to-gate-a-rescan.
  - `UNMAPPED  downstream-chain-run-001: family "downstream-chain" serves 2 hops and the row has no upstream_run_id` (left unmapped, not claimed).
- Entries written: 2.
- F50 (`fitness/runner.mjs --function=F50`): PASS, `hops not yet enforced: 11`. F50 prints a count, not a per-hop line. Per hop: all 11 carry `enforceFired: false` in `loop-hops.d/`, so none consults the evidence yet; all 11 have `enforceEdge: true`. `F50-loop-wiring.test.mjs`: 22 of 22 pass.
- Hops the evidence would now allow to flip `enforceFired` (no flag changed in this PR): `sweep-to-fetch-drain` (01) and `ledger-consume-to-corpus-turn` (04). The other 9 have no entry; hops 07 and 08 additionally carry notes that their real event is workflow_dispatch by construction (F60 covers them).
- The data-audit lane's hard audit of this file (`loop-fired-evidence-audit.mjs`) runs only where database secrets exist; whether it ran in this PR's CI is recorded in the PR report.
- UX compliance: not applicable, no .tsx or .css touched.
