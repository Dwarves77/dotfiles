# Pending run — mint

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`mint` family's governing files re-hash to a value no landed artifact records. This marker acknowledges
the change and names the planned run that supersedes it, per that rule's own escape hatch.

**What changed (2026-09-02, after population-turn runs #9–#11 — `mint-run-011..013`, 122 minted):**
`MINT-RUNBOOK.md` §11 now documents that the relevance screen is part of the export: those three runs
selected on `dryrun_disposition = 'would_mint'` alone and minted about half off-vertical items against
the operator's 2026-08-31 screen ruling. The gate (`export-census-rows.mjs` → `lib/screen-verdict.mjs`)
and the post-apply reconciliation (`screen-reconcile-records.mjs`) are runtime code, not kit governing
files; only the runbook prose moved the hash. The validator and record-facts are byte-for-byte unchanged.

**harness_version at write time:** `sha256:30b7b55f5a299f92`

**The planned run that supersedes this marker:** the next `population-turn` apply dispatch, which
archives the off-vertical items already minted and exports only screened rows; its artifact re-hashes
to this value and lands as `mint-run-014.json`, at which point this marker is stale-by-match and must be
deleted per F28's reverse-audit.
