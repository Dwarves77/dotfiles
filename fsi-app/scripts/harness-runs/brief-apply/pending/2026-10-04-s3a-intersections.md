## Change

Lane s3a-intersections (2026-10-04): `scripts/turns/apply-record-briefs.mjs`, a governing file of this family,
changes in comments only. They now say the batch-level unscoped flywheel steps run in the plan's own order
(tag proposals and ratification first, then analyze-corpus and derive-obligations). No code and no per-item
step order changed.

## Planned run

The next `.github/workflows/brief-apply.yml` dispatch, landing the next `brief-apply-run-NNN.json`. Delete
this file the moment that artifact lands.
