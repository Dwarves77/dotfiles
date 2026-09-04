# Pending run — mint

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

**What changed:** lane URL-GUIL (2026-09-03), diagnosing why row `429c85d2` (UK "The Renewable Transport
Fuel Obligations (Amendment) Order 2013", legislation.gov.uk/uksi/2013/816) failed criterion 2
`ungrounded_url` identically on population runs #15 and #16 (mint-run-017/018,
`census-rows.mint-batch-report.json` results[0]: `{"criterion":2,"reason":"ungrounded_url","url":"http://eur-lex»"}`).
Two governing files moved:

- `scripts/mint/validate-mint-payload.mjs` — the local URL_RE mirror of `validate_item_provenance`
  criterion 2 now excludes the typographic delimiters « » ‹ › “ ” ‘ ’ from the URL character class (the
  mint kit's own record-facts.mjs templates delimit every verbatim span with guillemets — «…» — and the
  old class had no exclusion for them, so a URL sitting directly against a closing delimiter with no space
  swallowed it whole). Companion live-DB fix: migration 300 (written, NOT applied by this lane — the
  coordinator applies it live), patching `public.validate_item_provenance` the same in-place way migration
  289 did.
- `src/lib/intake/record-facts.mjs` — every `SLOT_TRIGGERS`/`BINDING_POSITION_TRIGGERS`/`DUE_DATE_TRIGGERS`
  continuation window changed from plain `[^.;\n]{0,N}` to `(?:https?:\/\/\S+|[^.;\n]){0,N}` (a whole URL is
  now consumed as ONE atomic unit before falling back to a single-character match), because the plain class
  excluded `.` to stop at a sentence's real full stop but could not tell that period apart from a URL's own
  domain dot — row `429c85d2`'s captured text reads "...via the EUR-lex website at
  http://eur-lex.europa.eu . Merchant..." and the old trigger truncated the located span to
  "...at http://eur-lex", one character short of the domain, which the guillemet template then glued
  directly to a closing » with no space between them. `RECORD_FACTS_VERSION` bumped
  `rf1-2026-09-02.1` → `rf1-2026-09-03.1`.

A third change, `scripts/mint/apply-mint-batch.mjs`'s new validation-failed hold-back
(`resolveValidationFailedHolds`, writing `census_worklist.dryrun_disposition='hold'` +
`hold_reason`/`notes` so a row the kit gate rejects is not re-selected forever), is NOT a governing-file
change — it is the coordinator-apply step downstream of the gate, not part of what the gate itself accepts
or rejects, so it is out of `MINT_GOVERNING_FILES`/F28's scope the same way `export-census-rows.mjs` already
is (see that constant's own comment in `scripts/mint/run-mint-batch.mjs`). `scripts/mint/
reopen-validation-holds.mjs` (the new re-admission tool) is likewise operational, not a gate file.

**harness_version at write time:** `sha256:ebb4130c5892235d`

**The planned run that supersedes this marker:** the next `population-turn` dispatch (dry, then apply)
under this landed code AND with migration 300 applied live — its `mint-batch-report.json` will show row
`429c85d2` (and any sibling row this defect held) extracting the FULL grounded URL instead of the
guillemet-truncated one. Per F28's reverse-audit, this marker is deleted the moment that artifact lands and
its `harness_version` matches the hash above (or re-pinned to a new hash, per rule (c), if a governing file
changes again before that run lands).
