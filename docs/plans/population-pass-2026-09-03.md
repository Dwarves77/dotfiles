# Population pass, decision-ready (2026-09-03)

Lane POP-PREP. Waves 2 and 3 have landed (master `910ee54d`). This is not a population dispatch — this
lane has no DB credentials and dispatches nothing. It makes the one population pass + one flywheel turn
decision-ready: pipeline proven on constructed input, the live-slot migration staged with its own
self-check, the exact dispatch table, and every open ruling with the live number behind it.

## 1. Pipeline readiness — proven, not read

Ran the real scripts (`export-census-rows.mjs` → `run-mint-batch.mjs` → `validate-mint-payload.mjs` →
`apply-mint-batch.mjs --dry`) against 3 constructed rows, dep-injected per `apply-mint-batch.test.mjs`'s
own pattern (no network, no DB — every DB touch is a fake `readAll`/`guardedInsert`/... that throws if
called in dry mode). Script: `fsi-app/scripts/tmp/dry-pipeline-proof.mjs` (gitignored scratch, not
committed; re-runnable with `node scripts/tmp/dry-pipeline-proof.mjs` from `fsi-app/`).

**Row 1 — regulation, through export-census-rows.mjs's real machinery.** A constructed `census_worklist`-
shaped row (CELEX `32026R1234`, EUR-Lex host) went through `partitionByScreen` (screened `on_vertical` via
a reviewed-verdict override — a fresh title predictably hits screen-rules.mjs's `no_signal_ambiguous`
default, so this used the SAME reviewed-verdicts escape hatch a real ambiguous row uses), then
`resolveIdentity` (real CELEX→item_type resolution, no shortcut) and `buildExportRow` (real row-shaping).

**Rows 2 and 3 — market_signal / research_finding, hand-built per MINT-RUNBOOK.md §11's documented
escape hatch, NOT through export-census-rows.mjs.** [CONFIRMED by grep] `export-census-rows.mjs` contains
no reference to `market_signal` or `research_finding` anywhere — its `resolveIdentity` only ever returns
`regulation`/`directive`/`initiative`/`guidance`/`framework` (EUR-Lex CELEX-letter map, UK legislation
path segment, Federal Register API type, or a registered-institution `regulatory`-category fallback). This
is architectural, not a defect in this lane's construction: **the census-worklist pipeline mints only
regulation-family items.** market_signal record items are populated by
`scripts/producers/market/propose-series-items.mjs` (R-D, still open — see §5); research_finding record
items by `scripts/turns/research-sweep.mjs` (`buildResearchRecordPayload`, a SEPARATE builder from this
migration's `record-facts.mjs`, using the same slot vocabulary — see §2's caveat). Rows 2/3 were built in
the enriched-row shape `run-mint-batch.mjs --census-rows` documents, with `screen: {verdict: "on_vertical",
provenance: "reviewed", ...}` set by hand, exactly the escape-hatch procedure MINT-RUNBOOK.md §11 already
specifies for a row no automated identity path reaches.

**No step refused.** Summary lines:

```
buildPayloadsFromCensusRows: built 3 buildFailures []

run-mint-batch summary: {"attempted":3,"valid":3,"invalid":0,"validator_first_pass_rate":"3/3 = 100.00%"}
  census-reg-1: valid=true recommended_status=verified
  census-mkt-1: valid=true recommended_status=verified
  census-rs-1: valid=true recommended_status=verified

apply-mint-batch: mode=DRY payloads=3
  [1/3] census-reg-1: would_apply
  [2/3] census-mkt-1: would_apply
  [3/3] census-rs-1: would_apply
apply-mint-batch: DRY — nothing written (no DB write, no census_worklist stamp, no mint-run artifact enrichment).
db writes attempted during dry run: 0 []
```

