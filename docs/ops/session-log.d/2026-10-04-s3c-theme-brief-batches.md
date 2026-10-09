# 2026-10-04 s3c-theme-brief-batches (lane S3-C)

Lane S3-C: theme briefs become a batch pattern with a real contract. Branch `lane/s3c-theme-brief-batches`,
cut from origin/master `ac066e61` (includes PR 935). Fixtures only: no database, no network, no data written.

## Accomplished

- Export `scripts/turns/export-themes-for-briefs.mjs`: read only; lists themes with no brief, a stale brief or
  an orphaned brief under a drifted id (`superseded`, with `supersedes_theme_id`); one bundle file per run to
  `--out-dir`; per member summary, grounded FACT claims, forward events; edges with full basis; gaps from
  `gaps.mjs`; per-theme character budget with a `truncation` block. Exit 2 without credentials.
- Batch contract `scripts/turns/theme-briefs/`: README, `schema.mjs` (pure validator: ten refusal classes,
  whole-entry), `data.mjs` (shared reads and bundle assembly), `artifact.mjs`, `fixture-deps.mjs` (in-memory
  database for `--fixture`), fixtures (`corpus.fixture.json`, `theme-briefs-000.fixture.json`).
- Apply `scripts/turns/apply-theme-briefs.mjs`: dry by default, `--execute` writes through `guardedInsert` or
  `guardedUpdate` and reads back; `generated_by` is the batch name; refused entries are residue, never a block.
  It is the one writer of `theme_briefs` (carries the `SHARED-WRITER` header).
- `generate-theme-brief.mjs`: `--theme` prints the shared bundle; `--write` routes through the same validator
  and writer (structured payload gets the full validator; a legacy `brief_md` payload keeps the hash check and
  `generated_by='session-executor'`). Its own `SHARED-WRITER` header and `buildBriefBundle` were removed (the
  shared builder replaces it; its two tests were replaced by `runTheme` tests).
- Continuity: `resolveBriefForTheme` in `src/lib/connections/brief-staleness.mjs` (exact id, else best overlap
  at `theme-delta.mjs`'s threshold, else the latest run's `theme_delta` lineage; anything not under its own id
  is stale with `supersedes_theme_id`). `theme-delta.mjs` now exports `OVERLAP_THRESHOLD`,
  `overlapCoefficient`, `lineageFromThemeDelta`. `src/lib/research/theme-brief.mjs` uses it.
- Migration 351 (NOT APPLIED): nullable `sections jsonb`, `claims jsonb`, `member_ids uuid[]` on
  `theme_briefs`. `docs/inventories/migrations.md` regenerated with its generator.
- Harness family `theme-briefs` (`family.json`, `FAMILY.md`, pending marker), workflow
  `.github/workflows/theme-briefs.yml` (dispatch only, chained-dry-guard step, no schedule, nothing chained),
  runbook `docs/runbooks/maintenance.d/23-generate-theme-brief.md` gained the batch flow.

## Read and reused

Read in full: `generate-theme-brief.mjs` and its test, `brief-staleness.mjs`, `theme-delta.mjs`,
`theme-stats.mjs`, `gaps.mjs`, `src/lib/research/theme-brief.mjs`, migrations 266, 276, 280 (253 and the
register's account of it), `docs/dispatches/lane-common-contract.md`, `harness-runs/CONVENTION.md`, the
brief-export and brief-apply workflows, `emit-brief-export-artifact.mjs`, `record-harness-run.mjs`,
`deliver-artifact-branch.sh`, `db.mjs` write helpers, the shared-writer registry test, the analysis
construction and environmental policy skills. Record-briefs README, `schema.mjs` and apply driver read for
structure. Reused, not rebuilt: `computeMemberHash`, `detectGaps`, `surfaceOf`, `diffThemes` overlap
definition, `writeRunArtifact` / `claimRunId` / `buildRunArtifactEnvelope`, `readAll` / `readAllByIds`,
`guardedInsert` / `guardedUpdate`, `isMainModule`, `loadLocalEnvFile`, `deliver-artifact-branch.sh`,
chained-dry-guard. Registries edited: none by hand (the family registry, governing-files and run-artifact
family list are derived from the new `family.json`; the shared-writer registry is derived from the
`SHARED-WRITER` headers; no new secret). The `docs/inventories/shared-dataset-ownership.md` prose was not
edited (outside the write set; see open items).

## Decisions (by rule, none waiting on an operator)

- `theme_briefs` stores only a hash of the membership, so overlap cannot be computed from it. Migration 351
  therefore adds `member_ids` as well as the two columns the brief named; briefs written before it are found
  through the latest `connection_theme_runs.theme_delta` lineage.
- A forward event id is accepted as a `claim_id` in the `watch` section only (a forward event is a verbatim,
  grounded extraction and the watch section is dated by them); every other section accepts grounded FACT
  claim ids only.
- Tokens the bundle's own intra-theme edge basis names (the shared scenarios and objects) are exempt from the
  uncited-figure check: the author is told to name them and they are system facts, not member claims.
- A refused entry is residue and never blocks the valid entries; a structurally invalid file writes nothing.
- No admin override column exists on `theme_briefs`, so there was nothing for the automatic writer to respect.

## Coordinator rulings applied after the first CI run

- Added `fsi-app/scripts/harness-runs/meta-harness/pending/2026-10-04-s3c.md` (F28 range rule: a new family
  descriptor is a meta-harness governing-file change).
- F68: the export bundle carries member content and must never reach the repo. The workflow now writes it to
  `$RUNNER_TEMP/theme-briefs` (outside the checkout) and uploads `${{ runner.temp }}/theme-briefs/`; F68
  accepts it (it forbids only `_snapshots` and `scripts/tmp`). The workflow has no `git add` or commit step and
  `deliver-artifact-branch.sh` lands only `scripts/harness-runs/*/*-run-*.json` into `harness_runs`, so the
  bundle path is excluded from every add. The small run artifact stays on the normal harness path.
- `fsi-app/docs/inventories/shared-dataset-ownership.md` (hand-written prose, not generated, not pinned by a
  test) now names `apply-theme-briefs.mjs` as the writer of `theme_briefs`.

## NOT done

- No real brief authored, nothing applied, no database touched. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
- `src/app/research/[slug]/page.tsx` still selects only the exact-id brief row; for the Research reader to
  find a drifted brief it must select all `theme_briefs` rows with `member_ids` (not a lane file: .tsx).
- The workflow is not chained to anything. It should chain after `analyze-corpus` changes theme membership
  (corpus-turn step 6); the coordinator decides.

## Open items

- The pending marker `scripts/harness-runs/theme-briefs/pending/2026-10-04-s3c.md` is discharged by the first
  real run (delete it in the change that lands the run). [CLOSED: PR 1002]
- The migration 351 header says NOT APPLIED; the coordinator updates it when applied. [CLOSED: PR 1013]
