# Pending run — meta-harness

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`meta-harness` family's governing files re-hash to a value no landed artifact records. This marker
acknowledges the change and names the planned run that supersedes it. (The prior hash,
`sha256:134f88fd9135affc`, was discharged by `meta-harness-run-007`.)

**What changed (2026-09-02, follow-up integration on `train/system-completion`, ledger-consume telemetry
fix):** `scripts/harness-runs/CONVENTION.md` — one of `meta-harness`'s four governing files — was edited
to correct two stale `ledger-consume` paragraphs written by Lane CONSUME before Lane SPEND landed.
Both had claimed `run-ledger-consume.mjs` (this driver) closed `first-fetch-classify.ts`'s missing
per-call `agent_runs` telemetry itself; that is no longer true — `firstFetchClassify` now runs through
`spendMessage` in `src/lib/llm/spend-client.ts`, which writes the `agent_runs` row itself
(`recordSpendCall`), so the driver's own `buildLoggingClassify` wrapper (a second, now-duplicate insert)
was removed in the same pass and replaced with a read-only `collectClassifyTelemetry` that reads
`input_tokens`/`output_tokens` back off `FirstFetchClassifyResult` for the artifact. No other
`meta-harness` governing file changed in this pass (`PROPOSER-RUNBOOK.md`, `run-artifact.mjs`, and F28
itself are all untouched).

**harness_version at write time:** `sha256:efee6254db30e3ed`

**The planned run that supersedes this marker:** the next `meta-harness-run-008.json`, the coordinator's
next self-application review pass over the system-completion train (same narrative shape as
`meta-harness-run-007`, which folded in the prior wave's `governing_files_changed`). Per F28's
reverse-audit, this file is deleted the moment an artifact carrying the hash above lands (or updated to a
newer hash, per rule (c), if `CONVENTION.md` or another `meta-harness` governing file changes again
before that run lands).
