# Pending run — mint

F28 rule (c) (staleness coupling, `.discipline/fitness/functions/F28-harness-run-integrity.mjs`): the
`mint` family's governing files re-hash to a value no landed artifact records. This marker acknowledges
the change and names the planned run that supersedes it, per that rule's own escape hatch.

**What changed (2026-09-02, after population-turn runs #9–#11 — `mint-run-011..013`, 122 minted):**
`MINT-RUNBOOK.md` §11 now documents that the relevance screen is part of the export: those three runs
selected on `dryrun_disposition = 'would_mint'` alone and minted about half off-vertical items against
the operator's 2026-08-31 screen ruling. The gate (`export-census-rows.mjs` → `lib/screen-verdict.mjs`)
and the post-apply reconciliation (`screen-reconcile-records.mjs`) are runtime code, not kit governing
files; only the runbook prose moved the hash. The validator and record-facts were byte-for-byte unchanged
at that point.

**What changed again (2026-09-02, Lane WSEQ — the shared write sequence + the screen-verdict kit check):**
governing files moved a second time in the same day, this time for real behavioral reasons:
- `validate-mint-payload.mjs` gained a new kit check, grade='record'-only: a payload's own
  `screen: { verdict, provenance, basis }` is now REQUIRED (`screen_verdict_missing` when absent/malformed,
  `screen_verdict_not_on_vertical` when present but not `on_vertical`) — the structural backstop for the
  exact incident the first "what changed" entry above describes, so a future exporter regression is caught
  by the gate every payload already has to clear, not only by the export filter.
- `payload-schema.json` documents the new top-level `screen` property.
- `src/lib/intake/record-facts.mjs`'s `buildRecordPayload` gained a `screen` parameter, carried straight
  into `payload.screen` (never recomputed — that module has no I/O). `export-census-rows.mjs`'s
  `partitionByScreen` now attaches `.screen` to every mintable row and `run-mint-batch.mjs`'s
  `buildPayloadsFromCensusRows` threads it through — the export → run → apply chain that actually
  populates the field is traced and proven by test (`run-mint-batch.test.mjs`'s three new
  `buildPayloadsFromCensusRows`/screen tests), per this lane's own charter: a landed check with an
  unpopulated field would quarantine the next population run's entire batch.
- Separately (not a governing-file change, named here for the same commit's full picture):
  `src/lib/intake/write-item.ts` (new) is now the ONE guarded write sequence
  (item→searches→sections→gate-A→claims→citations) `apply-mint-batch.mjs` calls for a fresh record-grade
  mint, and the row-shape builders (`buildGateARow`, `buildCitationEdges`, `classifyMintOutcome`) the
  brief tier's `canonical-pipeline.ts` (`groundBrief`) now also calls at its own Gate-A/citation-edge write
  sites — closing the drift class run #8 (gate-after-claims) already had to fix once by hand.

**harness_version at write time:** `sha256:9a3e4c77ec4d9342`

**The planned run that supersedes this marker:** the next `population-turn` apply dispatch, which
archives the off-vertical items already minted and exports only screened rows; its artifact re-hashes
to this value and lands as `mint-run-014.json`, at which point this marker is stale-by-match and must be
deleted per F28's reverse-audit.
