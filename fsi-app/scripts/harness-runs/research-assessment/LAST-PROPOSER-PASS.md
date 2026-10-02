# Last proposer pass - research-assessment

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `research-assessment` now has **two**
artifacts (`research-assessment-run-001` through `-002`); F28's rule (d) requires this file to name the
latest verbatim: **research-assessment-run-002**.

## Proposer pass for research-assessment-run-002 (2026-10-02, lane W2-R, push-time gate)

**Artifacts read:** research-assessment-run-001.json (the family's first artifact) and
research-assessment-run-002.json, both in full.

**Why this run superseded run-001.** A pre-push discipline gate (`pagination-order-key-audit.test.mjs`)
caught that `research-assessment-producer.mjs`'s live-only `fetchLiveCandidates()` queried
`item_forward_events` with three columns that do not exist on that table (`item_id`, `kind`,
`source_citation` - the real schema, migration 274, is `intelligence_item_id`/`event_kind`, with no
citation-text column). Fixing the query changed one of this family's two governing files
(`research-assessment-producer.mjs`), which changed `harness_version`, requiring a new artifact at the
new hash.

**What changed, mechanically.** Only the live-query column mapping inside `fetchLiveCandidates()` (a
function the fixture/dry CLI path never calls - `--live` requires real DB credentials, absent in this
worktree). `assess.mjs` (the other governing file) is unchanged. The fixture candidates, the ladder
logic, and every assessed outcome are therefore byte-identical between the two runs: both show
`{"candidates":4,"unchanged":0,"planned":4,"written":0}` and the same four per-item outcomes
(fixture-research-r1 -> R1/NOW/CONFIRMED, fixture-research-r3 -> R3/NEAR/CONFIRMED,
fixture-research-r4 -> R4/FAR/HYPOTHESIS, fixture-research-refusal -> refused/HYPOTHESIS).

**Proposal: none warranted.** The fix was a straightforward schema-name correction with no behavioural
ambiguity to investigate further; the fixture run cannot exercise the corrected live-query path at all
(it has no DB credentials), so this proposer pass has nothing additional to read off run-002 that
run-001 did not already establish. The coordinator's own `--live` dry run (after migration 344 applies)
is the first real exercise of the corrected column names, per this lane's standing session-log note.
