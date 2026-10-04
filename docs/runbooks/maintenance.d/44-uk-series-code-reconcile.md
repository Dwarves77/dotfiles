## 44. `uk-series-code-reconcile`

**Purpose**: rewrite a live legislation.gov.uk `intelligence_items` row's `instrument_identifier` series
code to match its own `source_url` path segment, so the own-URL target match stops wrongly refusing it.

**The defect** [CONFIRMED, coordinator's live SQL, 2026-09-12]: 268 live items carry a legislation.gov.uk
`source_url`; 19 of them carry `instrument_identifier` "UK uksi `<year>/<n>`" while the URL path is
"/wsi/`<year>/<n>`" -- a Welsh Statutory Instrument, a different series from a UK-wide `uksi` at the same
year/number. 0 have a year/number mismatch; 2 have identifiers not in the "UK `<type>` `<year>/<n>`" shape.
Example: `00a8c0d9-405a-48d9-a01b-9c14c4101155`, "The Single Use Carrier Bags Charge (Wales) Regulations
2010", identifier "UK uksi 2010/2880", URL `https://www.legislation.gov.uk/wsi/2010/2880`. Consequence:
`src/lib/sources/target-match.mjs`'s own-URL match (`identifierInUrl`, reusing `src/lib/coverage/
identity.mjs`'s `classifyIdentifier`/`UK_TYPES`) correctly refuses -- `uksi 2010/2880` and `wsi 2010/2880`
are different instruments -- and the item quarantined at ground (brief-apply run 34712340105).

**The deriver fix (source-side, same task)**: `scripts/mint/export-census-rows.mjs`'s `resolveIdentity`
(census/mint time) now derives `instrument_identifier` for a FRESH legislation.gov.uk row ONLY from the
URL's own series-code segment (`deriveUkLegislationIdentifier`/`parseUkLegislationUrlId`, both new,
reusing `UK_TYPES` exported from `identity.mjs`) -- never a pre-existing/defaulted value, never "uksi" as
a fallback; `buildExportRow` prefers this derived value over the census row's own when present. This
runbook step is the reconciliation half: the 19 rows above were minted before that fix existed, so their
stored value is stale and needs a one-time, targeted rewrite.

**Upstream**: `scripts/maintenance/uk-series-code-reconcile.mjs`. Pure decision function
`planItemSeriesCode` reuses `classifyHost`/`parseUkLegislationUrlId` (`export-census-rows.mjs`) and
`classifyIdentifier` (`identity.mjs`) -- no second UK series-code parser. Four/five outcomes, each
reported, never guessed: `match` (no write), `mismatch` (rewrites the series code, year/number
untouched), `non_uk_url`, `url_series_unrecognized`, `identifier_not_uk_shaped`, `year_number_mismatch`
(the last two are refused, not silently patched -- a different defect class than this step's own scope).

**Ruling**: not gated by a separate `arg` token -- the selection is fully mechanical (URL vs. identifier
series-code disagreement), no operator judgment call involved.

**Dispatch**: `mode=dry` reports `counts.by_status` and every row's plan (`per_item`); writes nothing.
`mode=apply` rewrites `instrument_identifier` for every `mismatch` row ONE AT A TIME (each has its own new
value) via `guardedUpdate`, guarded on the row's OLD `instrument_identifier` at write time (optimistic
concurrency -- a row changed since this run's own read is left untouched, surfaced in `read_back.
not_confirmed_ids`, never clobbered), then reads back and confirms.

**Reversal**: two paths, same posture as `record-hollow-sweep.mjs`/`canonical-key-dedup.mjs` (`scripts/
_snapshots/` is `.gitignore`'d and does not survive a fresh GitHub Actions checkout):
- **Durable, artifact-based** (preferred): `summary.json`'s `per_item_applied[].restore_sql` -- one
  self-contained `UPDATE intelligence_items SET instrument_identifier = ... WHERE id = '...'` statement
  per rewritten item, from this run's own "before" value.
- **Best-effort, same-disk-only**: `mode=apply, arg=restore:<id,id,...>` (this same script) -- scans
  `scripts/_snapshots/*.jsonl` for this step's own prior-state entries and replays them via
  `guardedUpdate`; refuses (never guesses) any id with no matching snapshot entry, listed in `missing_ids`.

**Artifact / read back**: `summary.json`'s `counts` (`candidates_scanned`, `by_status`, `mismatch_total`),
`per_item` (every row's plan), `per_item_applied` (old/new identifier + `restore_sql` per rewritten row),
and `read_back` (`rewritten_total`, `not_confirmed_ids`). Confirm against `SELECT id, source_url,
instrument_identifier FROM intelligence_items WHERE is_archived=false AND source_url ILIKE
'%legislation.gov.uk%'` -- every row's `instrument_identifier` series-code segment should now equal its
`source_url`'s own.

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `intelligence_items` section (this step
writes it, added to the enforced JSON allowlist and the narrative note above it).
