## 2026-10-10, executor EXEC-4: harness ledger export regenerated (live-smoke rows)

### Accomplished

- Regenerated `fsi-app/.discipline/governance/harness-ledger-export.json` with `export-harness-ledger.mjs` (read-only SELECT): 247 runs, 22 families (239 before). The diff is 8 new `live-smoke` rows; no other family changed.
- Chain proof 7 (run 38020216226) recorded 0 local harness_runs rows and failed at "Apply the production schema dump to the oracle cluster": the roles filter refused a statement in the `supabase db dump --role-only` output (starts "RESET ALL;"). The oracle gate, role assertions, subset load, chain steps and attack suite were skipped. The failure is not in the ledger and the NEVER_RUN_DORMANT entry for chain-proof.yml stays until a fire passes.
