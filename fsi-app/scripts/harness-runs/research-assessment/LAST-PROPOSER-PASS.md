# Last proposer pass - research-assessment

Per `PROPOSER-RUNBOOK.md` section 2's attestation format. `research-assessment` now has **four**
artifacts (`research-assessment-run-001` through `-004`); F28's rule (d) requires this file to name the
latest verbatim: **research-assessment-run-004**.

## Proposer pass for research-assessment-run-004 (2026-10-02, lane RA-WF, push-time gate)

**Artifacts read:** research-assessment-run-001.json through research-assessment-run-004.json, all in
full.

**Full traces read:** `scripts/producers/research/research-assessment-producer.mjs` (the diff -- new
`selectNeedingAssessment`, the `fetchLiveCandidates` DI + current-row-exclusion rewrite, `parseLimitArg`,
the deletion of `fetchLiveCurrentByItemId`), `.github/workflows/research-assessment.yml` (the new `limit`
input and its run-step wiring), and this run's own console output (five per-item outcomes, byte-identical
to run-003's -- see below).

**Why this run superseded run-003.** Lane RA-WF (2026-10-02), closing rule 17's half-slice finding on
this producer (dedicated workflow existed but had never been fired `--live`, and the live path had no
bound and no test coverage). `research-assessment-producer.mjs` -- one of this family's two governing
files -- changed (the `--live` candidate-selection rewrite), so `harness_version` changed, requiring this
new artifact. `assess.mjs` (the other governing file) is unchanged.

**What changed, mechanically.** Only the fixture/dry CLI path's OWN behaviour is provably unaffected:
`fetchLiveCandidates` (the function this lane rewrote) is never called outside `--live`, which this
worktree cannot exercise (no DB credential, by lane-common-contract design). The fixture run's metrics
and all five per-item outcomes are therefore byte-identical to run-003:
`{"candidates":5,"unchanged":0,"planned":5,"written":0}`, fixture-research-r1 -> R1/NOW/CONFIRMED,
fixture-research-r3 -> R3/NEAR/CONFIRMED, fixture-research-r4 -> R4/FAR/HYPOTHESIS,
fixture-research-refusal -> refused/HYPOTHESIS, fixture-research-openalex-doi -> R4/FAR/HYPOTHESIS. The
new `config.limit: null` field is the one visible artifact-shape change (recording that this dry run was
unbounded, the honest default when `--limit` is not passed).

**What this run does NOT prove, named rather than implied.** The rewritten `--live` path itself
(`fetchLiveCandidates`'s current-row exclusion, the `research_assessments_current` query, the `--limit`
bound) is exercised by `research-assessment-producer.test.mjs`'s new tests against an injected fake
Supabase client (27/27 passing), never by this fixture/dry artifact -- the fixture path by construction
never reaches that code. The first REAL exercise of it is the coordinator's staged `--live` dispatch
(command recorded in `docs/ops/session-log.d/2026-10-02-ra-wf.md`) after confirming migration 344 is
applied.

**Proposal: none warranted.** The fix is the scoping + bound + test coverage itself, authorized by this
lane's own dispatch; no further defect surfaced in these traces.

## Proposer pass for research-assessment-run-003 (2026-10-02, lane L3, push-time gate)

**Artifacts read:** research-assessment-run-001.json, research-assessment-run-002.json, and
research-assessment-run-003.json, all in full.

**Full traces read:** `scripts/producers/research/research-assessment-producer.mjs` (the diff --
`resolveOpenAlexSourceRecords` and its wiring into the main loop), `src/lib/research/assess.mjs` (the
diff -- `extractDoiCandidate`, `resolveAuthoritySources`, and `assessAuthorityScore`'s rewrite),
`scripts/producers/research/fixtures/research-assessment-fixtures.mjs` (the new
`FIXTURE_OPENALEX_CANDIDATE`/`FIXTURE_OPENALEX_WORK_RESPONSE`/`fixtureOpenAlexFetchStub` this run's
fifth candidate exercises), and this run's own console output (five per-item outcomes, the fifth being
`fixture-research-openalex-doi`).

**Why this run superseded run-002.** Coordinator ruling (2026-10-02, lane L3): `lane/w2r-research-
assessment` (PR #887) merged, so the half-slice prohibition that had kept lane L3's OpenAlex client and
authority-score scorer unwired no longer applies -- F25 (module-liveness) flagged both as built-and-
unimported, and the ruling was to wire them in, not allowlist them. `assessAuthorityScore` now computes
the real spec-03 section 4 multi-component distribution (via `scripts/research/authority-score.mjs`)
whenever it can resolve ANY source identity -- a producer-resolved OpenAlex record (real network DOI
lookup) or a named roadmap body already present in a forward event -- and falls back to the original
degenerate tier-based read, byte-identical to before, when neither resolves. Both governing files of
this family changed, so `harness_version` changed, requiring this new artifact.

**What changed, mechanically.** `candidates` metric moved from 4 to 5: `FIXTURE_OPENALEX_CANDIDATE` was
added specifically to exercise the new path end to end, offline (`fixtureOpenAlexFetchStub` serves a
response recorded from this lane's own live OpenAlex fire during the build, see
`docs/ops/session-log.d/2026-10-02-l3.md`). The four original fixtures carry no DOI in their text and no
roadmap-body citation beyond what run-001/002 already exercised, so their outcomes are unchanged:
fixture-research-r1 -> R1/NOW/CONFIRMED, fixture-research-r3 -> R3/NEAR/CONFIRMED, fixture-research-r4
-> R4/FAR/HYPOTHESIS, fixture-research-refusal -> refused/HYPOTHESIS. The fifth,
fixture-research-openalex-doi, resolves R4/FAR/HYPOTHESIS on the horizon axis (unrelated to this lane's
change -- its text names no dated instrument) while its `credibility_authority_score` (not surfaced in
this family's per-item `outcome` string, which only reports the horizon rule/band/status-token; verified
instead by `research-assessment-producer.test.mjs`'s own direct assertion on `result.plan[0]`) reflects
the real, resolved University-role, funding-unknown distribution -- capped at `medium`, never the
vendor-flagged shape the item's own `sourceTier: 7` stamp would have produced under the old degenerate
path. That the real signal overrides the item's own (deliberately mismatched) tier stamp is the proof
this wiring did something, not merely imported something.

**Proposal: none warranted.** The fix is the wiring itself, authorized and scoped exactly by the
coordinator's ruling; no further defect surfaced in these traces. The producer's `--live` network path
(real DOI resolution against the live OpenAlex API, for whichever live items' own text happens to name
one) is unexercised by this dry run by construction -- same posture run-002's own note records for the
corrected live-query column names, and the same honest limitation: a `--live --apply` pass after
migration 344 applies is the first real exercise of it.

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
