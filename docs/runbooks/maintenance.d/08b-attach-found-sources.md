## 8b. `attach-found-sources`

**Purpose** (Lane ATTACH-SOURCES, 2026-09-05, W3.1). `docs/audits/wiring-audit-2026-09-04.md` gap 4 /
the `provenance-heal` row above: HEAL apply #42 (2026-09-04) measured **443 Gate-A orphan figures on 76
quarantined items** that `heal-provenance.mjs`'s own STEP SOURCE could not resolve at $0 - every
candidate URL it could derive from the item's OWN citations (`candidateUrlsForOrphan`) was tried and
exhausted (`no_candidate_url` / `unresolved`). The operator's standing ruling on this file (verbatim,
2026-09-03): "if items are being flagged as not credible for the site because of not having sources that
is an issue with finding the source not that item. you need to attach a source." The $0, no-LLM lever
this step arms: a session **Haiku browser lane** (never this runtime, never an API call from here) does
the web search a human would do, and hands back a **worklist**. This step consumes that worklist THROUGH
`heal-provenance.mjs`'s own STEP SOURCE (ELEVENTH PASS there, `deps.foundSourcesForItem` - see that
file's own header) - never a second grounding mechanism: the SAME class-table tier (SC-13, never
invented), the SAME verbatim `locateSpanInText` requirement, and the SAME guarded
`insertClaim`/`registerSource` write path every other STEP SOURCE outcome already uses.

**The worklist contract** - a committed JSON file, an array of:
```json
{ "item_id": "uuid", "token": "€2,500,000", "url": "https://...", "quote": "the verbatim sentence the page states the figure in" }
```
`item_id` and `token` come from the SEED (below) **verbatim, never retyped** - a token this step tries
must be byte-identical to the Gate-A orphan token actually measured. `url` is the page the Haiku browser
lane found stating the figure; `quote` is the verbatim sentence/clause it read there - **evidence for
the coordinator/operator to cross-check, never itself the grounding needle**: GROUND still requires
`token` verbatim on the FETCHED page, under `heal-provenance.mjs`'s normal normalization (exact →
normalized → normalized_ci → numeric_tolerant). A row missing `url` or `quote` is a bare, not-yet-filled
seed row - skipped as NOT READY, never an error; dispatching against a raw, unfilled seed is always a
safe no-op. Fixture: `fsi-app/scripts/_worklists/attach-found-sources.fixture.json` (2 rows, fictitious
data, proves the dry-run path with zero fetches/writes - see
`fsi-app/scripts/maintenance/attach-found-sources.test.mjs`).

**The SEED - how the coordinator generates the real 441-orphan worklist for the browser lane to fill**
(corrected 2026-09-06, Lane SEED-FIX - the previous version of this section was wrong about which
outcome a DRY run actually produces; see the defect note below):
1. Dispatch `step=provenance-heal`, `mode=dry`, `arg=quarantined-live` (or `ids:<the 76 item ids>` once
   named) - this reads the item's REAL current captures/claims and reports every orphan STEP SOURCE and
   STEP C tried and could not resolve, with **no write and no fetch beyond what dry already means there**.
2. Download that run's `summary.json` artifact (`maintenance-provenance-heal-<run_id>`).
3. Run `node scripts/maintenance/lib/extract-worklist-seed.mjs <summary.json> scripts/_worklists/
   attach-found-sources.seed.json` - pulls every `steps.orphans[]` entry whose `outcome` is `unprovable`
   (STEP C's own "exhausted the whole capture pool, found nothing" residue - the outcome a DRY run
   actually produces), plus every `steps.source[]` entry whose `outcome` is `no_candidate_url` or
   `unresolved` (only reachable on an APPLY run that actually fetched and still could not resolve), into
   `{item_id, token, class, sentence, search_id}` seed rows, deduplicated on `(item_id, token)`,
   deterministically ordered (item_id then token, both ascending - a re-run over the same summary.json is
   byte-identical, safe to diff). `item_bound_hit` (the per-item wall-clock backstop cutting a token off
   before it was even tried) is deliberately excluded on both paths - untried, not exhausted. **This is
   heal-provenance.mjs's OWN measurement, never a second orphan-detection mechanism** - the extraction
   utility only reshapes `per_item[].steps.source[]` / `.orphans[]`, it never re-scans anything itself.
4. Commit the seed file under `scripts/_worklists/` (WITHOUT `url`/`quote` - the browser lane fills
   those next) and hand it to the Haiku browser lane.
5. The browser lane fills `url` + `quote` for as many rows as it can find a source for, leaves a row
   bare (seed-only) where it found nothing, and returns the completed worklist file.

