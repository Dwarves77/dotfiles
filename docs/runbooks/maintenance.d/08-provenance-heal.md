## 8. `provenance-heal`

**Purpose**: attach the grounding a quarantined or archived-unreasoned item was missing, per the
operator's ruling (verbatim, 2026-09-03): "if items are being flagged as not credible for the site
because of not having sources that is an issue with finding the source not that item. you need to attach
a source. the item isn't [bad] because you didn't do that." Live population this closes against
(coordinator-confirmed, Supabase, 2026-09-03): 97 live `quarantined` items (83 × criterion 7
`gate_a_unproven_or_stale`, ~36 × criterion 5 `missing_required_slot`, ~30 × criterion 3 ungrounded
claims - an item can fail more than one), 135 live items with no grounding capture at all, 58 archived
items with `archive_reason IS NULL` (51 `unverified` + 7 `quarantined`), and 149 verified
market_signal/initiative/research_finding items predating the wave-3 required slots (migration 299,
written and not yet applied - see section 4 header note below).

**Upstream**: `scripts/mint/heal-provenance.mjs`'s own guarded `main()` - five steps, each reading what
the previous wrote (capture, ground, slots, Gate A, re-derive), importing every governing file unmodified:
`export-census-rows.mjs` (per-family capture resolution - Cellar-first for CELEX, the Federal Register
API for federalregister.gov, a plain polite GET otherwise), `record-facts.mjs` /
`record-facts-research.mjs` (slot extraction - the SAME extractors a fresh mint uses), `write-item.ts`'s
`buildGateARow` (the live Gate-A scanner), and `item-type-required-slots.json` (the slot vocabulary, read
only). This wrapper (`scripts/maintenance/provenance-heal.mjs`) re-exports that core's `main`/
`parseSelection` unmodified and wires the real `db.mjs` guarded writes + a 1 req/s polite fetch
(`export-census-rows.mjs`'s own `makePoliteFetch`) - see the core file's own header for the exact
per-step contract.

**Ruling**: the operator's ruling above is the gate - there is no separate R-token. `--arg` selects the
population:
- (blank) or `quarantined-live` - every live (`is_archived=false`), `quarantined` item (the default).
- `archived-unreasoned` - archived items with `archive_reason IS NULL` (the same ruling, archive side).
- `ids:<uuid,uuid,...>` - exactly these items, any current status.
- `slots-backfill` - every verified, **live** (`is_archived=false`) `market_signal`/`initiative`/
  `research_finding` item ACTUALLY missing a slot the kit's `item-type-required-slots.json` now requires
  (narrowed live, not just by item_type - an item already carrying the new slot's FACT-or-GAP claim is
  skipped). **Sequencing note**: migration 299 (the matching LIVE `item_type_required_slots` rows for
  `corridor_identity` / `evidence_agreement_signal` / `source_authority_signal`) is written but **not
  applied** - the kit (`item-type-required-slots.json`) is deliberately stricter than the live table until
  this selection has run once (see that migration's own header). Dispatch `slots-backfill --apply` BEFORE
  the migration lands, so criterion 5 never actually sees a gap on a live read once the migration applies.
  **Does not reach an archived item** - see `kit-backfill` below, and its own subsection at the end of this
  section, for why that matters for migration 299 specifically.
- `kit-backfill` (2026-09-05, lane KIT-BACKFILL, W2.3/W2.4) - the generalized superset of `slots-backfill`:
  every verified item of **every** item_type `item-type-required-slots.json` has an entry for (not only the
  three above), **archived items included**, missing >=1 required slot. Same underlying resolver
  (`resolveKitBackfillCandidates` in `scripts/mint/heal-provenance.mjs`; `slots-backfill` is now a thin call
  into it with its original three-type/live-only defaults, byte-identical behavior, unchanged). See this
  section's own "`kit-backfill` and migration 299" subsection below for the live counts and the exact
  migration-299 dispatch sequence this selection completes.

**Dispatch**: `mode=dry` reads every selected item's REAL current captures/claims/sections live and plans
all five steps (which claims would ground, which slots would fill FACT vs GAP, what Gate A would say, what
`validate_item_provenance` says right now) with **no network fetch and no write** - it lists the fetches
it would make. `mode=apply` performs the plan through the guarded path (rule 015): `agent_run_searches`
inserts (full text, never truncated - ADR-016), `section_claim_provenance` span rewrites/inserts,
`intelligence_item_sections` inserts/updates, `item_gate_a_state` upserts, and the `intelligence_items`
touch that fires `set_provenance_status` (the same touch `rederive-record-provenance.mjs` uses; ADR-017
gates the `-> verified` escalation to `pg_trigger_depth() >= 2`, which this touch satisfies by
construction - never a direct status write). An item still failing after all five steps is left exactly
as it is, reported with the remaining criterion; nothing here forces a status or invents a fact. No
`--arg` beyond a valid selection is required for `apply` (unlike `tag-ratification`'s per-id gate): every
write this step makes is additive/reversible - grounding a span, filling an honest GAP, or un-archiving a
row `ADR-017`'s trigger-depth binding independently allows - never a downgrade or a deletion.

**Artifact / read back**: `summary.json`'s `counts` (`healed_verified`, `capture_held`,
`ungrounded_after_capture`, `slots_written_fact`/`slots_written_gap`, `gate_a_written`, `unarchived`,
`still_failing`, plus the second-pass counters below) and `per_item` (every step's outcome + evidence,
per item). Confirm against
`SELECT provenance_status, count(*) FROM intelligence_items WHERE is_archived=false GROUP BY 1` and
`SELECT count(*) FROM intelligence_items WHERE is_archived AND archive_reason IS NULL` before/after.

**Second pass (lane HEAL-2, 2026-09-03)**: the first pass's own `provenance-heal --arg quarantined-live
apply` run (coordinator-confirmed, live, 2026-09-03) landed gate-A state and slot claims on the 97
quarantined-live items (gate A written for 97, 79 slot claims, 4 spans re-grounded) but only 2 items came
back `verified` - the survivors were, in order of volume: criterion 3 `fact_below_authority_floor` (the
FACT's own `source_id` resolves to a tier ABOVE the item's floor, or `source_id` is NULL) - 596 claims on
tiers 3-7 plus 218 with a NULL `source_id`, floor = tier 2 unconditional for the reg family (migration
158); criterion 7 `gate_a_unproven_or_stale` (a prose fact with no span-proven claim) - 82 items;
criterion 4 `analysis_missing_label_syntax` (190) + `unlabeled_assertion` (29); a residue of criterion 3
`fact_span_not_in_source` (24), criterion 2 `ungrounded_url` (5), and criteria 5/6 (4+1). Operator ruling
this second pass builds (verbatim, same day): "if items are being flagged as not credible for the site
because of not having sources that is an issue with finding the source not that item. you need to attach
a source." Five new steps, run inside the SAME `healOneItem` pass, after CAPTURE/GROUND/SLOTS and before
the (now single, final) GATE A + RE-DERIVE:
- **B, OWN-BODY** - when the item's own registered source carries no `institution_id` (migration 122; a
  brand-new writer surface - nothing else in the codebase has ever written it), resolve one by the SAME
  identity rule `institution-key.mjs`/`registerSource` already dedup the `sources` registry by, and write
  it through the guarded path. Targets the 7 items whose own-body standard-floor scoping (migration 202)
  was defeated by a NULL institution.
- **A, RESOURCE** - a FACT claim failing the authority floor or carrying a NULL `source_id` gets
  `source_id`/`search_result_id` re-pointed to a floor-qualifying capture, found across three ranked
  buckets: the item's own canonical capture, another of the item's captures from a floor-qualifying
  source, then the corpus pool (OTHER items' captures of the SAME canonical URL - a batch-scoped
  `.in("result_url", ...)` read, never a whole-table `agent_run_searches` scan). `source_span` is
  rewritten to the verbatim match; `claim_text` is never touched.
- **E, RECLASSIFY** - the residue A and GROUND could verify nowhere: re-kind FACT -> ANALYSIS (the
  labeling discipline's own honest escape hatch), `claim_text` unchanged.
- **C, ORPHANS** - a Gate-A orphan (criterion 7) searched across STEP A's same capture pool; found ->
  a new FACT claim (verbatim span = the token); found nowhere -> reported `unprovable`, never invented -
  the brief is NEVER edited by this step.
- **D, RELABEL** - the ONLY step that edits prose, and only by PREPENDING one of the four label forms to
  a paragraph an ANALYSIS claim or an unlabeled-assertion section's modal sentence already lives in.
  Nothing reworded, deleted, or moved.
New `counts`: `own_body_resolved`, `resourced`/`unresourced`, `orphans_grounded`/`orphans_unprovable`,
`relabeled_paragraphs`, `refactored_to_analysis`. New writes: `sources.institution_id` (UPDATE) and
`institutions` (INSERT, find-or-create) - both recorded narratively in
`fsi-app/docs/inventories/shared-dataset-ownership.md`'s "Open leaks summary" rather than the enforced
JSON allowlist, the SAME basis that document already applies to `sources` itself (not a harness/flywheel
shared-8 table). Per-step expected effect on the 95 survivors is `[INFERRED]` from the coordinator's own
failure-count breakdown above until the coordinator's own apply dispatch measures it.

**Third pass (lane HEAL-3, 2026-09-03)**: the second pass's own `provenance-heal --arg quarantined-live
apply` run (coordinator-confirmed against the run artifact and the live table, run 33797952379) landed on
the 95 quarantined-live survivors - `resourced 57, unresourced 616, own_body_resolved 6, orphans_grounded
130, orphans_unprovable 862, relabeled_paragraphs 228, refactored_to_analysis 638, gate_a_written 95,
healed_verified 0, still_failing 95` - and RE-DERIVED to a WORSE label/slot shape than the run started
with: `analysis_missing_label_syntax` 594 (up from 190), `gate_a_unproven_or_stale` 88,
`fact_below_authority_floor` 81, `missing_required_slot` 28 (up from 4), `ungrounded_url` 5,
`missing_full_brief` 1. Live verified count unchanged at 621. Three defects fixed, one broadening, all in
`scripts/mint/heal-provenance.mjs` (HEAL_VERSION `hp3-2026-09-03.1`):

1. **RELABEL never applying, mis-attributed to step order.** The dispatch attributed the tripled
   `analysis_missing_label_syntax` count to RELABEL (D) running before RECLASSIFY (E) - re-reading the
   file's own step sequence (STEP B → STEP A → STEP E → STEP C → STEP D, unchanged since the second pass)
   shows E already runs before D; that premise is **[REFUTED]**, corrected in place per rule 14. The real
   mechanism: RELABEL's owning-section/paragraph lookup used a raw case-folded `.includes()`, never the
   normalizer GROUND itself uses (whitespace runs, curly/straight quotes, HTML entities) - a re-kinded
   claim whose `claim_text` differed from its own paragraph by that drift matched neither lookup, and the
   miss was silently swallowed with no report entry at all. Fixed: both lookups now go through
   `locateSpanInText` (the same three-tier exact/normalized/normalized_ci matcher GROUND already uses),
   and every miss - no owning section, or an owning section whose paragraph never matches even under
   normalization - reports `no_owning_section_found` with the claim id.
2. **Slot FACT residue re-kinded to ANALYSIS, dropping criterion-5 coverage.** RECLASSIFY had no awareness
   of the `"[<slot_key>] "` marker (migrations 114/119/121, migration 299's own self-check) and re-kinded
   slot-claim residue the same as any other claim, which is how `missing_required_slot` went from 4 to 28.
   Fixed two ways: a new **SLOT-REPAIR** step (before RELABEL) retroactively converts every already
   mis-kinded ANALYSIS claim carrying a required-slot marker back to the kit's own honest GAP for that
   slot; RECLASSIFY itself now branches the same way prospectively - a required-slot FACT claim's
   unrecoverable residue becomes GAP, never ANALYSIS. Both paths call `buildSlotClaim` (with
   `capturedText=""`) for the GAP text, so it is byte-identical to a fresh honest-absence write, never
   hand-duplicated.
3. **Gate A vs. labels - a finding, not a fix** (`gate-a-scan.mjs` is a mint governing file, out of this
   lane's write set). Code path: `scanBrief` (`fsi-app/scripts/mint/lib/gate-a-scan.mjs`) takes only
   `fullBrief` + `factClaims`; it has no reference anywhere to `ANALYSIS_LABEL_RE` or any label form, and
   its only coverage test is a literal-substring check against the FACT-claim corpus (`isBacked`). A
   figure/date token inside an already-labeled `*Analytical inference:*` paragraph is therefore still
   counted as a Gate-A orphan - the label satisfies criterion 4 only, never criterion 7. Compounding this:
   `item.full_brief` (what `scanBrief` scans, per `validate-mint-payload.mjs` criterion 7 and this file's
   own `planGateA`) and a section's `content_md` (what RELABEL edits, and what criterion 4 itself scans)
   are two SEPARATE stored fields - RELABEL's own prose edits never touch `full_brief`, so even a
   successfully labeled paragraph has zero effect on the Gate-A orphan count. Measurement the dispatch
   asked for (862 unprovable orphans, full_brief prose vs. section prose): **100% full_brief, 0% section
   prose**, established analytically from the scanner's own signature (`scanBrief(fullBrief, factClaims,
   ...)` never receives section content at all) rather than from the run artifact, which this lane's
   worktree has neither DB nor artifact access to.
4. **CAPTURE-CITED (broadening).** STEP 1's CAPTURE only ever fetched when an item had NO usable capture
   at all. A new step, CAPTURE-CITED, runs before RESOURCE/ORPHANS and fetches every URL an item's
   sections/claims already cite that is not yet captured for that item: URLs literally present in section
   `content_md` (criterion 2's own parenthesis-balanced `URL_RE`, mirrored verbatim) plus each claim's
   registered source URL (resolved via `source_id` → the `sources` registry, since a claim carries no
   `source_url` column of its own). `intelligence_items.source_urls`, named in the brief as a third URL
   source, does **not exist** as a column or array anywhere in `supabase/migrations` (grepped in full,
   2026-09-03) and is never read. Bounded to 25 fetches/item/run (`CAPTURE_CITED_MAX_PER_ITEM`), reported
   with the overflow count. Adds a PDF branch (`src/lib/sources/pdf-extract.mjs`'s `pdfToText`, imported
   unmodified) the "plain GET otherwise" family never had; a mislabeled/corrupt PDF is held
   `pdf_unsupported`, never retried blind. New capture rows land in the same shared `captures` array
   RESOURCE/ORPHANS's own bucket builders already iterate, so no further wiring broadens their pool; this
   also directly targets criterion 2's `ungrounded_url` failure (a cited URL becomes a captured
   `agent_run_searches` row).

New `counts`: `slot_repaired_to_gap`, `reclassified_to_gap` (was folded into `refactored_to_analysis`
before this pass), `relabel_no_owning_section`, `cited_captured`/`cited_held`/`cited_bound_hit_items`. New
top-level summary field: `final_failures_by_item` (`{id, item_type, outcome, failures}` per item) - the
per-item residue the dispatch asked for, so the coordinator can read exactly which criterion each
still-failing item is stuck on without re-querying. No new table written (CAPTURE-CITED reuses the
existing `agent_run_searches`/`insertSearch` writer surface, distinguished only by `search_query =
"heal-provenance:capture-cited"`), so `shared-dataset-ownership.md` is unchanged by this pass. No mint
governing file touched (`gate-a-scan.mjs` read only, for the criterion-3 finding above).

**[CONFIRMED, coordinator-reported] Run #20, the first apply run under HEAL-5** (quarantined-live, the
same 95 items, adding the Wayback archive fallback + OJ-issue resolution - see
`scripts/mint/heal-provenance.mjs`'s own FIFTH PASS header) **ran 15m20s and was CANCELLED** by the
`maintain` job's then-`timeout-minutes: 15` - never finished. Because `scripts/maintenance/lib/cli.mjs`'s
own `writeSummary()` runs exactly once, after `main()` returns, a killed run wrote **no `summary.json` at
all**: no artifact content, no per-item residue, and no record of which of the run's own per-item DB
writes (each already applied through the guarded path, before the kill) actually landed on which items.

**Sixth pass (lane HEAL-BUDGET, 2026-09-04, `HEAL_VERSION` now `hp5-2026-09-04.2`)** fixes this, entirely
inside `heal-provenance.mjs` and its wrapper - `.github/workflows/maintenance.yml`'s "Upload this run's
step artifact(s)" step already carried `if: always()` before this pass (re-verified; GitHub's own docs
confirm `always()` runs even on a cancelled/timed-out job), so the observed "no artifact" was an *empty*
directory being uploaded honestly (`if-no-files-found: warn`), never a missing conditional - that step is
unchanged by this pass. Four changes:

1. **Job timeout raised 15 → 30 minutes**, with the arithmetic in the workflow file's own comment: HEAL-4
   (run #17, no archive fallback) measured 6.84s/item (650s / 95 items) cleanly; HEAL-5 adds, per the SAME
   60 `capture_blocked`/`capture_thin` cited urls the PRIOR run itself measured, up to 2 more
   politeness-paced (1 req/s) fetches each, plus up to 2 more per each of the 5
   `canonical_key_unresolved` OJ-issue items - ~130 extra 1s-paced requests, ≥130s of added wall time from
   pacing alone before real latency/PDF-extraction time is counted, which is why run #20's 920s (and
   counting - it had NOT finished) already overran HEAL-4's clean 650s by more than that floor. 30 minutes
   gives ~2× headroom over the already-insufficient 920s this job actually observed.
2. **Time budget.** `provenance-heal`'s step now sets `HEAL_TIME_BUDGET_SECONDS: '1500'` (25 min - 5
   minutes of margin under the 30-minute job timeout for Install/Population-BEFORE/AFTER/upload). The
   wrapper derives `deps.timeBudgetSeconds` from it; `heal-provenance.mjs`'s `main()` checks the budget
   **before starting each item** (never mid-item - an item's own ten-step sequence always runs to
   completion or not at all) and, once spent, stops cleanly: `summary.json` gets `stopped_at_budget: true`,
   `items_processed`, `items_remaining` (the ids never reached), exits **0** (a budget stop is an orderly
   partial completion, never a failure), with a console line naming the counts. A local by-hand run with no
   `HEAL_TIME_BUDGET_SECONDS` set is unbounded, unchanged from every prior pass.
3. **Checkpoint.** `main()` now writes `summary.json` **atomically** (temp file, then an os-level rename -
   POSIX-atomic on the runner's own `$RUNNER_TEMP`) **after every item**, not only once at the end - so a
   run killed by the runner itself (not just one that hits its own time budget and exits cleanly) still
   leaves the true, complete state of every item processed so far on disk. `cli.mjs`'s own final
   `writeSummary()` (unmodified) is still the last word on a run that finishes normally; the per-item
   checkpoint is a strictly additive safety net under it.
4. **Resume.** No new selection mode: a budget-stopped run's `items_remaining` is exactly the id list
   `parseSelection`'s existing `"ids:<uuid,...>"` shape already accepts. **Coordinator procedure**: if a
   dispatched `provenance-heal apply` run's artifact shows `stopped_at_budget: true`, re-dispatch
   immediately with `arg: "ids:<items_remaining joined by comma>"` (apply mode, same as any `ids:` dispatch)
   to finish the rest - repeat until a run's `summary.json` carries no `stopped_at_budget` key at all.
5. **Waste measured and removed** (no politeness/evidence change): CAPTURE-CITED fetched each cited url
   independently per item, with no run-level memory - two different items citing the SAME url (a shared
   regulatory source; the exact case STEP A's own "corpus pool of OTHER items' captures of the SAME
   canonical URL" bucket already exists to exploit) paid the full cost twice, up to 4 politeness-paced
   requests (direct fetch + Wayback availability + snapshot) for a url this run had already fully resolved.
   A run-level `citedUrlCache` (one `Map` per `main()` call, keyed by `canonicalizeCitationUrl` - the same
   equality rule `unfetchedCitedUrls` already uses) makes `captureCitedUrl` idempotent per run: a repeat
   url reuses the prior outcome's evidence with **zero** additional network calls, while every citing item
   still gets its **own** `agent_run_searches` evidence row (caching removes duplicate fetches, never
   duplicate evidence). Scoped to `captureCitedUrl` only, never STEP 1's `captureItem` (the two resolve an
   eurlex url's canonical key DIFFERENTLY on purpose - from the item's own `instrument_identifier` vs. from
   the url alone - merging their caches would let one item's identifier silently answer for another's
   citation). New per-item field: `steps.capture_cited.results[].cache_hit` and
   `steps.capture_cited.cache_hits`. Two other waste hypotheses were checked and **not** found:
   `makePoliteFetch`'s own 1 req/s gap is untouched (no over-long sleep), and no second pacing authority
   exists anywhere in this file - every fetch in every step already goes through the ONE shared
   `deps.fetchImpl` instance the wrapper wires once per run.

New `counts`/summary fields: `stopped_at_budget` (bool, present only on a budget-stopped run),
`items_processed`, `items_remaining` (same run); no change to any existing counter's meaning.

**[CONFIRMED, coordinator-reported] Run 33829526120, Maintenance #21 (HEAL_VERSION `hp5-2026-09-04.2`,
master `1356b381`, `provenance-heal apply`, `quarantined-live`, 11m56s, exit 0)**: 94 candidates, **0
`healed_verified`**, 94 `still_failing`, 88 `gate_a_written` with `orphan_count > 0`. Final failures by
criterion: (7, `gate_a_unproven_or_stale`) 88 items; (4, `analysis_missing_label_syntax`) 38 items; (3,
`fact_below_authority_floor`) 2; (2, `ungrounded_url`) 1; (6, `missing_full_brief`) 1; (5,
`missing_required_slot`) 1.

**Seventh pass (lane HEAL-6, 2026-09-04, `HEAL_VERSION` now `hp6-2026-09-04.1`)** diagnoses and fixes the
two largest of the six residual criteria above - see `scripts/mint/heal-provenance.mjs`'s own SEVENTH PASS
header for the full diagnosis, exact live SQL quoted, and measured counts. Neither
`validate_item_provenance` nor the scanner (`gate-a-scan.mjs`/`gate-a-match.mjs`) needed to change; both
bugs are entirely in `heal-provenance.mjs`'s own call sites - no new migration, no scanner edit, no
`PENDING-RUN.md` re-pin.

1. **Criterion 7 (88 items) - Gate B was never wired.** The live scanner has two coverage arms: LITERAL
   (a token verbatim in the FACT-claim corpus) and DERIVED/"Gate B" (a token covered by a valid,
   basis-grounded, non-stale `claim_kind='DERIVED'` claim - `gate-a-derived.mjs`'s own
   `derivedCoveredTokens`). `planGateA` never passed `derivedCovered` to `buildGateARow`, defaulting to an
   empty Set - every HEAL apply run's own Gate-A rewrite silently stripped legitimate Gate-B coverage the
   mint-time pipeline had already established. Measured live (read-only SQL, 2026-09-04): 16 real orphan
   tokens across 5 items (`ff4064ab-…`, `15f63ea9-…`, `3af75490-…`, `5b2c6655-…`, `bced4406-…`) would clear
   under this fix, `ff4064ab-…` alone going from 9 orphans to 1. **Fix**: `computeDerivedCovered(claims,
   captures)` (new, pure) mirrors `derivedCoveredTokens`'s own query shape entirely in memory, over data
   this file already holds - no new `deps` call. `planGateA(item, claims, derivedCovered = new Set())` now
   threads it through at all three call sites, each recomputed FRESH from the claims/captures in scope at
   that point (matching `canonical-pipeline.ts`'s own "recompute right before the write" discipline).
   **REFUSED, dormant in production**: `computeDerivedCovered` reads `d.basis_claim_id` off each DERIVED
   claim - `scripts/maintenance/provenance-heal.mjs`'s own `readClaims` SELECT (`id, claim_kind, claim_text,
   source_span, source_id, search_result_id, section_row_id`) does not project `basis_claim_id`, so every
   live DERIVED claim reads it as `undefined` and the computed Set stays empty in production until that
   column is added to the SELECT - a one-line change outside lane HEAL-6's write set
   (`scripts/maintenance/**`). The fix is written, tested (fixtures supply `basis_claim_id` directly, as a
   pure-function test constructs its own claim objects), and correct; it activates the moment that column is
   added, with no further code change.
2. **Criterion 4 (38 items / 148 claims) - RECLASSIFY/RETROFIT scoped narrower than the validator.**
   Criterion 4's own SQL checks, for every ANALYSIS claim, whether SOME paragraph in **any** of the item's
   sections (never scoped to one) both matches a label regex and `ILIKE`-contains `claim_text` verbatim.
   STEP E (RECLASSIFY, FOURTH PASS) and RETROFIT both scoped their own paragraph search to the claim's OWN
   `section_row_id`. Measured live (read-only SQL + this file's own code, 2026-09-04, all 148
   currently-failing ANALYSIS claims across the 38 affected items): 0/148 findable in the claim's own
   section; widening to every section of the item, guarded against heading/label-only false-accepts
   (`isSubstantiveParagraph`: ≥ `MIN_SUBSTANTIVE_TOKENS`=6 scoreable tokens AND a sentence-ending mark),
   finds a home for **100/148 (68%)**; 3 of the 4 items failing criterion 4 alone (`007f42b1-…`,
   `45f85547-…`, `87ed781c-…`) would have EVERY failing claim resolved, flipping fully to `verified` on the
   next apply run. **Fix**: `findOwningParagraphAcrossSections`/`planOwningParagraphRewriteAcrossSections`
   (new, pure) run the same Jaccard-overlap/sentence-pick/marker-strip pipeline across every section, tried
   ONLY after the existing own-section search refuses. A claim whose winning paragraph lives in a different
   section than its current `section_row_id` gets that column rewritten too (never `claim_kind`, for
   RETROFIT - its "patches `claim_text` only" contract, already asserted by an existing test, is preserved).
   A claim found nowhere - own section or any other - is refused exactly as before, reporting the better of
   the two searches' own best score.
3. **Not touched, per diagnosis**: STEP C's own inability to ground 386 of criterion 7's 824 measured
   orphan tokens (found in some non-canonical capture, zero in the item's own canonical capture, and - of
   those - zero qualifying for a floor-qualifying source: 167 have no `sources` registry row, 179 have one
   above the item's authority floor) is criterion 3 (the authority floor) working as designed, not a defect
   this lane's write set can or should close - grounding them would write a FACT claim whose source tier
   violates the floor, which the "no claims ahead of evidence" rule and this file's own header both forbid.
   **Superseded below (lane HEAL-7)**: the operator's ruling of 2026-09-04 overrules the REFUSAL half of
   this floor (never the grounding requirement) - see the EIGHTH PASS subsection.

**Next dry-run dispatch** (verify both fixes against the live 94-item quarantine before an apply run):
`provenance-heal`, `mode: dry`, `arg: "quarantined-live"` - expect `gate_a_written` orphan counts to drop
for the 5 named items above, and `reclassify`/`retrofit` entries to show `cross_section: true` for a
material share of the 38 criterion-4 items' claims. Follow with `mode: apply` on the same selection once
the dry run confirms.

**Eighth pass (lane HEAL-7, 2026-09-04, `HEAL_VERSION` now `hp7-2026-09-04.1`)** builds THE RULING
[CONFIRMED, operator, 2026-09-04, verbatim]: "get the source. then rate the source. it's that simple.
this isn't hard, find the source and then publish the data on the site." The ruling overrules the
REFUSAL half of criterion 3's authority floor - never the grounding requirement - for the 386 Gate-A
orphan figures HEAL-6 measured with no floor-qualifying source (167 with no `sources` row at all for the
figure's URL, 179 with a `sources` row above the item-type floor). See `scripts/mint/heal-provenance.mjs`'s
own EIGHTH PASS header for the complete mechanism.

1. **New step, SOURCE**, runs after CAPTURE-CITED/STEP A/E/RETROFIT, before STEP C/ORPHANS, so a token it
   grounds is simply not an orphan by the time ORPHANS' own fresh scan runs. For every current Gate-A
   orphan STEP A's own three buckets could not locate: finds the candidate cited URL(s) (the token's
   owning section, or every URL the item cites when it has no owning section - `candidateUrlsForOrphan`,
   bounded `SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN=5`), classifies each (`classifyCitedUrlForOrphan`) as
   `already_registered` (the 179 case - grounds on the existing source, no new row), `registerable` (the
   167 case - `classTierForHost`, SC-13's own deterministic host class table, NEVER a guessed tier;
   registered through `deps.registerSource`, the SAME guarded/institutionKey-deduped path
   `run-source-sweep.mjs`'s own registerSource use goes through), or `worklist_ambiguous_host` (SC-13
   forbids inventing a tier - reported, never forced; the token stays an honest orphan). A `registerable`
   or `already_registered` candidate is captured (`captureCitedUrl`, the SAME per-family resolution with
   the Wayback fallback CAPTURE-CITED already uses) unless already captured this run, then
   `locateSpanInText` on the captured page grounds a NEW FACT claim exactly as ORPHANS already does -
   `source_tier_at_grounding` is the REAL read-back tier (`deps.readSourceByUrl`), never the class table's
   own predicted tier alone. Bounded per item (`SOURCE_MAX_PER_ITEM=25`), overflow reported `bound_hit`,
   never silently dropped. Dry mode plans every candidate (`would_register_and_capture` /
   `would_capture_and_ground`) with zero writes and zero fetches.
2. **Migration 302** (`fsi-app/supabase/migrations/302_criterion3_rating_not_refusal.sql`, written,
   **NOT applied** - no DB write credential in this lane) patches `validate_item_provenance` in place: the
   `fact_below_authority_floor` check moves from `v_failures` to a new non-blocking `v_result.warnings`
   composite attribute (`{below_floor_facts, claims:[...]}`, same payload shape). `fact_missing_source_span`
   / `fact_span_not_in_source` / `fact_mint_hold` are UNCHANGED - an ungrounded claim still quarantines.
   `scripts/mint/validate-mint-payload.mjs` mirrors this in the same lane (its own `fact_below_authority_floor`
   push moves `failures` → `warnings`, `VALIDATE_MINT_PAYLOAD_KIT_VERSION` bumped to `vmp-2026-09-04.2`) so
   the kit and the function agree on what blocks.
3. **New deps wired** into `scripts/maintenance/provenance-heal.mjs` (its own write set, edited in this
   same lane): `registerSource(source)` → `db.mjs`'s own guarded, institutionKey-deduped registration, and
   `readSourceByUrl(url)` → the matching `sources` row (or null), same institutionKey identity rule.
   Neither is called in dry mode.
4. **Coordinator dispatch, once migration 302 is applied**: `provenance-heal`, `mode: dry`,
   `arg: "quarantined-live"` - expect `steps.source[]` entries across the 94-item quarantine naming
   `source_registered_and_grounded` (the 167 case) / `grounded_on_existing_source` (the 179 case) for a
   material share of the 386 measured tokens, `worklist_ambiguous_host` for any host SC-13 forbids
   registering, and `unfetchable` for a URL this container's own egress allowlist or the publisher itself
   refuses (see this lane's own report for which). Follow with `mode: apply` once the dry run confirms.
5. **UI**: the credibility/tier chip already renders on item surfaces (grepped: `src/components` - no
   `.tsx` edit in this lane's write set). Confirm at apply time that a FACT claim carrying a below-floor
   `source_tier_at_grounding` shows its chip on the regulations detail page the same way an above-floor
   FACT already does; if it does not, the fix is in whichever component renders
   `section_claim_provenance.source_tier_at_grounding` for that page, named in this lane's own report.

**Ninth pass (lane HEAL-8, 2026-09-04, `HEAL_VERSION` now `hp8-2026-09-04.1`)** diagnoses STEP SOURCE's own
live apply run (Actions 33844146038, `quarantined-live`, `HEAL_VERSION hp7-2026-09-04.1` - measured
read-only via Supabase MCP SELECT against the real rows, `summary.json` not on disk) and fixes the measured
causes. 359 `unresolved`, 302 `bound_hit`; a `token_not_in_page` sample (>=60 tokens across >=20 items)
classified: (A) NUMERIC-FORM MISMATCH - a different surface form of the same figure - ~1.4% of the sample;
(B) ELSEWHERE ON THE SITE - a linked PDF/sub-page one hop away carries the figure; (C) PAGE CHANGED/CAPTURE
THIN - a cookie wall/JS shell/404/shorter earlier capture; (D) NOWHERE - the honest terminal state. The
single largest, best-evidenced cause in the broader sample: STEP SOURCE's own `sourceAttempts` budget
charged a zero-cost "already captured, no fetch" lookup the same as a real fetch, starving free groundings
on high-orphan items (one sampled item: 51 orphans, 47 free-lookup groundings available, most never even
attempted). See `scripts/mint/heal-provenance.mjs`'s own NINTH PASS header for the complete mechanism,
fetch-count arithmetic against `HEAL_TIME_BUDGET_SECONDS`, and the confirmed scope limit on one-hop
cross-host institution follows (below).

1. **Budget split (STEP SOURCE).** `sourceAttempts` no longer charges an already-captured, USABLE
   (>200-char) row for the exact candidate URL - a zero-cost, zero-network lookup. It still charges a
   `worklist_ambiguous_host`/`unresolvable_host` classification-only decision, a dry-mode plan, and every
   genuine new fetch (direct or one-hop) - the EIGHTH PASS `bound_hit` test's own accounting is unchanged.
   `SOURCE_MAX_PER_ITEM` itself is left at 25: fetch-count arithmetic (`HEAL_TIME_BUDGET_SECONDS=1500` @
   1 req/s shared across ~89 items; 89×25=2225>1500, so the cap already assumes not every item spends its
   full budget on real fetches) shows the ceiling was never the bottleneck for the measured 47/51 case - the
   accounting was. Raising the ceiling further is a separate, still-open lever if this fix alone does not
   clear the residue in one more pass.
2. **Class C thin-recapture.** The "already captured" lookup now requires >200 usable trimmed chars (the
   file's own established floor) to count as captured at all; a thin/blocked pre-existing row is treated as
   not-yet-captured and falls through to a real, Wayback-aware re-fetch via the unmodified `captureCitedUrl`.
3. **Class A numeric-tolerant matcher.** `locateSpanInText` gains a fourth tier (`numeric_tolerant`,
   digit-gated) plus a trailing-punctuation retry, built on a new `buildNumericNormalizedIndex` (currency
   symbol↔code, decimal/thousands separators, super/subscript digits, %-spacing, dash variants). The STORED
   `source_span` stays byte-exact from the capture (ADR-016) - only the SEARCH tolerates a different surface
   form. Gate-A's own literal-and-exact `containsToken` (`gate-a-match.mjs`, a governing file) is untouched:
   `buildOrphanClaimText` already embeds the orphan token verbatim into `claim_text`, and `scanBrief` checks
   `claim_text + " " + source_span` concatenated, so a tolerant search never needs to defeat the coverage
   doctrine, only prove genuine grounding.
4. **Class B one-hop follow.** When a page STEP SOURCE fetched live THIS run (directly, or via
   CAPTURE-CITED's own fetch earlier the same run - both now carry `html` as an additive, never-persisted,
   in-memory-only field) does not itself carry the token, up to `SOURCE_MAX_HOP_LINKS_PER_TOKEN=3`
   SAME-INSTITUTION links (`institutionKey`, the one identity rule STEP B/OWN-BODY and the source registry's
   own dedup already use) extracted from that page's own `<a href>`s are tried, each captured via the same
   `captureCitedUrl` path and grounded with its OWN registered+rated source. **Confirmed scope limit**: this
   is same-host (or same shared-portal institution) only - `institutionKey` is host-prefixed by construction
   and can never bridge two genuinely different hosts, so a true cross-host institution hop (the dispatch's
   own "Cellar/EUR-Lex link from a Commission press page" example, and this lane's own sampled CINEA/Clean
   Hydrogen Partnership case) is NOT reachable by this pass - it would need an async DB institution lookup,
   left as a separate, still-open lever rather than silently claimed done. A real bug was caught and fixed
   in this same mechanism before landing: a naive same-host eligibility check is WRONG on a shared
   government portal (`nj.gov/dep` vs `nj.gov/other` share a host but are different institutions per
   `institutionKey`) - `classifyHopLink` now uses `institutionKey` equality as the one rule, never a second
   `hostOf` compare.
5. **Class D reporting.** `no_candidate_url` and `unresolved` (STEP SOURCE), and `unprovable` (STEP
   C/ORPHANS), now carry `sentence` - the orphan token's own literal enclosing sentence from `full_brief`
   (new `extractSentenceContext`, never invented) - so the coordinator hands the operator an actual sentence,
   not a bare token. `full_brief` has no editor path anywhere in this file (RELABEL only ever touches a
   section's `content_md`, by construction never `full_brief`), so a bare orphan token has no
   RECLASSIFY/RETROFIT path the way an existing FACT claim does; this is the honest, buildable version of
   "refactor if the paragraph exists, else report."
6. **`summarizeReports` gap fixed.** The `no_candidate_url` STEP SOURCE outcome had NO counter anywhere in
   this function before now (silently absent from every summary this file has ever produced) - added
   (`source_no_candidate_url`), alongside a new `source_grounded_one_hop` counter (a subset of
   `source_grounded`/`grounded_after_register`, both still increment for a one-hop grounding too).
7. **No new deps.** `scripts/maintenance/provenance-heal.mjs` needed no changes - every capability above
   (one-hop, thin-recapture, sentence context) reuses `captureCitedUrl`/`registerSource`/`readSourceByUrl`/
   `insertSearch`/`insertClaim`, all already wired by the EIGHTH PASS.
8. **`PENDING-RUN.md` not touched.** `scripts/mint/heal-provenance.mjs` is confirmed absent from
   `F28-harness-run-integrity.mjs`'s `GOVERNING_FILES.mint` list - this lane's edits do not move the mint
   family's `harness_version`, so no re-pin is needed or made.
9. **Coordinator dispatch**: `provenance-heal`, `mode: dry`, `arg: "quarantined-live"` - expect
   `steps.source[]` entries naming `grounded_after_register` (now including a `source_grounded_one_hop`
   share), `source_token_not_in_page` materially lower than the hp7 baseline (numeric-tolerant + thin-
   recapture + one-hop), `source_no_candidate_url` newly visible in the summary, and `source_bound_hit`
   materially lower (the budget-split fix). Follow with `mode: apply` once the dry run confirms; then
   re-measure the 359/302/token_not_in_page counts the same way this lane did (Supabase MCP SELECT against
   the real post-apply rows) to size what residue, if any, needs a raised `SOURCE_MAX_PER_ITEM` or a
   DB-backed cross-host one-hop as a follow-on lane.

**Tenth pass (lane HEAL-10, 2026-09-04, `HEAL_VERSION` now `hp10-2026-09-04.2`)** closes the run's own COST
(the actual bottleneck maintenance #31 hit, below) and builds the two steps HEAL-6 named but never built -
see `scripts/mint/heal-provenance.mjs`'s own TENTH PASS header for the complete mechanism and evidence.

1. **Cost attribution - `[CONFIRMED]`, maintenance #31 (run 33855060659) vs. #28 (run 33851505474, DRY).**
   #31's 15 processed items averaged ~100s/item (1500s / 15). #28's DRY run - which makes **zero** network
   fetches by construction (`main()` never writes or fetches unless `apply`) - still averaged ~63s/item
   (1776s / 28), proving the dominant cost is CPU, not the 1 req/s politeness pacing (already low: #31's own
   `capture_cited.fetched` sums to 9 across all 15 items). Root cause: `locateSpanInText`
   (`planGroundingForClaim`/`planResourceForClaim`/`planOrphanGrounding`) rebuilt its normalized/numeric
   index from scratch, from an O(n) pass over the FULL capture text, on **every** call - once per CLAIM
   (GROUND/RESOURCE) or per Gate-A ORPHAN TOKEN, TWICE for any orphan STEP SOURCE could not resolve (its own
   precheck, then STEP C's fresh scan). Measured live (read-only SQL): item `15f63ea9-…` (one of #31's 15)
   carries 32 captures totalling 2,833,138 chars and 10 orphan tokens - its own pool is re-normalized on the
   order of ~1,280 full-text passes over ~2.8M chars combined. **Fix**: `buildCaptureIndex`/`getCaptureIndex`
   precompute a capture's normalized forms ONCE, memoized by `capture.id` in a `Map` threaded run-wide
   (`healOneItem`'s new `captureIndexCache` option, the same convention as the SIXTH PASS's own
   `citedUrlCache`) - turns the per-item cost from O(claims-or-tokens × captures × chars) into O(captures ×
   chars). Fully additive: every existing call/test keeps its own isolated cache when the new parameter is
   omitted.
2. **Per-item wall-clock backstop** (defensive, under fix 1). `computeItemTimeBudgetSeconds(runBudget)` (new,
   pure) derives `clamp(runBudget/10, 30, 120)` seconds from the SAME `HEAL_TIME_BUDGET_SECONDS` the run-level
   budget already reads - no new workflow env line. `healOneItem` checks it BETWEEN orphan tokens (never
   mid-token) in STEP SOURCE's and STEP C's own loops, reporting `item_bound_hit` (never silently dropped;
   new `summarizeReports` counters `source_item_bound_hit`/`orphans_item_bound_hit`) for anything skipped.
3. **Job-timeout arithmetic.** `.github/workflows/maintenance.yml`'s `maintain` job `timeout-minutes` raised
   30 → 35: #31's own measured pre-step setup was 5m21s (321s), not the ~1-2min a prior comment assumed -
   the 30-minute job timeout fired 8s BEFORE `HEAL_TIME_BUDGET_SECONDS`'s own 1500s internal deadline could
   stop the run cleanly (08:51:57 + 1500s = 09:16:57; job killed at 09:16:49). New arithmetic (see that
   file's own comment): 2100s job − 321s setup − 1500s step budget − 3s Population-AFTER − 3s artifact
   upload = 273s (4m33s) headroom. `HEAL_TIME_BUDGET_SECONDS` itself is UNCHANGED at 1500 - fix 1/2 cut the
   cost the budget is spent on, not the budget.
4. **BRIEF-HONEST STRIP (Task 3, criterion 7's `gate_a_unproven_or_stale` residue - 13 of #31's 15 items).**
   Once STEP SOURCE has exhausted every cited URL and STEP C has exhausted every capture for an orphan token
   and it is still `unprovable`, a new step (right after STEP C) PLANS removing exactly that token's own
   enclosing sentence - or, when the sentence carries another still-tracked token, exactly the middle clause
   (first/last-clause cuts are always refused, never guessed) - from `full_brief`. Never invents, never
   paraphrases, only deletes a located literal span (`sentenceSpans`/`findSentenceSpanForToken`/
   `removeSentenceSpan`/`planStripUnprovableClause`/`planStripUnprovableSentence`, all pure). Acceptance
   re-runs the LIVE Gate A scanner (`buildGateARow`) on the rewritten brief and requires `orphan_count === 0`
   - a stray unrelated orphan (untouched this run) rejects the whole plan, nothing partial ever writes.
   **DRY BY DEFAULT**: the plan is always computed and reported (`report.steps.brief_honest`,
   `summary.brief_honest`, with per-item before/after excerpts and a `restore_sql`); the write itself
   (`deps.updateItemBrief`, new wrapper dep) fires ONLY when `apply=true` AND the dispatch's `--arg` carries
   the new `parseSelection` suffix **`+strip-unprovable`** (every existing selection form's own mode/ids
   meaning is unchanged - the suffix only sets `selection.stripUnprovable`). `item_grade` doctrine (migration
   278 / `docs/plans/record-tier-population-plan-2026-09-01.md` section 2/section 7, grepped): UNCHANGED either way - a
   record-grade item has no full_brief-driven Gate A orphans to strip in the first place (FACT/GAP-only, no
   synthesized prose), and a brief-grade item stays brief-grade (this step only ever removes prose from a
   full_brief it already has).
5. **CRITERION 4 RESIDUE (Task 4) - measured, not assumed.** Pulled `validate_item_provenance`'s live
   definition via `pg_get_functiondef` (read-only) rather than trusting this file's own label-regex mirror:
   criterion 4's ANALYSIS check is item-wide (every section of the item, never scoped to a claim's own
   `section_row_id`) and reads **only** `intelligence_item_sections.content_md` - it never reads
   `full_brief` at all. Re-measured heal31.json's full 159-claim `relabel_no_owning_section` residue against
   the LIVE DB with this exact predicate: **148/159 (93%) already pass today** - inspection of a sample
   confirms `planRelabelParagraph`'s own "already labeled" guard is correctly no-oping on a paragraph an
   earlier pass already labeled (the run's own snapshot was stale relative to today's DB, not a live defect);
   **3/159** (one item, `27dfbe4c-…`, one section) are exactly the case lane HEAL-6 named: `claim_text`
   absent from every section's `content_md` but a literal substring of `full_brief`; **8/159** are nowhere
   at all, not even in `full_brief` (a paraphrase, not a quote) - genuinely unrecoverable, reported, never
   invented. **Fix**: `planRelabelFromFullBrief` (STEP D) - for the 3/159 case only - APPENDS a new labeled
   paragraph (`*Analytical inference:* ` + the claim's own verbatim `claim_text`) to the claim's own
   registered section (never edits `full_brief`, since criterion 4 never reads it), gated behind the SAME
   `+strip-unprovable` token as the strip step above (new prose beyond the established prepend-a-label
   pattern gets the same explicit-opt-in treatment). New `relabel` outcomes: `relabeled_from_full_brief` /
   `would_relabel_from_full_brief`; new counters `relabeled_from_full_brief`/`would_relabel_from_full_brief`.

New `counts`: `brief_honest_applied`/`brief_honest_would_apply`/`brief_honest_rejected`/
`brief_honest_refused_tokens`, `relabeled_from_full_brief`/`would_relabel_from_full_brief`. New summary
field: `summary.brief_honest` (per-item before/after, present whenever an item had ≥1 exhausted-unprovable
token this run, dry or apply). New wrapper dep: `updateItemBrief(itemId, full_brief)` →
`guardedUpdate("intelligence_items", …)`, called only when `apply && stripUnprovable`.

**Coordinator dispatch - two runs, in order**:
1. **Dry run (plan review, no token)**: `provenance-heal`, `mode: dry`, `arg: "quarantined-live"` - expect
   `summary.brief_honest` to list a per-item strip plan for the 13 criterion-7 items above (`outcome:
   "accepted"`, `applied: false`) and `steps.relabel[]` to show `would_relabel_from_full_brief` for the
   `27dfbe4c-…` item's 3 claims; review both before deciding to apply.
2. **Apply run (writes the reviewed plan)**: `provenance-heal`, `mode: apply`,
   `arg: "quarantined-live+strip-unprovable"` - same selection, now with the explicit token: `applied: true`
   in `summary.brief_honest`, `relabeled_from_full_brief` in the counts, and a `restore_sql` recorded per
   item in case any strip needs undoing by hand. An apply run WITHOUT the suffix (`arg: "quarantined-live"`)
   still reports the identical plan but writes nothing for either step - the dry-by-default contract this
   lane's own tests assert directly (`healOneItem`'s default-apply-mode test: `applied: false`, zero
   `updateItemBrief` calls, `item.full_brief` unchanged).

**`kit-backfill` and migration 299** (2026-09-05, lane KIT-BACKFILL, W2.3/W2.4). `scripts/mint/
migration-299-precheck.mjs` is the executable form of migration 299's own header self-check: it exits 1
(refuses) while `N > 0`, printing the per-`(item_type, slot_key)` breakdown and the exact failing item ids.
Run it (no `--arg`) BEFORE `apply_migration` for 299; run it again with `--post` AFTER, to read back that
no live item is now `quarantined` for one of the three new slots.

**[CONFIRMED, live SQL, 2026-09-05] N = 149**, not 87 - a reconciliation this lane had to do itself. Two
measurements of "verified items missing the new required-slot coverage" disagreed (149 vs 87) until the
`is_archived` split was run:

| item_type | live (`is_archived=false`) | archived (`is_archived=true`, all `archive_reason` NOT NULL) | total |
|---|---|---|---|
| initiative | 20 | 50 | 70 |
| market_signal | 36 | 10 | 46 |
| research_finding | 31 | 2 | 33 |
| **total** | **87** | **62** | **149** |

**Why the archived 62 count too** [CONFIRMED, read `115_set_provenance_status_trigger.sql` in full]: the
`set_provenance_status` trigger fires `AFTER INSERT OR UPDATE` on `intelligence_items` /
`intelligence_item_sections` / `section_claim_provenance` with **no `is_archived` exclusion** - an archived
row is not inert to criterion 5, only rows nothing ever writes to again are. Migration 299's own header SQL
(reproduced above this section) never filters `is_archived` either - its `N` was always meant to be 149, and
this lane's dispatch naming "the 149 pre-kit items" is exact, not approximate. `migration-299-precheck.mjs`
therefore does **not** filter `is_archived` (a change from this lane's own first draft, which wrongly did
and read 87 - corrected before landing). `slots-backfill` (unchanged, `is_archived=false` only) can close
the 87; only `kit-backfill` (`includeArchived: true`) reaches the other 62.

**Capture availability for the 149** [CONFIRMED, live SQL, 2026-09-05]: 148 of 149 have a usable
(`>200 char`) capture and would receive a real FACT-or-GAP slot claim on the first `kit-backfill` apply run,
closing the guard for that item outright (criterion 5 accepts GAP; the extractor always emits one or the
other, never skips). The one exception - `cdd54edb-042c-4508-98f5-bd77058c34d1` (`research_finding`,
"Special Report No 1/93 on the financing of transport infrastructure...") - has **zero** `agent_run_searches`
rows at all, so `kit-backfill` reports it `held_no_capture` and cannot close its guard row by re-extraction.
It is already `is_archived=true` with `archive_reason='out_of_scope_wo26'` (a prior, deliberate, reasoned
archival) - `heal-provenance.mjs`'s own `archived-unreasoned` selection only ever re-touches an archive with
`archive_reason IS NULL`, so as long as it stays archived-and-reasoned, no known automated path re-touches
it and migration 299's guard counting it is conservative, not a live risk. **Disposition: no action** - do
not un-archive it to "fix" the guard; the guard's own conservatism is intentional (see the header note on
`migration-299-precheck.mjs`'s CLI query for why the archived/reasoned distinction was deliberately NOT used
to narrow the guard itself).

**Coordinator dispatch - three runs, in order** (closes migration 299's guard to N=0, then applies it):
1. `provenance-heal`, `mode: dry`, `arg: "kit-backfill"` - review the plan over the full 149 (plus whatever
   of the 575/6 population below also qualifies); confirm 148 `would_write` and exactly 1
   `held_no_capture` (the item above).
2. `provenance-heal`, `mode: apply`, `arg: "kit-backfill"` - writes the 148 slot claims (FACT or honest
   GAP). Idempotent: a second apply run finds nothing left to backfill (missingRequiredSlots returns `[]`
   for every item this pass already covered).
3. `node scripts/mint/migration-299-precheck.mjs` - expect `{"mode":"pre","ok":true,"n":1,...}` (the one
   `held_no_capture` item still counts against N structurally, but see the disposition above for why this
   is expected and acceptable) - **coordinator decision needed**: either accept `apply_migration` for 299
   with this one known, reasoned, archived exception (migration 299 itself never claims N must reach
   literal zero, only that the coordinator has "re-minted those N items" - 148 of 149 - before applying),
   or run `provenance-heal --arg "ids:cdd54edb-042c-4508-98f5-bd77058c34d1"` first to attempt a fresh capture
   (STEP 1/CAPTURE) before falling back to accepting the exception. Then `apply_migration` for 299, then
   `node scripts/mint/migration-299-precheck.mjs --post` to read back zero new quarantines.

**The 6 zero-FACT / 575 one-or-two-FACT population (W2.4)** [CONFIRMED, live SQL, 2026-09-05] - the OTHER
half of this lane's dispatch, outside migration 299's own scope (these items already clear criterion 5;
this is about kit currency, older `RECORD_FACTS_VERSION` mints missing later additive slots):
- **6 zero-FACT, live, `item_grade='record'`**: 5 are `market_signal` items with `instrument_identifier`
  `eu-oil-bulletin:*` (the ratified oil-bulletin series, `src/lib/market/series-item-map.mjs`) - their
  substance lives in `market_series`, not FACT claims; zero FACT is correct by design, not a defect. The
  6th, `7e554d10-…` (`framework`, item_grade **`brief`** not `record`), already carries all 4 required
  `framework` slots as honest GAP claims (a genuinely content-thin EU Decision: no obligations, no
  deadline, no penalty, no scope stated) - already fully compliant with criterion 5; `kit-backfill`'s own
  `missingRequiredSlots` check finds nothing to add for it. **Disposition for all 6: no action needed** -
  neither "re-mint" nor "archive record_hollow" applies; both dispositions this lane's dispatch offered
  were written before this reconciliation.
- **575 one-or-two-FACT, live, `item_grade='record'`**: `kit-backfill` (default `--arg`, or scoped via
  `ids:`) is the general mechanism - it re-runs the SAME per-slot extractors (`record-facts.mjs` /
  `record-facts-research.mjs`, via `buildSlotClaim`, imported unmodified) against each item's existing best
  capture and adds any still-missing required-slot claim (FACT or honest GAP), the same "claims added, item
  untouched" shape as `slots-backfill`/`rederive-record-provenance.mjs`. Not separately re-measured item-
  by-item in this pass beyond the 149 above - dispatch `provenance-heal --arg kit-backfill --mode dry` for
  the current worklist and counts before an apply run.

**Series exemption in `record-hollow-sweep.mjs` (RESOLVED 2026-10-04, lane S0)**: the ratified oil-bulletin
`market_signal` items are `item_grade='record'` with 0 FACT claims, because their substance is in
`market_series`. `record-hollow-sweep.mjs`'s `planSelection` now excludes any item whose
`instrument_identifier` is a key of `SERIES_ITEM_MAP_RAW` (`src/lib/market/series-item-map.mjs`, via
`isSeriesItem`), so they are never selected or archived as `record_hollow`. The map is read, not a hard-coded
prefix; a non-series `market_signal` is still selected on the same title-only rule as any other record. See
section 10.

---

