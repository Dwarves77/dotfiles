## 2026-10-09, executor EXEC-3: harness ledger export regenerated again (live-smoke rows)

### Accomplished

- Regenerated `fsi-app/.discipline/governance/harness-ledger-export.json` with `export-harness-ledger.mjs` (read-only SELECT): 239 runs, 22 families (232 in PR 1063). The diff is 7 new `live-smoke` rows, written by the Live smoke recorder on master pushes since 1063; no other family changed.
- Chain proof 6 (run 37894782168) is not in the ledger: it recorded 0 local harness_runs rows and failed at the oracle apply (role "reconciler" does not exist).