**CONSOLIDATING PARALLEL BROWSER LANES** (Lane CONSOLIDATE-ATTACH, 2026-09-06): when the seed is split
across several parallel browser-lane slices (each lane working its own `attach-found-sources.slice-<i>.
seed.json` cut of the master seed, each returning its own `slice-<i>.json` (sourced) and
`slice-<i>-unsourced.json` (disposition/`queries_tried`/optional `note` for rows it could not find a
source for) - plus any earlier consolidated sourced/unsourced pair from a prior pass), run
`node scripts/maintenance/lib/consolidate-attach-worklist.mjs --seed <master-seed.json> --sourced
<file1.json> [<file2.json> ...] --unsourced <file1.json> [<file2.json> ...] --out-sourced
<sourced.json> --out-unsourced <unsourced.json>` (also `npm run worklist:consolidate-attach --`,
same args). It validates every sourced row's `(item_id, token)` against the master seed
BYTE-IDENTICAL (never retyped), drops and reports any row failing that check, any duplicate
`(item_id, token, url)` triple, any row with an empty `url`/`quote`, and any `url` that is not
http(s); it then builds the unsourced file as every remaining seed row not sourced, carrying whichever
slice's `disposition`/`queries_tried`/`note` names that exact pair. It prints the proof -
`sourced_count + unsourced_count === seed.length`, plus counts of any rows found in BOTH files, any
seed row missing from every input, and any seed pair duplicated across two slices' unsourced files -
and exits non-zero if that invariant fails. It also reports (never drops) two quality flags per
CLAUDE.md rule 18: a sourced row whose `url` host is Wikipedia or a known news/aggregator host with no
`note` explaining why nothing more authoritative was found, and a sourced row whose `quote` does not
contain `token` verbatim (case-sensitive, after whitespace-collapse - a report-only proxy; the real
GROUND check is still `heal-provenance.mjs`'s own `locateSpanInText` against the fetched page). See
that file's own header and `consolidate-attach-worklist.test.mjs` for the full contract.

**THE DEFECT this section had, 2026-09-05 through 2026-09-06** [CONFIRMED by the coordinator, from
maintenance dispatch #55 = `provenance-heal mode=dry arg=quarantined-live`, run **34041907817**]: this
section originally said the seed comes from `steps.source[]` entries with `outcome` `no_candidate_url` or
`unresolved`. In a DRY run STEP SOURCE never fetches, so its outcomes are only
`would_capture_and_ground`/`would_register_and_capture`/`bound_hit`/`item_bound_hit`/
`worklist_ambiguous_host` - never the two the extractor was reading - so extracting from a dry run's
`summary.json` (run 34041907817's own: `counts.source_no_candidate_url: 0`, `counts.source_unresolved:
0`) always produced a **0-row seed**. The 441 orphan figures that run actually measured (`counts.
orphans_unprovable: 441`, `counts.orphans_item_bound_hit: 2`) were sitting under `steps.orphans[]`,
`outcome: "unprovable"`, the whole time. Fixed in `scripts/maintenance/lib/extract-worklist-seed.mjs`
(Lane SEED-FIX, 2026-09-06; see that file's own header for the full explanation and its test for a
fixture cut from run 34041907817's real summary). The fixed extractor was run over the real, committed
run-34041907817 summary and produced the real **441-row** seed, now committed at
`scripts/_worklists/attach-found-sources.seed.json`; the 1.9MB `summary.json` itself was `git rm`'d after
extraction (machine evidence does not live in the repo - CLAUDE.md rule 5). The coordinator's next step
is to hand that committed 441-row seed to the Haiku browser lane per step 5 above - no new
`provenance-heal` dispatch is needed to regenerate it.

**Ruling**: none - the operator's "attach a source, don't blame the item" ruling above is the gate; no
`--arg` token beyond the worklist path is required.

**Idempotent by construction, not by extra bookkeeping**: a token STEP SOURCE has already grounded (this
dispatch or an earlier one) is no longer a Gate-A orphan on the next fresh scan, so it is never offered a
worklist candidate to try again - re-dispatching the SAME worklist against an item with no remaining
orphans is a clean no-op, never a duplicate write.

**Dispatch**: `--arg` IS the worklist file path (e.g. `scripts/_worklists/attach-found-sources.seed.json`),
**required in both modes** - there is no default population the way `provenance-heal`'s blank arg means.
`mode=dry` reads the SAME selection and runs the SAME STEP SOURCE plan as `mode=apply` with zero writes
and zero fetches beyond what `mode=dry` already means for `heal-provenance.mjs`. `mode=apply` writes
through the SAME guarded path `provenance-heal` uses (`buildHealDeps`, re-exported from that step's own
wrapper so there is exactly one DB-wiring block for both steps - rule 015, "one guarded write path").

**Artifact / read back**: `summary.json`'s `counts.worklist_rows` / `worklist_ready` /
`worklist_not_ready` / `worklist_malformed`, `counts.items_selected`, `counts.grounded_via_worklist`
(every `via: "worklist"` outcome across the underlying heal run's `per_item[].steps.source[]`), and
`counts.heal` (the full `heal-provenance.mjs` counts for the selected items). Confirm against
`SELECT count(*) FROM section_claim_provenance WHERE ... ` for the newly-inserted claim ids the heal
summary's own `per_item[].steps.source[].claim_id` names, and re-run the same Gate-A orphan measurement
(`provenance-heal --mode dry` on the same 76 items) to confirm the grounded tokens no longer appear.

---

