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

**harness_version at write time:** `sha256:c7d5fa64ed62ec31`

**The planned run that supersedes this marker:** batch-003, the first record-grade batch, produced by
`scripts/mint/run-mint-batch.mjs --grade record` through the corpus-turn runtime
(`docs/plans/record-tier-population-plan-2026-09-01.md`). Its artifact re-hashes to this value and lands
as `mint-run-007.json`, at which point this marker is stale-by-match and must be deleted per F28's
reverse-audit.
