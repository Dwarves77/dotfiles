# Last proposer pass, state-cost

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `state-cost` now has **two** artifacts on this
branch (`state-cost-run-001` from lane STATE-COST-PRODUCER/PR #811, `state-cost-run-003` from this lane);
F28's rule (d) requires this file to name the latest verbatim: **state-cost-run-003**.

## Pass of 2026-09-27 (lane STATE-COST-DAG, first run after option A)

**Artifacts read:** state-cost-run-001 (dry, `trigger:"manual"`, PR #811, 4 candidates, 2
`candidate_built`/1 `refused_ungrounded`/1 `refused_unrated_source`, no DAG-authorship step existed yet).
state-cost-run-003 (dry, `trigger:"manual"`, this lane, 5 candidates over the widened fixture set: a
second California candidate, `operational_cost`, was added so the fixture set completes a wage+energy
pair for at least one state, per the coordinator's instruction to show a real edge preview).

**Full traces read:** state-cost-run-003's own `full_trace_refs` (the fixture module) and its `per_item`
array (5 entries: 3 `candidate_built` including the new CA operational_cost row, 1 `refused_ungrounded`,
1 `refused_unrated_source`).

**Metrics [CONFIRMED, read from state-cost-run-003.json]:** `candidates: 5, refused_ungrounded: 1,
refused_unrated_source: 1, to_insert: 3, dag_pairs_found: 1, dag_authored: 0, dag_previewed: 1,
dag_skipped_incomplete: 1`. `metrics.dag_edges` carries one entry for US-CA: `entity:
"cl:jurisdiction:776cec61a9f36def"`, `ok: true`, `action: "authored"` (the preview's own use of that
verdict word for "would author"), `preview_value: {value: -1696069.28..., unit: "USD", derivation:
"modelled", confidence: 0.6}`, a REAL computed NPV from the registered `automate_vs_hire` method, not a
stub. Texas (`operational_cost` only, no wage candidate in this fixture set) correctly counts as
`dag_skipped_incomplete`, not a false pair.

**Harness_version state [CONFIRMED, measured with `hashHarnessVersion` against
`GOVERNING_FILES["state-cost"]`]:** state-cost-run-003's hash reflects the widened
`state-cost-facts-producer.mjs` (now importing `author-edges.mjs` and `operations/automate-vs-hire.mjs`
too) and the widened `state-cost-facts-envelope.mjs` (`value_numeric`/`parseNumericValue`), a real,
expected hash change from adding the DAG-authorship step, not drift.

**Hypotheses (considered; none warranted beyond what this lane's own report already states):** the
open question this register carried forward from lane STATE-COST-PRODUCER (state-grain automate_vs_hire
DAG authorship) is what this lane's own dispatch resolved, option A, migrations 332/333 drafted (NOT
applied, per R14 and the explicit "do not apply" instruction), the producer wired to author edges through
the existing `register_derived_value` path in dry-preview mode. No further hypothesis is warranted from
these two artifacts alone; the next genuine proposer pass belongs after the migrations are reviewed and
(if approved) applied, so a live run can be compared against this dry preview's numbers.
