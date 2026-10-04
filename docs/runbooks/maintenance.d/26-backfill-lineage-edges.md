## 26. `backfill-lineage-edges`

**Documentation gap closed, Lane W71-WIRE, 2026-09-05** (plan section W7.1/section W4.1, B1 Ranked Gap #5). Written
from `scripts/entities/backfill-lineage-edges.mjs`'s own header. **Distinct from
`backfill-derivation-edges.mjs`** (DAG-AUTHOR lane, wired into `propagation-drain.yml`'s
`backfill_and_statutory` checkbox): that script writes `derivation_edges`; this one writes
`item_cross_references` - different tables, different capabilities, both real, both now wired, on their
own dispatch roots. Do not conflate the two or delete either believing it duplicates the other.

**Purpose**: the $0 whole-corpus backfill feeding the typed-lineage-edge capability (PR #481:
`classifyRelationship`/`planLinkWrites`, `item_cross_references.relationship` in
`{implements,amends,depends_on,...}`) that shipped with 0 live typed edges - the only caller of
`linkItems` is `generate-brief.ts`'s metered `linkStep`, which never ran at whole-corpus scale. Runs
every non-archived item through the SAME `planLinkWrites` the runtime calls (zero re-implemented typing
logic - see `src/lib/entities/lineage-backfill.mjs`'s `partitionLineageWrites` for the pure
insert/upgrade/skip-foreign/conflict/unchanged decision, ADR-022), writing via `guardedInsertMany`/`guardedUpdate`/
`guardedInsert` (rule 015), with a prior-state snapshot (row count + md5) printed before any write.

**Ownership (ADR-022, lane s2a-typed-edges, 2026-10-04)**: a `manual` row is never changed, whatever the
claim (counted in `skippedForeign`). A generic `related` row of a machine origin (provenance_discovery,
agent_semantic, entity_extraction) is upgraded ADDITIVELY by a typed claim: relationship becomes the typed
value, the existing basis entries are kept and the lineage basis is appended, origin and score are not
written. A generic claim never downgrades a row. A foreign row that already carries a DIFFERENT typed
relationship is not retyped: it is counted as a `conflict` in the run output and nothing is written.

**Upstream**: `planLinkWrites` (`src/lib/entities/entity-resolve.mjs`), `partitionLineageWrites`
(`src/lib/entities/lineage-backfill.mjs`).

**Ruling**: none by token - this is a backfill for an already-shipped, already-ruled-on capability, not a
new decision.

**Dispatch**: `arg`, if given, is passed as `--limit N` for a bounded pilot run (omit for the full
corpus). Raw-CLI invoked (`--apply`/default-dry, `--dry` is the DEFAULT here, a deliberately safer default
than `backfill-edges.mjs`'s write-by-default posture, per the script's own header). `mode=dry` computes
and reports the full plan (relationship-type counts, insert/upgrade/skip/unchanged tallies) without
`--apply`, writing nothing. `mode=apply` adds `--apply`.

**Artifact / read back**: this step's own console output (no `cli.mjs`/`summary.json`). Confirm against
`SELECT relationship, count(*) FROM item_cross_references GROUP BY relationship` (live 2026-09-05: 21,973
total rows, only 5 non-`'related'` - this backfill has never run to completion; a first `mode=apply` run
should raise that count substantially) and the run's own printed prior-state snapshot for the reversibility
record.

---

