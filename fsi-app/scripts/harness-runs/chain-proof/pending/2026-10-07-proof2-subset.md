## Change

Lane PROOF-2 (2026-10-07) edited the governing file `.github/workflows/chain-proof.yml`: the export step now holds
only NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD (step-scoped; SUPABASE_SERVICE_ROLE_KEY removed, it was unused),
and passes `--pin-ids-from` (the smallest committed record-briefs batch) to `scripts/proof/export-subset.mjs`. The
subset export and load scripts (`export-subset.mjs`, `load-subset.mjs`, `mem.mjs`) are new, proven on fixtures only.

## Planned run

The coordinator's first dispatch of `chain-proof.yml` (see `2026-10-07-proof1-stack-and-replay.md`). That run supersedes
this marker; delete it in the change that lands the run.
