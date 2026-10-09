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

## Coordinator rulings applied (same day)

- Merged origin/master (PR 932 runbook split) into the branch. Registered `lineage-gap-targets` in
  `.github/workflows/maintenance.yml` (choice list plus an inline dry-by-default step, no arg), added
  `docs/runbooks/maintenance.d/59-lineage-gap-targets.md` and its index line, and the maintenance family F28
  pending marker. No F25 allowlist entry.
- `partitionLineageWrites` now implements ADR-022 as written: absent -> insert; `manual` row never changed
  (operator overlay); generic claim never downgrades; typed claim on a generic machine-origin row (any of
  provenance_discovery, agent_semantic, entity_extraction) upgrades ADDITIVELY (relationship typed, existing
  basis kept, lineage basis appended via `appendBasis`; origin and score are not in the patch, which is what
  the ADR prescribes, so no `upgraded_by` marker was added); a foreign row already typed differently is
  returned in the new `conflicts` list and not written; an own-origin retype or same-type basis top-up appends.
  ADR-021 has no clause on edge upgrades. The ADR text does not contradict the ruling: its clause 1 says
  "whatever origin owns it", and the operator's manual-origin exemption is a narrowing layered on top.
- Readers of the old `skippedForeign` count checked: `link-items.ts` (mine, now also reports `conflicts`),
  `backfill-lineage-edges.mjs` (counter retitled, `conflicts` counter added; its upgrade write
  `{relationship, basis}` already carries the merged basis), `apply-record-briefs.mjs` (outcome string gains
  `conflicts=`). The `skippedForeign` hits in `analyze-corpus.mjs`, `apply-tags.mjs`,
  `discover-for-items.mjs` and `write-edges.mjs` are write-edges' own `skippedForeignOrigin`, a different
  function, unchanged.

## Open items (not done, not blocking)

- Runbook 26 corrected to the new ownership outcomes (write-set expansion approved). [NOT-WORK: fact, no action]
- OWED BY THE COORDINATOR: the index line for step 59 in `docs/runbooks/MAINTENANCE-RUNBOOK.md`. The lane's range does not touch that file (F51 check 5 concurrency with RB-SPLIT, ruling 2026-10-04). [CLOSED: PR 935]
- Record-grade text: of the 2 fixture excerpts in `scripts/mint/testdata`, record-facts `full_brief` alone
  yields 0 typed edges; title + full_brief yields 1 (the amending act 2019/1242 to a held 2018/956). [NOT-WORK: fact, no action]
