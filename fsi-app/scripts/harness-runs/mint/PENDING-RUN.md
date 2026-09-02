# Pending run — mint

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`mint` family's governing files re-hash to a value no landed artifact records. This marker acknowledges
the change and names the planned run that supersedes it, per that rule's own escape hatch.

**What changed (2026-09-02, after population-turn run #8 — `mint-run-010`, the first live apply):**
`MINT-RUNBOOK.md` §11 gained the first-apply findings table (gate A written after the claims left every
minted item `quarantined`; a U+0000 in a Federal Register raw text aborted the batch and left a bare
item; the WO-26 stamp's statement timeouts). Documentation of the population runtime (an external caller
of the kit) — `validate-mint-payload.mjs`, `payload-schema.json`, `item-type-required-slots.json` and
`src/lib/intake/record-facts.mjs` are byte-for-byte unchanged, so the gate's behavior at this hash is
the behavior mint-run-010 measured (45/45).

**harness_version at write time:** `sha256:2aa3acb86dc8a0a0`

**The planned run that supersedes this marker:** the next `population-turn` apply dispatch, whose
artifact re-hashes to this value and lands as `mint-run-011.json`, at which point this marker is
stale-by-match and must be deleted per F28's reverse-audit.
