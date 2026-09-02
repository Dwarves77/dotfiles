# Pending run — mint

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`mint` family's governing files re-hash to a value no landed artifact records. This marker acknowledges
the change and names the planned run that supersedes it, per that rule's own escape hatch.

**What changed:** the harness+flywheel completion train, 2026-09-01 (lanes H2, POP, TAG; coordinator
integration). (1) `MINT-RUNBOOK.md` gained §7–§9: run-mint-batch.mjs is the canonical entry point (never
raw SQL), the post-apply flywheel steps (discovery → forward-event extraction → recluster) are mandatory,
and `--outcomes` enriches the artifact with corpus-outcome metrics (Interface 3). (2) The mint family
gained the record-grade payload profile: `validate-mint-payload.mjs`, `payload-schema.json` and
`item-type-required-slots.json` carry a `grade` discriminator (brief rules byte-for-byte unchanged), and
`src/lib/intake/record-facts.mjs` (the record payload builder, only verbatim FACT spans, no synthesis) is
now a governing file. (3) `run-mint-batch.mjs` records per-payload signature-tag presence
(`scripts/mint/lib/tag-presence-check.mjs`), the prevention for the census-wave finding that untagged
items are invisible to discovery.

**Why this is not itself a mint run:** no batch was minted through the changed validator yet. The 322 live
items and every prior mint artifact (mint-run-001..006) remain accurate records of the brief-grade
validator's behavior, which this change does not alter for grade=brief.

**Re-stamped 2026-09-02 (Lane POP, system-completion train):** `MINT-RUNBOOK.md` (a governing file) gained
§11, documenting the census-worklist population runtime built this pass
(`scripts/mint/export-census-rows.mjs`, `scripts/mint/apply-mint-batch.mjs`,
`.github/workflows/population-turn.yml` — none of which is itself a mint-family governing file; only the
runbook prose describing them changed the hash). This is documentation of an EXTERNAL caller of the mint
kit, not a change to the kit's own validation behavior — the same "no batch minted through a changed
validator" posture above still holds. Hash re-stamped per F28 rule (c)'s own escape hatch so this marker
stays acknowledged rather than stale-by-drift; the planned run below (batch-003) is unaffected and still
supersedes this marker whenever it lands.

**Re-stamped again 2026-09-02 (Lane POP2, first live dry run follow-up):** the first live `population-turn`
dispatch (run `33639133429`) exported zero rows — `MINT-RUNBOOK.md` §11 gained an addendum documenting the
per-family identity/capture root cause and fix (EUR-Lex capture-endpoint rewrite, legislation.gov.uk +
federalregister.gov identity resolution, the `capture_blocked` evidence shape, the `rows_file`
browser-capture escape hatch). Same posture as the entry above: this is still documentation of the
population runtime (an external caller), not a change to the mint kit's own validate-mint-payload.mjs
gate — no batch has been minted through a changed validator. Re-stamped, not deleted, because no
`mint-run-007.json` has landed yet.

**Re-stamped 2026-09-02 (population run #4 root cause, the first CHANGE to the gate's own behavior since
this marker was written):** `mint-run-007` (run 33639133429, 0 rows) and `mint-run-008` (run 33643532589,
19 rows, 0/19 valid) landed as honest records of the record-grade path's first two live executions, both
produced at the previous hash. mint-run-008's 19 failures were all `fact_below_authority_floor` with
`source_tier_derived: null` against tier-1 registered sources: `validate-mint-payload.mjs` resolved a
fact's authority tier by exact canonical-URL equality between the claim URL (the instrument's page) and
the registered source URL (the institution row `registerSource` dedups by), a stricter rule than the
registry's own identity and than the live `validate_item_provenance` (migration 202, which derives the
tier through `section_claim_provenance.source_id`). Fixed: the mirror now resolves by registry identity
(`scripts/lib/institution-key.mjs`, the one definition `registerSource` also uses) after the exact-URL
check. The same artifact showed `src/lib/intake/record-facts.mjs` emitting legislation.gov.uk's browse
menu ("European Union Treaties ------") as a `jurisdictional_scope` FACT — fixed with a prose guard
(`isProseSpan`) and clause-shaped scope triggers. Both files are mint governing files; the 19 payloads of
mint-run-008 re-validate 19/19 at the new hash (local dry re-run, 2026-09-02). This IS a change to the
kit's validation behavior, so the "no batch minted through a changed validator" posture above no longer
describes the situation; the run that supersedes this marker is the next `population-turn` execution
(dry then apply) at the hash below.

**harness_version at write time:** `sha256:2d498956fb8c476f`

**The planned run that supersedes this marker:** the next `population-turn` dispatch (the UK/FR rows of
run #4 re-exported, plus the EUR-Lex rows now captured through Cellar), produced by
`scripts/mint/run-mint-batch.mjs --grade record` inside `.github/workflows/population-turn.yml`. Its
artifact re-hashes to this value and lands as `mint-run-009.json`, at which point this marker is
stale-by-match and must be deleted per F28's reverse-audit.
