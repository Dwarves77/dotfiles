## 2026-10-04, lane s3a-intersections: intersection detection exists as code and runs in the corpus pass

### Accomplished (each confirmed by a test run in this lane)
- `src/lib/connections/intersections.mjs` (new): `detectIntersections` is the skill's AND rule over verified, non-archived items of any type: at least one shared operational scenario and at least one shared NON-ROLE compliance object (`ROLE_TAGS` imported from `discover.mjs`, now exported). Strength +3 scenario, +2 object, +5 explicit `related_items`, +2 both CRITICAL or HIGH; tiers strong 12 and up, medium 8 to 11, weak under 8. Candidate pairs come from a scenario-tag index, so the cost is the sum over tags of f(t) squared, never all pairs (stated in the header, 600-item test).
- `strengthToScore` maps strength onto the 0..1 edge scale piecewise (5 to 0.3, 7 to 0.4333, 8 to 0.5, 11 to 0.8, 12 to 0.9, 16 and up to 1), so each tier lands in the pair-view band of the same name.
- `write-edges.mjs`: `planIntersectionEdges` (pure), `projectEdgeRows` (pure), `writeIntersectionEdges` (dry by option) write one `intersection` basis entry `{signal, detail:{scenarios,objects,strength,tier}, weight}` onto each directed row of a pair; a missing row is inserted (related, provenance_discovery, score from strength); manual rows never change; other origins keep relationship, origin and score (ADR-022 additive); a pair that stops intersecting loses only its entry. A discovery refresh now carries an existing intersection entry forward instead of erasing it.
- `pair-view.mjs` and `/api/admin/intersections` expose `intersection {scenarios, objects, strength, tier, cross_surface}` per pair; `cross_surface` is derived from `item_type` and `domain` through `surfaceOf`.
- `analyze-corpus.mjs` runs the step before clustering in dry and apply; apply writes then re-reads the graph, dry clusters over the projected rows; counts go to `connection_theme_runs.args.intersections` (a run row exists only in apply mode).
- `run-population-flywheel.mjs`: `tag-proposals` and `tag-ratification` now run before `discovery`; header order text renumbered; `runUnscopedFlywheelSteps` derives its order from the plan through the new pure `unscopedStepOrder`, so the brief-apply entry point also runs tags before analyze-corpus.
- Skill: only the "Intersection Detection" definition changed (non-role objects per ADR-021; result stored on the pair's edge). Skill ack added.

### Read and reused
Read in full: the register, the skill sections, ADR-018/019/021/022, `discover.mjs`, `run-discovery.mjs`, `write-edges.mjs`, `pair-view.mjs`, `signal-confidence.mjs` (edge builder), `flag-namespaces.mjs`, `connection-view-model.mjs`, `analyze-corpus.mjs`, `discover-for-items.mjs`, `cluster.mjs` (basis handling), the flywheel plan builder, migrations 023, 252, 253, 276, the admin route. Reused: `ROLE_TAGS`, `surfaceOf`, the write-edges snapshot format and existing-edge reader (now one shared helper), `bandOf` bands, the existing writer module (no second writer, no second table).

### Decisions
- Intersection-only provenance_discovery row whose intersection stops holding is DELETED (snapshotted), because a row with no basis is forbidden by discover.mjs and would keep clustering. Other rows lose only the entry. Needs coordinator confirmation.
- The intersection entry is kept out of `pair.basis` and exposed as `pair.intersection`: its object-valued `detail` would crash `IntersectionDetectionView` (renders `b.detail` as a React child) and defeats the `detail ===` dedupe.
- cross_surface is false when either item classifies to `uncategorized`, null when an item has no `item_type`.
- Counts are in `args.intersections` (no other existing column fits; migration 276 documents `args` as CLI args, so a dedicated column is the coordinator's call).

### Coordinator rulings applied (round 2)
- F39 marker added on the delete `.in("id", ids)` (100-element slice). Decisions 1 to 3 confirmed.
- `basisEntryKey` and `basisDetailText` (intersections.mjs) are the one home for comparing and printing a basis detail; `cluster.mjs`, `brief-candidates.mjs` and `pair-view.mjs` use them, so the intersection entry counts once per undirected pair in `dominantSignals` and prints as "intersection (scenarios: ...; objects: ...; tier, strength N)". Red-then-green tests in cluster.test.mjs and brief-candidates.test.mjs.
- Other readers of `basis[].detail` (grep): `src/lib/entities/lineage-backfill.mjs:40` keys by `${e?.detail ?? ""}` (outside my files; only lineage entries pass through it, so no live collision, not edited); `src/components/sources/IntersectionDetectionView.tsx:286,291` renders `b.detail` as a child (safe because pair-view keeps the intersection entry out of `basis`; not edited); `ItemConnectionsCard.tsx` and `connection-view-model.mjs` read only `signal` and `weight`.
- MINT-RUNBOOK.md section 8 and POPULATION-TURN-RUNBOOK.md order statements corrected; MINT-RUNBOOK is a mint governing file, pending marker `scripts/harness-runs/mint/pending/2026-10-04-s3a-intersections.md` added. `apply-record-briefs.mjs` comments corrected only; its per-item order (APPLY_STEP_ORDER) is generate, section, ground, grow, structured-actions, lineage, discovery, forward-events, compliance-deadline, entities, unchanged, and tags still follow per-item discovery there (batch-level tags now run before analyze-corpus).

### NOT done
- No live run, no migration, no apply. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
