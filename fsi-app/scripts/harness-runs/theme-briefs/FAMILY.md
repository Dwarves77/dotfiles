# theme-briefs family

Registered by lane S3-C, 2026-10-04. Two runtimes, one family: `scripts/turns/export-themes-for-briefs.mjs`
(read-only: lists the themes that need a brief and writes the bundle a session lane authors from) and
`scripts/turns/apply-theme-briefs.mjs` (validates a committed `theme-briefs-NNN.json` batch and writes
`theme_briefs` through the guarded path). `.github/workflows/theme-briefs.yml` dispatches both
(`workflow_dispatch` only, no schedule, build mode). The batch contract is
`scripts/turns/theme-briefs/README.md`.

Each run writes one artifact (`scripts/turns/theme-briefs/artifact.mjs`); `config.action` is `export` or
`apply`. The workflow's final step lands it into `harness_runs`
(`scripts/turns/deliver-artifact-branch.sh`).

**Standing metric.** Export: themes needing a brief, split by reason (no brief, stale, superseded by a
drifted theme id), and how many members and claims the character budget omitted. Apply: entries applied
versus refused, with every refusal reason in `per_item`, so a proposer pass reading the history sees whether
authored batches are passing the validator and which refusal class recurs.

`pending/2026-10-04-s3c.md` records why the family starts at zero artifacts.
