# Pending run — meta-harness

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`meta-harness` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it. (The prior hash,
`sha256:79fac2e836280e6e`, is what `meta-harness-run-007` records.)

**What changed (2026-09-04, coordinator, SINGLE SOURCE for Gate A):** F28 itself — one of `meta-harness`'s
four governing files — gained two entries in the mint family's `GOVERNING_FILES`: `src/lib/agent/gate-a-scan.mjs`
and `src/lib/agent/gate-a-match.mjs`, the single Gate-A implementation that `scripts/mint/lib/gate-a-scan.mjs`
and `gate-a-match.mjs` now re-export instead of copying. Until this change the kit copies were the only
governed paths and the live scanner could drift from them unseen (it did: lane GATE-A-TOKENS' harvest fix
landed in the copy only). `CONVENTION.md`'s governing-file table row for `mint` was updated to match, in
the same commit. `PROPOSER-RUNBOOK.md` and `scripts/lib/run-artifact.mjs` are untouched.

**harness_version at write time:** `sha256:ef2b956784ce02e1`

**The planned run that supersedes this marker:** the next `meta-harness-run-008.json`, the coordinator's
next self-application review pass. Per F28's reverse-audit, this file is deleted the moment an artifact
carrying the hash above lands (or updated to a newer hash, per rule (c), if a `meta-harness` governing
file changes again before that run lands).
