---
id: ADR-018
title: Connection-edge directionality — both directions at rest, canonicalize at the reader
status: accepted
date: 2026-08-17
scope: fsi-app connection graph — item_cross_references row shape, write-edges.mjs, pair-view.mjs, api/admin/intersections; decided with the flywheel U3 detect_intersections supersession
supersedes: the "refinement deferred with its dependency" placeholder in write-edges.mjs's directionality note (the deferral is discharged, the note now cites this ADR)
related: docs/plans/flywheel-build-plan-2026-08-10.md (U3 names this decision as landing with the supersession), migration 252 (edge columns), migration 265 (detect_intersections drop), src/lib/connections/pair-view.mjs (the canonicalizing reader), src/lib/connections/cluster.mjs (already collapses directed duplicates independently)
---

# ADR-018 — Both directions at rest, canonicalize at the reader

## Decision

`item_cross_references` keeps BOTH directed rows for a symmetric discovered connection — (A,B) and
(B,A) — exactly as write-edges.mjs produces them. Readers that need undirected pairs canonicalize at
read time to (min(id), max(id)), merging basis entries (deduped by signal+detail) and taking the max
score. The canonical implementation of that collapse is `pair-view.mjs` (`collapsePairs`), used by
`/api/admin/intersections`; `cluster.mjs` already performs the same collapse internally for the theme
pass. No storage-side canonicalization; no halving migration.

## Why

1. **Source-filtered readers require both directions.** The surface detail pages (U9) and
   `ItemConnectionsCard` ask "what connects to THIS item" by filtering `source_item_id = :id` — one
   indexed predicate, no OR. Canonicalizing storage to source<target would hide every edge in which
   the viewed item happens to be the greater id, or force each reader onto an
   `or(source.eq,target.eq)` query shape. The write-side note in write-edges.mjs called this out and
   deferred the decision to the reader-wiring step; this is that step.
2. **The write path stays trivially idempotent.** Mint-time discovery (U4) writes the new item's
   perspective without needing to know whether the canonical order puts it first; re-runs of the
   backfill refresh both rows symmetrically.
3. **The cost is bounded and measured.** Both-directions doubles discovery rows (1,710 directed rows
   today, 1,232 undirected pairs — items can appear in a neighbour's top-12 without reciprocating, so
   the ratio is below 2). At corpus scale (~10^3 items, edge cap 12/item) the table stays in the
   low tens of thousands of rows; a halving migration buys nothing measurable while imposing the OR
   query shape on every hot reader.

## Consequences

- Readers wanting pairs use `collapsePairs`/`assemblePairs` (pair-view.mjs) rather than re-deriving
  the collapse — one home for the undirected view, tested in pair-view.test.mjs.
- Edge counts must state their basis: DIRECTED rows (table cardinality) vs UNDIRECTED pairs
  (pair-view/cluster output). The board and audits carry directed counts unless labelled otherwise —
  the same predicate-labelling discipline ADR-013 imposes on archival counts.
- If a future reader needs a canonical undirected materialization (e.g. for export), it derives it
  through pair-view.mjs, never by a second SQL scoring/collapse home — that is the divergence class
  the U3 supersession (migration 265) just removed.
