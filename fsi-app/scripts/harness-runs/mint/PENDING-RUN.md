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

**harness_version at write time:** `sha256:7e9b1b6cee57777b`

**The planned run that supersedes this marker:** batch-003, the first record-grade batch, produced by
`scripts/mint/run-mint-batch.mjs --grade record` through the corpus-turn runtime
(`docs/plans/record-tier-population-plan-2026-09-01.md`). Its artifact re-hashes to this value and lands
as `mint-run-007.json`, at which point this marker is stale-by-match and must be deleted per F28's
reverse-audit.
