## Change

Lane NO-TYPED-INPUT, 2026-10-03 (ADR-043): `scripts/producers/regional/state-cost-facts-producer.mjs` (a
`state-cost` governing file) no longer authors the retired wage-versus-automation derived value per state.
Removed: the state-grain DAG-authorship step, its preview fakes, and the `dag_*` metric keys and `dag_edges`
artifact field. Unchanged: grounding, source rating, the upsert, the entity-spine step, the kill switch and
the dry-only CLI.

## Planned run

No run is owed. The family stays R14-held (fixture and dry only), and the removal narrows the run artifact's
metrics block, so there is nothing a `state-cost-run-NNN.json` would capture beyond what the producer test
already proves. Delete this file whenever the next real `state-cost` run lands.
