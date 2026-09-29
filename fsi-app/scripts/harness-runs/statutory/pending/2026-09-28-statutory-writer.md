## Change

Lane STATUTORY-WRITER (2026-09-28) registered the new `statutory` harness family and wired
`scripts/propagation/write-statutory.mjs` to write a run artifact (and best-effort record it to
`harness_runs`) on every run, dry or apply. Governing files: `write-statutory.mjs`, `statutory-rows.ts`,
`validate-statutory-rows-file.mjs` (see `scripts/harness-runs/statutory/family.json`).

## Planned run

No DB credentials exist in this worktree (lane-common-contract, by design), so the CLI cannot land a real
run artifact against the live `harness_runs` table this session -- the same constraint lane
QUARANTINE-DISPOSITION hit the same day for its own family. The full `runWriter` flow (row write, artifact
write, harness_runs record) is proven end to end against injected fakes in
`scripts/propagation/write-statutory.test.mjs` (5 tests). The first real run lands the next time this CLI
is dispatched with live credentials against a reviewed, non-fixture `--rows-file` (a live data write held
under R14 regardless of this pending marker) -- that run supersedes this file.
