## Change

Lane CHAIN-1, 2026-10-07: .github/workflows/downstream-chain.yml (a downstream-chain governing file) changed. The chained resolve step now reads its upstream's artifact from harness_runs through scripts/lib/upstream-artifact.mjs instead of looking for a population/<run_id> or turn/<run_id> git branch that nothing pushes any more (chain-fire-2026-10-06 finding F2), exports the upstream run id so the row carries upstream_run_id (finding F3), and passes the guard the real requested mode (finding F5).

## Planned run

The next chained Downstream chain firing off Population turn or Corpus turn, dry, runs its real steps and lands a downstream-chain row with upstream_run_id set. That run supersedes this file; delete it when the run lands.
