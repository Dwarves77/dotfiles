## 2026-10-03, lane NO-TYPED-INPUT: retire the calculator and the automate-versus-hire framing (ADR-043, migration 350)

Accomplished: removed the Operations calculator (component, page view, `/operations/calculator` route, the one
list-page link, the command-bar parts entry), the calculator library, the `automate_vs_hire` propagation method
and registration, its seed path, and the producer edge-authorship hooks that only fed it (region grain in
`run-envelope-producer.mjs`, state grain in `state-cost-facts-producer.mjs`, the region step in
`backfill-derivation-edges.mjs`). `UNCERTAINTY_PCT` moved to `src/lib/figures/uncertainty.mjs` (its one kept
consumer is the carbon cost per FEU card). Rendering audit: the calculator mount and spec deleted, the calculator
link row removed from the Operations list spec. Migration 350 (data, applied by the coordinator after merge)
deletes the `automate_vs_hire` derived values and the edges into them. ADR-043, spec 04/07/08/06 and plan
amendments, four skill edits with a skill-ack, and the shared-dataset-ownership note are in the same range.

Decisions: ADR-043 (the ruling quoted verbatim there). Wage, labour-cost and energy-cost evidence stays as sourced
figures with no verdict. Workspace assignment, tags and notes stay.

Open items for the coordinator: (1) `isHourlyWageUnit` and `resolveRegionEntityId` had no production importer once
the hooks went, so they were deleted (F25) rather than moved as the brief's step 1 described. (2) Spec 01
components 9 and 10 were listed in the brief as superseded but are workspace preference state; left alone and
noted in the ADR. (3) `estimated_values` has no registered writer after this change. (4) Migration 350's DELETE
fires the outbox trigger, appending delete events to `propagation_events` (left untouched, per the brief).

## UX compliance

Blocks touched: Operations list page (the "Capacity investment estimate" link row removed) and the retired
`/operations/calculator` page (deleted with its route). This lane only removes elements; it adds no interactive
element and no async action.

- Primary goal per block: unchanged by the removal. The Operations list's goal is reading regional evidence.
- Path in steps: one element shorter; no step added.
- One primary action per section: unchanged. The removed link was a secondary text link.
- Feedback state for each async action: none added or changed. The deleted calculator's own client-side recompute
  and its notices rail mount are gone with it; `NoticesRail` keeps its Market and detail-page mounts.

Design changes owed: none. Artboard 08 never drew the calculator link (it was a logged deviation), so no artboard
needs to change.
