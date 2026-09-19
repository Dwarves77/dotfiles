# propagation family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`propagation` (lane DP-ENGINE, 2026-09-02, system-completion train): the drain driver plus the two
propagation-engine modules whose behaviour a run actually exercises, `src/lib/propagation/drain.ts` (the
governed invalidate/recompute loop, "propagation invalidates, it does not compute," never a trigger) and
`src/lib/propagation/admissible-for.ts` (the one gate function every `derived_values` consumer calls): a
seventh shape, whose "runs" are batched drains of the `propagation_events` outbox, walking
`derivation_edges` from each undrained event, marking the transitive closure stale, and recomputing
through the registered `METHODS` seam, never a mint, an extraction, a fetch-drain replay, nor an
enumeration sweep.

**propagation's standing metric** (build plan section 2's "measurement, not assertion," per family):
*values recomputed per event drained*, of the `propagation_events` closure a drain marks stale, how many
are actually recomputed through a registered `METHODS[method_id]` (vs left stale because no method is
registered yet for that `method_id`, counted separately as `skipped_unknown_method` rather than silently
folded into either bucket), plus *queue depth before/after*, the same "measurement, not assertion" the
`propagation_queue_depth` view (migration 284) exposes directly. A dry run's counted closure and an apply
run's actual invalidation/recompute are reported as the same shape (`invalidate_dependents()`'s own
dry/apply modes, migration 285), so the two are directly comparable run over run, matching source-sweep's
own dry-vs-apply comparability above.
