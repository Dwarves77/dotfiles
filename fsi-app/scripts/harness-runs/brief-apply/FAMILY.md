# brief-apply family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`brief-apply` (task 3.4, brief-chain build plan Part 3, 2026-09-11), registered over
`scripts/turns/apply-record-briefs.mjs` and the four modules a run actually exercises the behavior of:
`scripts/turns/record-briefs/schema.mjs` (the record-briefs artifact contract this driver validates every
batch against before touching a live item), `src/lib/agent/canonical-pipeline.ts` (the injected-synthesis
seam this driver's first per-item step calls, plus the section/ground/grow steps it runs after),
`src/lib/intake/flywheel-steps.mjs` (the two per-item flywheel steps, discovery and forward-event
extraction, this driver shares with `apply-staged-update.ts`'s own substantive-update path, task 3.4's own
extraction of that logic so the two callers can never independently drift on the dedupe key or the
stale-events detection), and `scripts/turns/io-preflight.mjs` (D32, defect-fix-plan-2026-09-12.md, lane
L21: the pre-flight IO check and durable run record that gate whether an `--execute` run even starts).
A ninth shape again, whose "runs" turn a validated batch of session-lane-authored full briefs into fully
connected items: generate, section, ground, grow, then the per-item flywheel
(discovery/forward-events/compliance-deadline/entities), then the batch-level unscoped flywheel steps
(analyze-corpus/derive-obligations/tag-proposals/tag-ratification, via
`run-population-flywheel.mjs`'s own `runUnscopedFlywheelSteps`); never a mint, an extraction pass, an
enumeration walk, a ledger consume, a change-detection chain, a propagation drain, nor a corpus turn.
`scripts/harness-runs/brief-apply/PENDING-RUN.md` records why this family starts at zero artifacts (no
live dispatch was possible from the authoring environment, the same posture `ledger-consume` and
`corpus-turn` recorded at their own registration).

**brief-apply's standing metric** (build plan S2's "measurement, not assertion," per family): *applied vs
quarantined vs generate-failed per run*: of the items a run selected (after `--after-id`/`--limit` and
the stale-pool-hash pre-check), how many landed `provenance_status='verified'` (`applied`), how many
generated and grounded but landed some OTHER `provenance_status` (`quarantined`, reported, never hidden),
and how many never got past `generateBriefFromInjected` at all (`generate_failed`), plus
`skipped_stale_hash`, the count this run pre-empted before any step ran because the lane's own recorded
`source_pool_hash` no longer matched the item's current stored pool. The brief-apply-family counterpart to
`ledger-consume`'s disposition-mix-per-run: a proposer pass reading this family's history sees how much of
a session lane's authored batch actually reached the live corpus, never only a raw item count.
