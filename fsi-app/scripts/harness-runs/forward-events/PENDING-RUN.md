# Pending run — forward-events

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

**What changed:** lane FE-SLOT (2026-09-03), diagnosing why record-grade items' `due_date` slot claims
were producing no forward-obligation events. Both this family's governing files moved:

- `src/lib/forward-events/extract-forward-events.mjs` — the pure extractor now recognises a record-grade
  `due_date` slot FACT claim (by its `claim_text`'s own `[due_date] ` template prefix — there is no
  `slot_key` column on `section_claim_provenance` to read instead, confirmed against every migration
  through 299) and, WITHOUT assuming its kind (spec 01 §3.3's "four dates, never one"; MINT-RUNBOOK.md
  §13's "locates A date, not which of the four it is"): (a) when the slot's own `date_precision` marker
  is finer than what the extractor's date grammar resolved for the same span, uses the finer of the two
  (bounded to this module's `{day,month,year}` vocabulary, never `quarter`); (b) when the slot's span
  produces no classifiable event at all, records a new `slot_date_unclassified` skip reason instead of
  leaving the gap invisible. `EXTRACTOR_VERSION` bumped `fe1-2026-09-01.1` → `fe1-2026-09-03.1`.
- `scripts/harness-runs/forward-events/PROTOCOL.md` — new §5a/§5b documenting the above and the
  `metrics.by_skip_reason` histogram addition (`run-extraction.mjs`'s `runExtraction()`; a runner-metrics
  addition, not itself an `EXTRACTOR_VERSION` bump).

`src/lib/forward-events/read-and-extract.mjs` and `scripts/turns/export-corpus-for-extraction.mjs` were
diagnosed and left UNCHANGED: both already select `claim_text` field-for-field identically (confirmed by
direct comparison of their queries), so the `[due_date] ` marker the new extractor logic reads was
already reaching both the live per-item reader and the corpus exporter — the gap was in the extractor's
own classification, not in either reader filtering the claim out. Neither is a governing file for this
family, so neither is part of the hash below.

**harness_version at write time:** `sha256:d47a10728a3cc799`

**The planned run that supersedes this marker:** the next `corpus-turn` apply the coordinator dispatches
(per `finish-plan-2026-09-02.md` §3 item 2, "every live item through the newest discovery, extraction and
analysis once") — it drives `scripts/turns/export-corpus-for-extraction.mjs` →
`scripts/forward-events/run-extraction.mjs --execute` over the live corpus under this landed code, writing
the next `forward-events-run-NNN.json`. Per F28's reverse-audit, this marker is deleted the moment that
artifact lands and its `harness_version` matches the hash above (or re-pinned to a new hash, per rule
(c), if either governing file changes again before that run lands).
