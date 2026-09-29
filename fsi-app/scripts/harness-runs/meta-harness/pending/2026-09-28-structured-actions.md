## Change

Lane STRUCTURED-ACTIONS (2026-09-28) registers a new harness family,
`fsi-app/scripts/harness-runs/structured-actions/family.json`, for the structured-action extraction
tool (`scripts/turns/dry-run-structured-actions.mjs`, `src/lib/agent/extract-recommended-actions.mjs`).
This is a governing-file change for `meta-harness` per that family's own descriptor (any new
`family.json` moves what `scripts/harness-runs/governing-files.mjs` derives).

## Planned run

No new `meta-harness-run-NNN.json` artifact lands in this range. `meta-harness`'s own runs are the waves
that build or extend the meta-harness substrate itself (CONVENTION.md, run-artifact.mjs, F28,
governing-files.mjs); registering one more ordinary family under the existing convention is not itself
such a wave. The next `meta-harness` run supersedes this pending file whenever a future lane next changes
one of `meta-harness`'s own governing files (CONVENTION.md, PROPOSER-RUNBOOK.md, run-artifact.mjs, F28,
or governing-files.mjs itself) and lands the run documenting that change.