Confirmed field-level (`validate-mint-payload.mjs` direct re-check, matching `runBatch`'s own internal
call): row 2's `item.corridor_identity = {"origin_locode":"CNSHA","dest_locode":"NLRTM","mode":"ocean",
"seed":"CNSHA-NLRTM:ocean",...}` (FACT, extracted from a constructed "CNSHA-NLRTM by ocean" span); row 3's
`item.research_credibility = {"evidence_agreement_signal":"Peer-reviewed study finds SAF blending costs
falling faster than forecast","source_authority_signal":"published by a peer-reviewed journal"}` (both
FACT). Row 1's `binding_position`/`due_date` came back GAP (null) — correct: the constructed body used
passive "Member States shall apply"/"applies to undertakings" language that does not match
`BINDING_POSITION_TRIGGERS`' duty-holder-first phrasing (`"the carrier shall"`, `"freight forwarders
shall"`, ...) — the extractor is conservative by construction, not broken. **No defect found; nothing in
this lane's write set needed a fix.**

## 2. The live-slot question, settled as a migration — NOT applied

`fsi-app/supabase/migrations/299_item_type_required_slots_wave3.sql` (new, INSERT-only, ON CONFLICT DO
NOTHING, same convention as migrations 113/126/129 for this table). Inserts the three rows the kit
(`item-type-required-slots.json`) already requires and the live table does not:
`market_signal.corridor_identity`, `initiative.corridor_identity`, `research_finding.
evidence_agreement_signal`, `research_finding.source_authority_signal`.

