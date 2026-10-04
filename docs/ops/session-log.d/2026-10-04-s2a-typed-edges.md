# Lane s2a-typed-edges, 2026-10-04

## Accomplished (each confirmed by a test run in this worktree)

- `linkItems` (`fsi-app/src/lib/entities/link-items.ts`) now places edges through `partitionLineageWrites`
  (insert / upgrade own origin / skip foreign / unchanged) instead of an ignore-duplicates upsert, reports
  the outcome counts, and takes `{dry, content, corpus}` options. Dry mode writes nothing (edges, upgrades,
  flags). A text under 20 chars returns before any query.
- Free path: `apply-record-briefs.mjs` gains the per-item step `lineage` (step 4c, between
  `structured-actions` and `discovery`; `APPLY_STEP_ORDER` is now 10 steps). Dry runs preview it
  (`previewEntryLineage`, over the entry body) and `runApplyLoop` accepts several preview results per entry.
- Mint: `mint-item.ts` runs `linkItems` as a post-insert hop over title + summary + full_brief, before
  connection discovery. Failure records a flywheel defect (existing `entities` subtype, message prefixed
  `lineage-links:`) and never fails the mint. A dry mint returns above the insert, so it never reaches it.
- Absent parents: `planLineageGapTargets` / `parseLineageGapFlag` in `lineage-backfill.mjs` (pure) and the
  maintenance script `fsi-app/scripts/maintenance/lineage-gap-targets.mjs`: writes
  `lineage-gap-targets.json` (targets, resolvable flags, `relink_item_ids`, residue) to `--out`; in
  `--mode apply` resolves each flag whose every named parent is now held, through `guardedUpdateByIds`.
  Dry by default. NOT registered in `maintenance.yml` (brief: another lane restructures the runbook).
- Discovery signal: no code change and no migration (see Decisions). Characterization test
  `src/lib/connections/edge-signal.test.mjs`.

## Read and reused

Read in full: spec 00 section 6; ADR-018, 019, 021, 022; `entity-resolve.mjs`, `link-items.ts`,
`lineage-backfill.mjs`, `link-item-entities.mjs`, `backfill-lineage-edges.mjs`, `mint-item.ts`,
`flywheel-steps.mjs`, `mint-enrichment.ts`, `apply-record-briefs.mjs`, `discover.mjs`, `run-discovery.mjs`,
`write-edges.mjs`, `signal-confidence.mjs`, `discover-for-items.mjs`, `close-flags-for-verified-items.mjs`,
`lib/cli.mjs`; migrations 004 and 252. Reused: `partitionLineageWrites` and `pairKey` (ADR-022 ownership,
not reimplemented), `planLinkWrites` / `resolve` (entity-resolve), `fetchAllRows`, `runCli`, `readAll`,
`guardedUpdateByIds`, the existing flywheel-defect writer, `isMainModule`.

## Decisions

- No `signal` column, no migration 351. `item_cross_references.basis` (migration 252) already stores one
  `{signal, detail, weight}` entry per grounded signal on all four discovery writers (run-discovery,
  signal-confidence, discover-for-items, apply-tags), and the strongest signal is the highest-weight entry
  (that is how `scoreConnection` derives `relationship`). A second column would copy data `basis` holds and
  would need a reader (F14). The premise "every writer discards the signal" is refuted for the stored edge.
- The hop runs before discovery at mint and before discovery on the free path, so a typed pair is claimed
  before discovery's writer, which skips pairs another origin owns.
- Dry-aware on the free path = a read-only preview, because `applyOneEntry` never runs in dry mode.

## Open items (not done, not blocking)

- ADR-022 text vs `partitionLineageWrites`: the ADR says a specific writer may upgrade a generic incumbent
  of ANY origin, additively (append basis, keep origin and score). The function, and its test, skip every
  foreign origin (including a `provenance_discovery` 'related' row) and, for an own-origin upgrade, replace
  basis. The brief said to reuse the function, so it is unchanged. Consequence: a lineage pair already
  occupied by a discovery 'related' row stays untyped. Needs a ruling.
- Record-grade text: of the 2 fixture excerpts in `scripts/mint/testdata`, record-facts `full_brief` alone
  yields 0 typed edges; title + full_brief yields 1 (the amending act 2019/1242 to a held 2018/956).
- `lineage-gap-targets.mjs` has no workflow reference; fitness F25 may flag it until it is registered.