**Self-check SQL** (in the migration's own header, run BEFORE applying):

```sql
WITH new_required_slots(item_type, slot_key) AS (
  VALUES
    ('market_signal', 'corridor_identity'),
    ('initiative', 'corridor_identity'),
    ('research_finding', 'evidence_agreement_signal'),
    ('research_finding', 'source_authority_signal')
)
SELECT COUNT(DISTINCT i.id) AS n_would_fail
FROM intelligence_items i
JOIN new_required_slots s ON s.item_type = i.item_type
WHERE i.provenance_status = 'verified'
  AND NOT EXISTS (
    SELECT 1 FROM section_claim_provenance c
    WHERE c.intelligence_item_id = i.id
      AND c.claim_kind IN ('FACT', 'GAP')
      AND c.claim_text ILIKE '%' || s.slot_key || '%'
  );
```

(a per-slot breakdown version, same shape, is in the migration file too).

**[HYPOTHESIS, not read live — no DB credentials in this lane]:** for market_signal/initiative, N is
expected to equal the FULL live count of verified items of those two types — every `population-turn` run
to date exported only from `census_worklist`, whose exporter has no path to `market_signal` (§1's finding),
so no record-grade market_signal/initiative item exists yet, and `corridor_identity` as a slot_key string
is new with Lane INTAKE (2026-09-02), grep-verified to appear nowhere else. For research_finding, ONE
caveat: `record-facts-research.mjs` (`research-sweep.mjs`'s builder, a DIFFERENT module from this
migration's `record-facts.mjs`) also emits `evidence_agreement_signal`/`source_authority_signal` claims —
if `source-sweep --subject research --apply` has ever landed, some verified research_finding items may
already carry these claims and N could be lower. This lane found no evidence of that dispatch in
PROGRAM-BOARD.md or session-log Addenda 84-85 (RSRCH's board row describes what was BUILT; R-D, the
adjacent ruling, is still OPEN per finish-plan §1) — so N is still expected to equal the full count, but
run the query above to confirm before trusting it.

**Sequence** (stated in the migration's own header): (1) run the self-check to get N; (2) apply 299; (3)
the SAME population pass re-mints those N items so criterion 5 never actually fails on a live read (the
trigger only re-fires on a write, and the re-mint is that write); (4) confirm zero of the N is left
`quarantined` for `missing_required_slot`.

**Gap named, not silently left implicit: no re-mint mechanism exists for step 3.** `apply-mint-batch.mjs`'s
M4 pre-check refuses ANY payload whose `source_url` (or `canonical_instrument_key`) already holds a live
item — `not_applied_url_holder` / `not_applied_holder_conflict` — regardless of the holder's status. Since
the N items are already `verified` at that exact `source_url`, re-running them through
`population-turn.yml`'s normal export→apply path would be BLOCKED by the same guard that stops duplicate
mints, not accepted as an update. **This is not buildable inside this lane's write set** (not named in the
dispatch's WRITE SET, and it is a new script, not a fix to an existing one this lane's dry run broke) — it
needs either (a) a small new coordinator-only script that reads each of the N items' existing captured
text (`agent_run_searches`), calls `record-facts.mjs`'s already-exported `extractCorridorFact` /
`extractSlotFact` directly, and `guardedInsert`s the resulting FACT-or-GAP claim onto the EXISTING item
(never re-inserting the item row), then lets the trigger re-derive `provenance_status` — the same
"claims added, item untouched" shape `rederive-record-provenance.mjs` already uses for re-derivation, or
(b) routing through `canonical-pipeline.ts`'s `groundBrief` non-destructive diff/apply path (MINT-RUNBOOK
§12), which is architected for exactly this "add to an existing grounded item without destroying prior
grounding" case but is today only reachable from the brief tier, not `--census-rows`/record-grade. Flagging
this as the one piece of the sequence that needs a ruling (build (a) as a follow-up lane, or accept a
short quarantine window on the N items between step 2 and a future re-mint) before step 2 is dispatched.

## 3. The batch, the dispatch table

**Selection is NOT a hand-written SQL query.** `export-census-rows.mjs`'s own filter chain already does
it live: `dryrun_disposition = 'would_mint'` → `--exclude-held` (drops any row whose `document_url`
already has an `intelligence_items` row, archived included) → `partitionByScreen` (`on_vertical` only) →
`--limit`. The "1,771-row clean pool" (Addendum 76) and the "459 archived-holder rows" were two SEPARATE
sets from the start (clean-pool rows never had a holder); §5 below shows the archived-holder set appears
already resolved as of Addendum 77-78, two days before this pass, which — if confirmed live — means
nothing needs to be subtracted from the clean pool at all. The N re-mint items from §2 are NOT
`would_mint` census rows (they are already-verified items) and do not go through this exporter at all —
they need §2's separate re-mint mechanism, dispatched alongside, not as part of `population-turn.yml`'s
own selection.

**Runbook-allowed batch size**: MINT-RUNBOOK.md §6, 40-80 payloads per run; the finish plan's own dispatch
sequence (§3) used limit 50 for the first slice, then limit 200 once the pipeline was proven (it now is,
per §1). `population-turn.yml`'s own default is `limit: '50'`.

**Population turn — dry first, then apply** (`workflow_dispatch`, `.github/workflows/population-turn.yml`):

| input | dry | apply |
|---|---|---|
| `mode` | `dry` | `apply` |
| `limit` | `200` | `200` (repeat at 200 until the on-vertical pool is exhausted, per finish-plan §3 step 1) |
| `source_id` | (blank) | (blank) |
| `celex_prefix` | (blank) | (blank) |
| `capture` | `true` | `true` |
| `rows_file` | (blank — live export) | (blank) |

Secrets already wired in the workflow env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`APP_URL`, `WORKER_SECRET` (the last pair for the post-apply cache flush, PERF train). Read every
artifact (`minted_verified`/`apply_failed`/`census_rows_reconciled`) against the live table before the
next dispatch, per the runbook's own hand-off model.

**Corpus turn — since 1970 per the plan** (`.github/workflows/corpus-turn.yml`), run AFTER the population
apply so discovery/extraction sees the newly minted items:

| input | dry | apply |
|---|---|---|
| `mode` | `dry` | `apply` |
| `since` | `1970-01-01` | `1970-01-01` |
| `signals` | `true` | `true` |

**The flywheel turn** — three separate dispatches, run after the corpus turn (finish-plan §3 step 3),
"the flywheel" being the two-mechanism thing the ledger's standing corrections already name (connection
discovery, live; decision propagation, live as of Wave 2's migration 284/285):

`.github/workflows/change-detection.yml`:

| input | dry | apply |
|---|---|---|
| `mode` | `dry` | `apply` |
| `check_limit` | (blank — route default 10) | (blank) |
| `skip_check` | `false` | `false` |

`.github/workflows/propagation-drain.yml` (run after change-detection, so derived values see the
refreshed graph):

| input | dry | apply |
|---|---|---|
| `mode` | `dry` | `apply` |
| `batch` | `500` | `500` |
| `backfill_entities` | `true` | `true` |
| `seed_derived_values` | `true` | `true` |

`.github/workflows/source-sweep.yml` — Federal Register apply + one feed subject (finish-plan §3 step 3):

| input | Federal Register | one feed subject |
|---|---|---|
| `walker` | `register-federal-register` | `feed` |
| `from` / `to` | operator picks the window (e.g. last `since` date → today) | n/a |
| `feed_url` | (blank) | operator picks one live feed from the `sources` registry |
| `mode` | `dry` then `apply` | `dry` then `apply` |

## 4. F28

This lane changes NO mint governing file (the 8-file list: `MINT-RUNBOOK.md`,
`validate-mint-payload.mjs`, `payload-schema.json`, `item-type-required-slots.json`,
`lib/gate-a-scan.mjs`, `lib/gate-a-match.mjs`, `lib/canonicalize-citation-url.mjs`,
`src/lib/intake/record-facts.mjs`). Migration `299_item_type_required_slots_wave3.sql` is a NEW file, not
in that list, and changes only the LIVE database table, not the kit's own JSON mirror (already correct).
`fsi-app/scripts/harness-runs/mint/PENDING-RUN.md` is UNCHANGED and needs no re-stamp: it still correctly
names `mint-run-015` as the run that supersedes it at hash `sha256:c933647da54908a1`, and this lane did not
touch that hash's inputs. [CONFIRMED] `node .discipline/fitness/runner.mjs` → F28 `PASS` in this worktree.

## 5. Open rulings that block a step

| # | Question | Live number | Status |
|---|---|---|---|
| R-A | Archive or park the census-worklist off-vertical rows? | 1,655 [CONFIRMED, Addendum 84 ps20 dry run] | Open — gates HYG-2's `census-off-vertical` MAINT step, not this pass's exporter (which already excludes them via the screen) |
| R-B | The 10 ambiguous live record items | 10 [CONFIRMED, mint-run-014/PENDING-RUN.md] | Open — recommendation on file (archive as off-vertical), not executed |
| R-C | W1 register: wire/delete/hold/keep split | Doc's stated line: WIRE 8 / DELETE 8 / HOLD 6 / KEEP 3 (=25+1 linked=26). `w1-dispositions.mjs`'s own per-row body-section read [CONFIRMED, that script's header]: WIRE 8 / DELETE 10 / HOLD 6 / KEEP 2 (=26). DELETE and KEEP disagree by 2/1. | Open — `w1-dispositions.mjs` sets `split_mismatch: true` rather than resolving it; the document needs repair (or the operator picks a number) before ratification, per Addendum 84 ps20 |
| R-D | SERIES_ITEM_MAP: six oil-bulletin series → published_price_statistics record items | 6 series keys, `propose-series-items.mjs --propose-items` emits 6 validating payloads [CONFIRMED, MINT-RUNBOOK §11 addendum table] | Open — no apply has run |
| R-E | origin_class backfill mapping | 983 NULL / 940 classifiable [CONFIRMED, Addendum 84 ps20 dry run] | Open |
| R-F | EIA_API_KEY repository secret | n/a | Open — operator creates it; blocks only the EIA producer step |
| The 459 (corrected 529) archived-holder rows | Un-archive rule-matched vs. reconcile off-vertical vs. mint-fresh | **[INFERRED from session-log, not read live]** appears ALREADY RESOLVED: Addendum 77 executed the operator's ruling (un-archive rule-matched) over the corrected 529-row set — 37 un-archived+verified, 491 reconciled into their archived items off-vertical, 1 pair held for investigation; Addendum 78 retracted that pair's suspected mis-keying (32018D0491 is correctly keyed) and it was un-archived as rule-matched. No later addendum (79-85) mentions "archived-holder" again. | **The dispatch brief's "459 archived-holder rows" line item is likely stale** — recommend the coordinator run a quick live count (`SELECT COUNT(*) FROM census_worklist WHERE dryrun_disposition='would_mint' AND enumeration_status <> 'reconciled' AND <has an archived holder>`) to confirm zero remain before treating this as a blocker |
| W1 | (same row as R-C above — the register itself, distinct from R-C's ratification) | 26 rows, split disputed | Open, same blocker as R-C |
| §2's re-mint gap | Does the N items' re-mint (migration 299 step 3) get a new coordinator script, or does the pass accept a temporary quarantine window? | N unread (§2's SQL) | Open — new, named by this lane; blocks migration 299's own sequence step 3, not the regulation-family batch in §3 |

## 6. UX

None. No surface (`.tsx`/`.css`) file was touched. The UX contract in
`docs/dispatches/lane-common-contract.md` does not apply to this lane's write set.
