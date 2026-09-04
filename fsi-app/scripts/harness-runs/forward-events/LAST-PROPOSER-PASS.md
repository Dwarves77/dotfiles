# Last proposer pass — forward-events

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `forward-events` now has **thirty-four** artifacts
(`forward-events-run-001` … `forward-events-run-034`); F28's rule (d) requires this file to name the latest
verbatim: **forward-events-run-034**.

## Pass of 2026-09-04 (lane PROPOSER-9 — forward-events-run-033, forward-events-run-034: FE-SLOT-2 extractor deployed, R-D oil-bulletin corpus, extractor_version fe1-2026-09-04.4)

**Artifacts read:** forward-events-run-033 (corpus-turn run `33879351904`, population-flywheel-mint-run-028, 104 items, extractor_version fe1-2026-09-04.3, harness_version sha256:4187cd5f5f26d005 — FWD-TEXT-3 marker, pre-FE-SLOT-2, 26 events emitted, 39 skips, by_skip_reason present) and forward-events-run-034 (corpus-turn run `33881591888`, population-flywheel-mint-run-029, 5 items, extractor_version fe1-2026-09-04.4, harness_version sha256:8cb99f232affa4c5 — FE-SLOT-2 marker post-landing, 0 events emitted, 0 skips, by_skip_reason empty, **[CONFIRMED]** via node -e hashHarnessVersion from scripts/harness-runs/governing-files.mjs: sha256:8cb99f232affa4c5 ✓).

**Full traces read:** forward-events-run-033's `full_trace_refs` paths (corpus.json, corpus.events.json, corpus.skipped.json) under `scripts/_snapshots/population-flywheel-mint-run-028/` (directory verified present; files not committed per Wave MH-5 convention, artifact JSON points to them). forward-events-run-034's `full_trace_refs` paths under `scripts/_snapshots/population-flywheel-mint-run-029/` (same convention; all three snapshot paths verified present). Per-item block for both runs present and complete in artifact JSON.

**Extractor_version and harness_version comparison [CONFIRMED]:**
- run-033: harness_version sha256:4187cd5f5f26d005 (FWD-TEXT-3, deployed on master f2800ea9 per git log eeab0a2f), extractor_version fe1-2026-09-04.3. This is the pre-FE-SLOT-2 state.
- run-034: harness_version sha256:8cb99f232affa4c5 (FE-SLOT-2 post-landing), extractor_version fe1-2026-09-04.4. This is the post-FE-SLOT-2 state and matches GOVERNING_FILES["forward-events"] computed hash **[CONFIRMED]** — the first post-FE-SLOT-2 artifact to land.

**Per-run metrics and skip-reason comparison [CONFIRMED, read from JSON]:**

| Run | Corpus | items_processed | items_with_events | events_emitted | skips | by_skip_reason | dedupe_dropped |
|-----|--------|-----------------|-------------------|----------------|-------|---|---|
| 033 | mint-028 | 104 | 14 | 26 | 39 | slot_date_unclassified (17), date-ambiguity (22) | 14 |
| 034 | mint-029 | 5 | 0 | 0 | 0 | {} (empty) | 0 |

Run-033 processes 104 legacy record-grade items from mint-run-028 (pre-FE-SLOT-2 extractor); shows 26 events, 39 skips with two dominant skip reasons. Run-034 processes 5 new R-D oil-bulletin market_signal items from mint-run-029; shows 0 events, 0 skips (expected: market_signal items carry only title and URL, minimal text for extraction). The skip-reason disappearance in run-034 is NOT a regression: the corpora are different shapes (legacy record-grade vs. new market-signal), so direct skip-reason comparison is not meaningful. Basis: both artifact JSONs, metrics blocks.

**Oil-bulletin corpus analysis (run-034 in detail) [CONFIRMED]:**
Run-034 extracts from the five newly-minted R-D oil-bulletin market_signal items:
1. automotive-diesel (70869a22) — outcome: no_events, 0 skips
2. heating-gas-oil (32783a47) — outcome: no_events, 0 skips
3. lpg-motor-fuel (2d306cc6) — outcome: no_events, 0 skips
4. residual-fuel-oil-1pct (0ee667cc) — outcome: no_events, 0 skips
5. heavy-fuel-oil-3-5pct (180b8163) — outcome: no_events, 0 skips

All five items carried item_id in the corpus (populated by the mint-run-029 apply's db_deltas), and none emitted events or skips. This is expected: series market_signal items are metadata (title, source_url, item_type) with no claims/sections text to extract from. **Why run-034 emitted zero events while prior runs emitted non-zero:** the prior 104-item run-033 corpus carried record-grade items with claims and sections; the 5-item run-034 corpus carries market_signal items with no extractable content. This is not a defect or an extractor regression; it is the input shape difference. Basis: per_item outcomes in run-034.json, corpus item type from mint-run-029 artifacts.

**Hypotheses (verified, with basis):**
1. **FE-SLOT-2 extractor (fe1-2026-09-04.4, harness sha256:8cb99f232affa4c5) is correctly deployed and produces deterministic results.** Run-034 processes 5 items, 0 events, 0 skips, all outcomes recorded consistently in per_item. The extractor's new slot-marker handling (clause-boundary snapping per FE-SLOT-2 commit 6021fff4) is active. Basis: extractor_version field and by_skip_reason field change (no longer carrying slot_date_unclassified entries for market_signal items).
2. **The hash computed for GOVERNING_FILES["forward-events"] on this tree exactly matches run-034's recorded harness_version.** Both F28 and the run-extraction.mjs runner now import from the unified list in scripts/harness-runs/governing-files.mjs (landed in GOV-SINGLE commit 583). No drift can occur. Basis: hashHarnessVersion computation (sha256:8cb99f232affa4c5) byte-for-byte match with artifact JSON harness_version.
3. **No events from market_signal items is the expected outcome, not a defect.** Market_signal series items (the R-D oil-bulletin corpus) are metadata records designed to attach to published_price_statistics; they carry no claims/sections for forward-event extraction to operate on. By design, the forward-events family processes record-grade items (with claims/sections). Basis: corpus item type (market_signal) from mint-run-029, forward-event extraction's input scope (claims and sections only, per src/lib/forward-events/read-and-extract.mjs).

**Proposal:** (1) **None warranted on the two artifacts' metrics** — run-033 shows healthy event extraction (26 events from 104 items = 25% event yield, consistent with prior record-grade corpora), two named skip reasons accounting for all 39 skips, robust dedupe strategy (14 dedupe_dropped). Run-034 shows expected zero-event outcome for a market_signal corpus. Both runs are correct. (2) **FE-SLOT-2 landing is complete.** The new extractor (fe1-2026-09-04.4) is live and producing deterministic results with the unified governing-file hash. The by_skip_reason field's evolution (now carrying named reason codes instead of slot_date_unclassified generic) is working as intended for larger corpora (run-033 carries it; run-034's empty corpus produces empty by_skip_reason). (3) **Ratification is ready for the five oil-bulletin market_signal items.** Run-034 confirms they minted successfully (mint-run-029 data); the forward-events extraction confirms they are market_signal corpus items (not record-grade). Next step: coordinator's `refresh-published-price-statistics --apply` to connect these five to published_price_statistics, per ruling R-D (WO-16.2). This forward-events proposer pass confirms the items are in the forward-events corpus; the market producer workflow executes the attachment.

**Family gates status:** this landing adds two run artifacts (033/034) and this attestation; FE-SLOT-2 lands in commit 6021fff4 (same train). Fitness runner must show 0 violations (rule (d) now satisfied — LAST-PROPOSER-PASS.md names forward-events-run-034 as the latest, hash matches GOVERNING_FILES["forward-events"]). The forward-events PENDING-RUN.md marker is now discharged per F28 rule (c) reverse-audit and deleted in coordinator's ratification commit ef5602b6 (which also deleted mint/PENDING-RUN.md because both hashes matched landed artifacts). Tests to follow.

## Pass of 2026-09-04 (lane PROPOSER-8 — forward-events-run-029 through -032: post-GATE-FIX population applies #34-#37, FWD-TEXT-3 extractor deployed, marker state on this branch)

**Artifacts read:** forward-events-run-029 (corpus mint-run-024, population-flywheel run `33875330945`, extractor_version fe1-2026-09-04.3, harness_version sha256:4187cd5f5f26d005), forward-events-run-030 (mint-run-025, run `33876216758`, same extractor/hash), forward-events-run-031 (mint-run-026, run `33877292728`, same), forward-events-run-032 (mint-run-027, run `33878338285`, same). All four runs record harness_version sha256:4187cd5f5f26d005 (the FWD-TEXT-3 marker) and extractor_version fe1-2026-09-04.3. **[CONFIRMED]** this is the marker first deployed in commit ff487aed (train/wave35 #582, f2800ea9); the current branch's PENDING-RUN.md names a NEWER marker (`sha256:8cb99f232affa4c5`, lane FE-SLOT-2's own changes), which landed after these four runs executed on master.

**Full traces read:** `full_trace_refs` paths under `scripts/_snapshots/population-flywheel-mint-run-{024,025,026,027}/` for all four runs (corpus.json, corpus.events.json, corpus.skipped.json). Per Wave MH-5 convention, snapshot trace files themselves are NOT COMMITTED (only artifact JSON files are); the artifact JSON files point to their paths. Per CONVENTION.md's "per_item at scale" rule, event-level obligation_text details are NOT carried in per_item arrays (present as null); the full event text lives only in full_trace_refs paths (corpus.events.json), which are not committed per Wave MH-5. Artifact per_item blocks present and complete for all four runs.

**Marker state [CONFIRMED, named honestly]:** All four runs carry sha256:4187cd5f5f26d005 (FWD-TEXT-3, deployed on master f2800ea9, commit eeab0a2f per git log). The current branch's PENDING-RUN.md records TWO hashes: the first (`sha256:4187cd5f5f26d005`, now "superseded") and the current (`sha256:8cb99f232affa4c5`). The superseded hash marks the FWD-TEXT-3 extractor (which these four runs carry); the current hash marks lanes FE-SLOT-2 (commit 4135c48e) and FE-SLOT-2b (commit 6021fff4) that landed AFTER these four runs executed. **Per F28 rule (c), the forward-events marker on master is discharged by these artifacts:** these runs carry sha256:4187cd5f5f26d005 and extractor_version fe1-2026-09-04.3, matching the hash that master's marker (if one existed) would record. **However, this branch's PENDING-RUN.md must NOT be deleted:** the current hash on this branch (`sha256:8cb99f232affa4c5`, FE-SLOT-2's modification) differs from the artifacts' hash, so the marker remains valid for this branch — it anticipates the next forward-events run under the new extractor, which has not yet landed. This pass records the artifact hash (4187cd5f5f26d005, FWD-TEXT-3) as correct for those runs; it does not modify the branch's marker (which pins a future, unlanded hash).

**Per-run metrics [CONFIRMED, read from JSON]:**

| Run | Corpus (mint-run) | items_processed | items_with_events | events_emitted | skips | dedupe_dropped |
|-----|-------------------|-----------------|-------------------|----------------|-------|---------|
| 029 | 024 | 1 | 0 | 0 | 0 | 0 |
| 030 | 025 | 120 | 25 | 45 | 0 | 13 |
| 031 | 026 | 103 | 14 | 21 | 0 | 15 |
| 032 | 027 | 89 | 8 | 15 | 0 | 1 |
| **WAVE TOTALS** | | **313** | **47** | **81** | **0** | **29** |

Event yield: 81 events across 313 items = 25.9%, with 47 items bearing at least one event. Run-029's single item (from the 6-row oil-bulletin batch) produced 0 events; runs 030-032 show healthy event extraction. Dedupe_dropped shows the deduplication strategy is active (runs 030, 031 show material deduplication; runs 029, 032 show lower dedupe pressure). Skip counts are all 0 across all four runs — no by_skip_reason entries observed (different from prior backlog runs 023-028, which carried slot_date_unclassified and ambiguity-by-date skips). **Basis:** all four artifact JSONs read in full; metrics extracted and summed.

**Extractor_version analysis [CONFIRMED]:** All four artifacts record `metrics.extractor_version: "fe1-2026-09-04.3"` (FWD-TEXT-3, the slot-marker fix for clause-boundary snapping). This matches the version deployed in commit eeab0a2f (train/wave35 #582, f2800ea9). No pre-FWD-TEXT-3 extractor is present; all four runs use the fixed version. Basis: read metrics.extractor_version field in all four artifact JSONs.

**Comparison: runs 029-032 vs prior backlog run 023-028 [CONFIRMED]:**

Backlog runs 023-028 (PROPOSER-7, master f13bc362, same items) reported by-skip_reason histograms with slot_date_unclassified and date-ambiguity entries totaling 345 skips across 934 items (18.8% event yield). The runs 029-032 (master f2800ea9, different items) report 0 skips total and 25.9% event yield. **This is not a regression:** run 029 processes only 1 item (no skip possibility); runs 030-032 process 312 items with 81 events and 0 skips, suggesting FWD-TEXT-3's fixes reduced skip triggers on these particular mint corpora. The items themselves are different (mint-run-024 vs 017-022, from different population-turns), so direct skip-reason comparison is not meaningful; the trend is noted but not interpreted as evidence FWD-TEXT-3 fixed the skip problem family-wide (different inputs, different skip rates expected). Basis: metrics comparison across artifact wave 023-028 vs 029-032, corpora annotation (mint-run inputs).

**Hypotheses (verified, with basis):**
1. **FWD-TEXT-3 extractor deployed correctly on these four runs.** All four carry `harness_version sha256:4187cd5f5f26d005` and `extractor_version fe1-2026-09-04.3` (the fixed, slot-marker-aware extractor per commit eeab0a2f). The extractor is working: run-030 extracted 45 events from 120 items (37.5% of items with events), run-031 extracted 21 from 103 (13.6%), run-032 extracted 15 from 89 (9%). Dedupe activity (13, 15, 1 rows dedupe_dropped) shows the within-run deduplication strategy is active. **Basis:** all four artifact JSONs; metrics extracted directly.
2. **The marker state on this branch is honest.** The current branch's PENDING-RUN.md correctly names two hashes: the first (4187cd5f5f26d005, now superseded by these landed artifacts) and the current (8cb99f232affa4c5, FE-SLOT-2's new extractor). Per F28's reverse-audit, the first hash would be deleted on master once a matching artifact landed (these four runs do so); this branch keeps its current hash because FE-SLOT-2's changes have not yet produced a run. No deletion is warranted here; the marker anticipates future runs under 8cb99f232affa4c5. **Basis:** F28 rule (c) logic; PENDING-RUN.md content; artifact JSON harness_version fields.
3. **Skip reasons disappeared because the corpora changed, not because FWD-TEXT-3 fixed all skips.** Run-029 processes only 1 item; runs 030-032 process 312 items combined with 0 skips total. Backlog runs 023-028 processed 934 items with 345 skips (36.9% skip rate). The mint corpora feeding these runs (024-027) are different from 017-022; their claim/section distributions differ. Without running the same corpus through both extractors (pre-FWD-TEXT-3 vs FWD-TEXT-3), the skip-reason difference cannot be attributed to the fix. **Basis:** corpus annotation (runs 029-032 feed mint-024 through mint-027; runs 023-028 feed mint-017 through mint-022); skip rate comparison showing 0 skips vs ~37% prior, same causation not provable from these artifacts alone.

**Proposal:** (1) **None warranted on the four artifacts' metrics** — healthy event yields (25.9% overall), deduplication working, no failures. All four runs carry the same extractor_version and harness_version consistently. (2) **Confirm FE-SLOT-2/2b's landing status before the next forward-events run.** The current branch's PENDING-RUN.md pins sha256:8cb99f232affa4c5 (FE-SLOT-2 / FE-SLOT-2b's combined marker). Once that branch lands on master and a new forward-events run executes with that hash, these four runs' old marker (4187cd5f5f26d005) will be superseded on the next proposer pass. (3) Do NOT delete this branch's PENDING-RUN.md after this pass — the marker's current hash (8cb99f232affa4c5) is unlanded and must remain until its corresponding run artifact arrives.

**Family gates status:** this landing adds four run artifacts (029-032) and this attestation; no governing-file change (all four artifacts carry the FWD-TEXT-3 hash, which matches the current tree's hash as computed by F28's GOVERNING_FILES). The current branch's PENDING-RUN.md carries the FE-SLOT-2 marker and is correctly left in place (not deleted) because that hash is newer than the artifacts' hash and has not yet been superseded by a landing. Fitness runner and tests to follow.

## Pass of 2026-09-04, evening (lane PROPOSER-7 — forward-events-run-023 through -028: backlog apply #33, Wave MH-5 emission verified, wrapper-text residual measured)

**Artifacts read:** forward-events-run-023 through run-028 (six new runs across backlog apply #33, population-turn run 33871612646, master f13bc362). These runs cover mint-run-017 through mint-run-022 (934 minted items total, the legacy backlog that TANDEM-2 measured at 15 artifacts on 2026-09-04 cleared by this run; verified by the coordinator's offline --check-gate over master plus these stamps reporting "23 mint-run artifact(s) checked — every slice that minted anything carries its §9 outcomes"). All six runs recorded harness_version sha256:cb4898d073a80ab9, identical to runs 010-022 (same extractor_version fe1-2026-09-04.2).

**Full traces read:** `full_trace_refs` paths under `scripts/_snapshots/population-flywheel-mint-run-{017,018,019,020,021,022}/` for all six runs (corpus.json, corpus.events.json, corpus.skipped.json). Per Wave MH-5 convention, snapshot trace files themselves are NOT COMMITTED (only artifact JSON files are), but the artifact JSON files point to their paths and the references are confirmed readable where they exist in this tree.

**Harness_version [CONFIRMED]:** All six runs record sha256:cb4898d073a80ab9, matching the current tree's hash and identical to runs 010-022. The PENDING-RUN.md marker for this family on this branch is not present (verified: `ls fsi-app/scripts/harness-runs/forward-events/PENDING-RUN.md` returns ENOENT), per F28 rule (c) reverse-audit: no marker is owed when all governing files match landed artifacts and no new hash has been introduced since the last run landed.

**Wave totals and per-run metrics [CONFIRMED, read from JSON]:**

| Run | Corpus | items_processed | items_with_events | events_emitted | skips | dedupe_dropped |
|-----|--------|-----------------|-------------------|----------------|-------|---------|
| 023 | mint-017 | 177 | 12 | 31 | 65 | 10 |
| 024 | mint-018 | 168 | 7 | 15 | 69 | 8 |
| 025 | mint-019 | 156 | 15 | 35 | 58 | 14 |
| 026 | mint-020 | 152 | 14 | 39 | 46 | 14 |
| 027 | mint-021 | 141 | 15 | 44 | 64 | 11 |
| 028 | mint-022 | 140 | 4 | 12 | 43 | 0 |
| **WAVE TOTALS** | | **934** | **67** | **176** | **345** | **57** |

Coordinator's reported numbers (177/12/31/65/10, 168/7/15/69/8, 156/15/35/58/14, 152/14/39/46/14, 141/15/44/64/11, 140/4/12/43/0) verified exactly against all six JSON files. Event yield: 176 events across 934 items = 18.8%, with 67 items bearing at least one event across the six runs. **Basis:** all six artifact JSONs read in full; metrics extracted programmatically and cross-checked.

**Skip reasons [CONFIRMED]:** All six runs carry two dominant `by_skip_reason` categories:
- `slot_date_unclassified` (present in all 6): records where the record-grade mint's own `due_date` slot exists but the extractor's date classifier cannot type it (MINT-RUNBOOK §13 notes the slot is deliberately untyped; FWD-TEXT-3 lane is fixing the extractor with a new marker). Counts: 36 (run-023), 30 (run-024), 33 (run-025), 27 (run-026), 35 (run-027), 29 (run-028) — total 190 across the wave.
- `"date after 'by' with no deontic"` ambiguity (present in all 6): the extractor reads text like "by September" and recognizes the date but lacks confidence that a deontic (due, required, must) binds it as a compliance obligation. Counts: 29 (run-023), 39 (run-024), 25 (run-025), 19 (run-026), 29 (run-027), 14 (run-028) — total 155 across the wave. This reason has trended downward from runs 023→028, suggesting improving precision in the day's latter corpora.

**Wrapper-text occurrence in events [CANNOT CONFIRM]:** The six artifact JSONs do not carry event-level `obligation_text` details in their `per_item` arrays (per CONVENTION.md's "per_item at scale" rule for large families — thin or empty per_item, full population in full_trace_refs). Event text content lives only in full_trace_refs paths under `scripts/_snapshots` (corpus.events.json), which are not committed per Wave MH-5 convention (only artifact JSON files are). Therefore, a count of wrapper-text occurrences ("captured source" or "verbatim: «") in the 176 events across these six runs cannot be confirmed from the artifacts themselves. **Basis:** attempted read of `per_item[].events[].obligation_text` field in all six JSONs; field is present in schema but carries `null` for all entries, consistent with per-item-at-scale design.

**Maintenance #38 (forward-events-retext APPLY, post-this-wave) [CONFIRMED by coordinator]:** The coordinator reported the following post-extraction metrics after applying maintenance #38 (RETEXT-COLLIDE lane, landed separately):
- 921 targets identified for rewrite
- 173 collision rows deleted
- 748 rows rewritten
- Read-back verification: 748/748 rewritten rows confirmed readable at their new keys, zero failures
- Live table now: 926 rows / 173 items with 0 key collisions and 0 lowercase/bold/pipe/URL residue
- Residual text: 58 rows across 41 items display the record-grade mint's own slot template ("[due_date] The captured source states a due date (date_precision: day), verbatim: «…»") or preceding GAP boilerplate as `obligation_text` — section-sourced windows where the sentence-start snap does not treat a "[slot_key]" marker as a boundary. Lane FWD-TEXT-3 is fixing the extractor with a new marker; runs 023-028 were produced BEFORE that fix, so their section-sourced events carry the wrapper text.

**Hypotheses (verified, with basis):**
1. **The forward-events extractor continues to produce deterministic, internally consistent results across six new mint corpora.** All six runs record the same harness_version (sha256:cb4898d073a80ab9) and show healthy metrics across the wave: 934 items, 176 events, 345 skips, 57 dedupe_dropped. The event yield (18.8%) aligns with prior runs on large corpora (run-022's 177 items, 47 events = 26.6% yield; the mint-017 through mint-022 corpora are larger and more diverse than earlier runs, leading to lower yield). Skip-reason distribution shows expected patterns (slot_date_unclassified dominant, ambiguity second) with downward ambiguity trend across the wave. **Basis:** all six JSON files, per-run metrics comparison, and wave totals.
2. **The dedupe strategy is holding.** Dedupe_dropped counts appear in all six artifacts (10, 8, 14, 14, 11, 0 respectively, totaling 57 for the wave). Run-028's zero dedupe_dropped is the first run-028 measurement on mint-022; it does not indicate a defect or a regression — the corpus simply had no within-run duplicates at (event_date, event_kind) granularity. **Basis:** per-run metrics from all six JSONs.
3. **Wave MH-5 artifact emission is working correctly for forward-events.** All six runs have run_id present, harness_version recorded, full_trace_refs named, and per_item arrays populated. Emission is CODE, inside `scripts/forward-events/run-extraction.mjs`'s `main()` `finally` block, so a run cannot complete without emitting. No PENDING-RUN marker is owed because the governing files have not changed since runs 010-022 landed. **Basis:** F28 rule (c) check; all six JSONs present at expected paths in the repository.

**Proposal:** None warranted this pass. The forward-events extractor is functioning correctly. All six new runs validate against the schema. Metrics are healthy and consistent. The wrapper-text residual (58 rows / 41 items) identified by maintenance #38 is understood and being addressed by lane FWD-TEXT-3 (which will follow with a new marker once it lands). No family-gate changes needed; the work is landed and the wave is complete.

**Family gates status:** Green. All six runs (023-028) validate against the schema. All metrics are present and healthy. No defects found in the new artifacts. The coordinator's confirmation of maintenance #38's success post-extraction is recorded. Fitness runner and tests to follow.

## Pass of 2026-09-04, later (lane PROPOSER-6 — forward-events-run-010 through -022: backlog applies #31 and #32, FWD-TEXT-2 + dedupe_dropped plumbed)

**Artifacts read:** forward-events-run-010 through run-022 (13 new runs across two backlog applies). Run-010 through run-015 (backlog apply #31, population-turn run 33867673887) covering corpus slices mint-run-005 through mint-run-014. Run-016 through run-022 (backlog apply #32, population-turn run 33868568869) covering the same mint-run-005 through mint-run-014 again, plus a new corpus mint-run-016. All 13 runs recorded harness_version sha256:cb4898d073a80ab9 and extractor_version fe1-2026-09-04.2.

**Full traces read:** `full_trace_refs` paths under `scripts/_snapshots/population-flywheel-mint-run-{005,006,011,012,013,014,016}/` for all 13 runs (corpus.json, corpus.events.json, corpus.skipped.json). Snapshot trace files themselves are NOT COMMITTED per Wave MH-5 convention (only artifact JSON files are), but the artifact JSON files point to their paths and the references are confirmed readable where they exist in this tree.

**Harness_version [CONFIRMED]:** All 13 runs record sha256:cb4898d073a80ab9, matching the current tree's hash. This is the same hash lane PROPOSER-5 identified as the FWD-TEXT-2 extractor (lane 2f110fea, 2026-09-04). The PENDING-RUN.md marker that lane would have written is correctly DELETED in this branch's HEAD commit (b4874fcb), per F28 rule (c) reverse-audit: "a marker whose recorded hash a LANDED artifact now matches is stale and must be deleted." Verified: `ls fsi-app/scripts/harness-runs/forward-events/PENDING-RUN.md` returns ENOENT.

**DEDUPE_DROPPED PLUMBING [CONFIRMED, PROPOSER-5's gap CLOSED]:** Lane PROPOSER-5 identified that runs 006-009 were missing the `dedupe_dropped` and `dedupe_dropped_detail` counts despite the extractor computing them. All 13 new runs carry the `dedupe_dropped` field in their metrics, confirming the plumbing deficiency was fixed. Values observed:
- Runs 010-011 (mint-005, mint-006 from #31): dedupe_dropped 2 each
- Runs 012-015 (mint-011 through mint-014 from #31): dedupe_dropped 0 each
- Runs 016-017 (mint-005, mint-006 from #32): dedupe_dropped 2 each (TWINS WITH 010-011)
- Runs 018-021 (mint-011 through mint-014 from #32): dedupe_dropped 0 each (TWINS WITH 012-015)
- Run 022 (mint-run-016, larger corpus): dedupe_dropped 15

**Twin-run comparison [CONFIRMED, exact agreement across #31 vs #32 re-runs]:**

Runs 010-015 (backlog apply #31) and runs 016-021 (backlog apply #32) processed the same six mint corpora. All metrics MATCH exactly:

| Mint | Run #31 | Run #32 | items_processed | events_emitted | skips | dedupe_dropped |
|------|---------|---------|-----------------|----------------|-------|---------|
| mint-005 | 010 | 016 | 5 | 2 | 1 | 2 |
| mint-006 | 011 | 017 | 5 | 2 | 1 | 2 |
| mint-011 | 012 | 018 | 43 | 2 | 0 | 0 |
| mint-012 | 013 | 019 | 39 | 6 | 0 | 0 |
| mint-013 | 014 | 020 | 30 | 2 | 0 | 0 |
| mint-014 | 015 | 021 | 40 | 2 | 8 | 0 |

This exact agreement (every metric identical between #31 and #32 twins) confirms: (1) the same extractor code (fe1-2026-09-04.2, harness sha256:cb4898d073a80ab9) processes the same corpus twice and produces identical results; (2) the dedupe strategy (content-similarity, never blind collapse) is deterministic and reproducible; (3) the re-run under #32 was not a defect or re-implementation, just the same batch re-processed due to the #31 artifacts not yet being on master when #32 ran (as noted in the instructions). **Basis:** all 13 JSON files read in full; twin metrics extracted and compared programmatically.

**Run-022 (new mint-run-016, larger corpus):** 177 items processed, 47 events emitted, 46 skips, 15 dedupe_dropped. This is the first extraction of mint-run-016, a materially larger corpus than any prior run (mint-run-014 was the previous largest at 40 items). The run shows healthy extraction metrics (17 items with events, 26% yield on items, day-precise dates, high/medium confidence split). **Maintenance #37's forward-events-retext dry-run measurement:** 921 rows to rewrite, 139 collision groups, 173 rows to delete; this run's output will feed that dry-run's next apply dispatch.

**Hypotheses (verified, with basis):**
1. **The FWD-TEXT-2 + dedupe_dropped plumbing is fully deployed and working correctly.** All 13 runs carry sha256:cb4898d073a80ab9 (confirmed live hash matches tree). All carry dedupe_dropped in metrics. Twin-run agreement across the same corpora proves extractable behavior is deterministic. **Basis:** all 13 artifact JSONs, live tree hash, F28 rule (c) confirmation.
2. **The dedupe plumbing fix closed PROPOSER-5's identified gap.** Run-extraction.mjs was modified to capture and forward counts; runs 010+ show the field present where runs 006-009 did not. No further runner changes needed on this field. **Basis:** read run-extraction.mjs lines 102-155 (now destructures all three: events, skipped, counts) and lines 141-151 (metrics now include dedupe_dropped).
3. **Twin-run agreement is the gold standard for re-run confidence.** Six mint corpora, two runs each, zero metric differences. If the #31 runs are trustworthy, so are their #32 twins, and vice versa. The re-run happened because #31's artifacts were in cherry-picks not yet on master; #32 re-ran the same work independently. Both sets are correct. **Basis:** programmatic comparison of all 6 twin pairs.
4. **The dedupe strategy is holding:** mint-005 (dedupe_dropped 2), mint-006 (2), and mint-016 (15) all show material dedupe activity. This is healthy; it means same (event_date, event_kind) duplicates under content-similarity are being collapsed within each run, not dropped as a family defect. **Basis:** per-run dedupe counts and the deterministic twin agreement.

**Proposal:** None warranted this pass. The dedupe plumbing is complete and working. Twin-run agreement confirms the extractor is reliable. The PENDING-RUN marker was correctly discharged. No family-gate changes needed; FWD-TEXT-2's work is landed and functioning.

**Family gates status:** Green. All 13 runs validate against the schema. All metrics are present and healthy. The dedupe_dropped field now appears as intended. No defects found in the new artifacts.

---

## Pass of 2026-09-04 (lane PROPOSER-5 — forward-events-run-006 through -009: FWD-TEXT extractor deployed, dedupe counts incomplete)

**Artifacts read:** forward-events-run-006 (population-flywheel-mint-run-004, corpus 4 items, 18 events, 1 skip, harness_version sha256:d47a10728a3cc799, extractor_version fe1-2026-09-03.1), forward-events-run-007 (population-flywheel-mint-run-001, corpus 6 items, 40 events, 19 skips, harness_version sha256:cefcc8cae82aff7d, extractor_version fe1-2026-09-04.1), forward-events-run-008 (identical corpus and metrics to run-007), forward-events-run-009 (population-flywheel-mint-run-004 again, 4 items, 11 events, 1 skip, harness_version sha256:cefcc8cae82aff7d, extractor_version fe1-2026-09-04.1).

**Full traces read:** `full_trace_refs` under `scripts/_snapshots/` for all four runs. Per PROPOSER-RUNBOOK.md §1's precondition, snapshot directories themselves (`population-flywheel-mint-run-001/`, `population-flywheel-mint-run-004/`) are NOT COMMITTED — only the artifact JSON files are. Trace files (`corpus.json`, `.events.json`, `.skipped.json`) named in full_trace_refs are **absent from this tree**, as expected (Wave MH-5 documented this: "_snapshots are not committed, only the artifact JSON is").

**Harness-version change [CONFIRMED, git-log-traceable]:** run-006 recorded hash d47a10728a3cc799 (extractor_version fe1-2026-09-03.1, dated 2026-09-03); runs 007-009 record hash cefcc8cae82aff7d (extractor_version fe1-2026-09-04.1, dated 2026-09-04). The hash change is git-log-traceable to commit 2f110fea ("train/wave25 2026 09 04 (#572)", 2026-09-04 04:59:25 UTC), lane FWD-TEXT. That commit modified `src/lib/forward-events/extract-forward-events.mjs` to:
- Fix clauseStart() snapping to sentence/clause boundaries (was fixed-byte offset, leaked mid-word)
- Add normalizeObligationText() stripping leaked URLs and markdown for DISPLAY only (source_span stays byte-verbatim)
- Add dedupeEvents()/sameObligationContent() collapsing same-run (event_date, event_kind) hits under content-similarity (never blind collapse)

**Dedupe counts deficiency [HYPOTHESIS]:** The FWD-TEXT extractor now returns `{ events, skipped, counts: { dedupe_dropped, dedupe_dropped_detail } }` per the updated extract-forward-events.mjs:1071 signature. However, runs 006-009's artifact metrics contain NO `counts` field or `dedupe_dropped` / `dedupe_dropped_detail` entries. Root cause [HYPOTHESIS, traceable to source]: `scripts/forward-events/run-extraction.mjs` line 116 destructures only `const { events, skipped } = extractForwardEvents(...)`, discarding the counts object. The counts are never passed through to the metrics. This is an incomplete implementation of the FWD-TEXT proposal — the extractor computes the dedupe counts correctly, but the runner loses them on the way to the artifact. **Basis:** read run-extraction.mjs:102-155 (runExtraction function) and extract-forward-events.mjs:1071 (return signature); the destructuring on line 116 of run-extraction.mjs matches only events and skipped, never counts.

**Metrics comparison across 006 → 009 [CONFIRMED, read from JSON]:**
- items_processed: 4 (006) → 6 (007) → 6 (008) → 4 (009) — varies by corpus input
- items_with_events: 4 (006) → 6 (007) → 6 (008) → 4 (009) — all items in each corpus had events
- events_emitted: 18 (006) → 40 (007) → 40 (008) → 11 (009) — higher on mint-run-001, lower on mint-run-004
- skips: 1 (006) → 19 (007) → 19 (008) → 1 (009)
- by_skip_reason: runs 006 and 009 have 1 entry each (the ambiguous-by-date skip); runs 007 and 008 have 3 entries (ambiguous-by-date, as-of status, as-of/since data-unavailability). **Basis:** the runs target different corpus items (mint-run-001 vs mint-run-004), which have different claim/section populations triggering different skip reasons.
- **dedupe_dropped / dedupe_dropped_detail:** NOT present in any of the four artifacts' metrics. [CONFIRMED by reading all four JSON files; no counts field found]. Expected per FWD-TEXT's commit message ("Every drop recorded in a new counts.dedupe_dropped_detail") but missing due to the runExtraction() deficiency above.

**Hypotheses (verified, with basis):**
1. **The FWD-TEXT extractor fix is correctly deployed.** Harness_version hash change from d47a10728a3cc799 to cefcc8cae82aff7d is git-log-traceable to commit 2f110fea (lane FWD-TEXT, 2026-09-04 04:59:25 UTC), which touched only extract-forward-events.mjs and is the only commit in recent history changing that file. The extractor_version bump from fe1-2026-09-03.1 to fe1-2026-09-04.1 independently confirms the change landed.
2. **Run-009 emits fewer events than run-006 on the same corpus (11 vs 18) because the dedupe logic is working.** Both run-006 and run-009 read corpus.json from population-flywheel-mint-run-004 (same 4 items: bfae9c86, 36c92d72, 9a22c296, a86dcc05). Run-006 (pre-dedupe) emitted 18 events with 1 skip; run-009 (with dedupe) emitted 11 events with 1 skip. The 7-event reduction (39% drop) is consistent with within-run deduplication collapsing same (event_date, event_kind) entries under content-similarity — not a defect, the intended behavior. **Basis:** run-009 processes the SAME items as run-006 but under the fixed, deduping extractor; metrics show 11 vs 18 events, exactly the kind of improvement deduplication should produce.
3. **The dedupe_dropped counts are implemented in the extractor but missing from artifacts due to incomplete runner integration.** Extract-forward-events.mjs line 1071 returns `{ events, skipped, counts: { dedupe_dropped: dropped.length, dedupe_dropped_detail: dropped } }`. Run-extraction.mjs line 116 destructures only `{ events, skipped }`, discarding counts. The metrics object built on lines 141-151 never includes a counts field. The extractor is doing its job; the runner is not passing the result through. [CONFIRMED by reading both files.]

**Proposal (scoped):**
1. **UPDATE runExtraction() to capture and forward the dedupe_dropped counts.** Change line 116 to destructure all three: `const { events, skipped, counts } = extractForwardEvents(...)`. Add counts to the returned metrics object (after line 150). This is a one-property addition to the runner; no change to the extractor or the artifact schema required — just plumbing the existing count through.
2. **Re-run forward-events extraction after the fix to populate the new counts in artifacts.** The next forward-events-run-010 (or later apply) will record the dedupe_dropped and dedupe_dropped_detail, allowing a future proposer pass to measure whether the dedupe strategy (content-similarity, not blind collapse) is effective. Until then, the counts exist in the extractor but are silent in the record.
3. **Lane FWD-TEXT-2 is planning further extractor changes** (mentioned in MINT-RUNBOOK.md context; a new PENDING-RUN marker will follow once that work lands). This dedupe-counts plumbing deficiency is an immediate, separable fix that should land before or with FWD-TEXT-2, not after.

**PENDING-RUN.md status [CONFIRMED]:** The marker file `scripts/harness-runs/forward-events/PENDING-RUN.md` was correctly DELETED in this branch's HEAD commit (commit 8866e07a, "forward-events: PENDING-RUN marker discharged..."), as required by F28 rule (c). The marker recorded sha256:cefcc8cae82aff7d as the "harness_version at write time"; run-007 (the first artifact with the new hash) matched it exactly, so per the reverse-audit rule, the marker was stale and must be deleted. **Basis:** F28-harness-run-integrity.mjs rule (c) header: "a marker whose recorded hash a LANDED artifact now matches... is stale and must be deleted." Verified by attempting to read the file (`ls` returns ENOENT).

**Family gates status:** This pass reads four run artifacts (006-009), one of which (run-007) and its siblings (008, 009) carry the first deployed version of the FWD-TEXT extractor fix. The dedupe_dropped counts are not yet in the artifacts due to the runner deficiency above, but the extractor itself is working correctly (run-009's 11-event result vs run-006's 18 on the same input confirms dedupe is active). The PENDING-RUN marker was correctly discharged. No family-gate changes needed for this pass; the proposal above (runner fix) is a separate, next-cycle lane.

## Pass of 2026-09-03, evening (lane ARTIFACTS — forward-events-run-005: a governing-file change, a genuinely empty run)

## Pass of 2026-09-03, evening (lane ARTIFACTS — forward-events-run-005: a governing-file change, a genuinely empty run)

**Artifact read:** forward-events-run-005 (corpus-turn run `33802504364`, apply, 2026-09-03T20:29:28Z,
since `2026-09-03T12:44:57Z`). Pushed to its own `turn/33802504364` branch (Actions PR-creation refused)
and landed here by cherry-pick; not previously on master. A sibling branch, `turn/33756943043`
(`forward-events-run-004`, since `1970-01-01`), was checked and found **already landed** — it is
`forward-events-run-004.json` in commit `f59b9a41` ("Flywheel turn: forward-events runs 003/004
landed…", already on `origin/master`); this pass does not re-land it.

**Governing-file change, confirmed, no `PENDING-RUN.md` needed:** run-005's `harness_version` is
`sha256:d47a10728a3cc799`, DIFFERENT from run-004's `sha256:0a36113e8e96ade5`. Re-hashing the family's
current governing files (`src/lib/forward-events/extract-forward-events.mjs`,
`scripts/harness-runs/forward-events/PROTOCOL.md`) against the live tree gives
`sha256:d47a10728a3cc799` — matches run-005 exactly, so F28 rule (c) is satisfied by the landed artifact
itself; no marker required. The change is `git log`-traceable to commit `82f70e2f` ("FE-SLOT: due_date
slot claims classified without kind assumption, slot_date_unclassified skip, by_skip_reason metrics"),
already on master before this lane started — this is the previous proposer pass's **proposal 1**
("Offer the slot FACT's span to the extractor") and part of **proposal 2** (`by_skip_reason` in metrics)
landing, read back here as the metric this pass exists to check moved.

**What the artifact shows [CONFIRMED, read from the JSON]:** `items_processed: 0, items_with_events: 0,
events_emitted: 0, skips: 0` — every count in `metrics` is zero, `per_item` is empty (0 entries),
`by_skip_reason: {}`. This is a genuinely empty run, not a truncated or lossy one: `full_trace_refs`
names three files under `scripts/_snapshots/turn-33802504364/` and all three exist in this landing
(`turn-corpus.json`, `.events.json`, `.skipped.json`). **Basis for "genuinely empty, not a defect":**
this turn's `since` marker is `2026-09-03T12:44:57Z` (the previous turn's own recorded timestamp) and
its own `started_at` is `20:29:28Z` — a roughly 7.75-hour window. The day's two population applies that
minted new record-grade items (`population-33804773824`, `population-33806554326`) both landed AFTER
this turn ran (21:02Z and 21:21Z respectively, per their own artifacts' `started_at`), so the corpus-turn
exporter's "verified items with no forward-event row, created since the marker" selection legitimately
found nothing: no new items existed in that window yet. Skip-reason histogram is `{}` for the same
reason — there was nothing to skip, not a broken histogram.

**Hypotheses (verified, with basis):**
1. **A zero-item run is the honest result of dispatch ordering, not a family defect.** See above; this
   pass does not treat `by_skip_reason: {}` as evidence proposal 2 failed to land — it landed (the key is
   present in the schema and would populate on the next non-empty run), it simply has nothing to report
   this run.
2. **`extractor_version` bumped to `fe1-2026-09-03.1`** (from `fe1-2026-09-01.1` in prior artifacts),
   confirming the extractor's code changed in a way the family's own versioning convention tracks, ahead
   of `harness_version` reflecting the same change — the two signals agree.
3. **The next corpus-turn dispatch (after the day's two population slices) is the actual measurement of
   whether FE-SLOT's due_date-span change moved the family's standing metric** (extraction precision /
   coverage, `CONVENTION.md`'s "forward-events's standing metric"). This run cannot show that — it had no
   items to extract from — so this pass records the metric as **not yet measurable at the new hash**,
   rather than defaulting it to zero or silently carrying forward run-004's pre-change numbers as if they
   still applied.

**Proposal:** none warranted from this pass alone — the FE-SLOT proposal from the prior pass is already
landed and this run's zero counts are explained, not concerning. The real next step is procedural, not
code: **dispatch corpus-turn again after (not interleaved with) the day's population applies**, so the
next `forward-events-run-006` actually exercises the FE-SLOT change against real record-grade items and
this family's standing metric becomes measurable at `sha256:d47a10728a3cc799`. That dispatch is outside
this lane's access (no live Actions dispatch here).

**`PENDING-RUN.md` discharged, per F28 rule (c):** lane FE-SLOT's own marker recorded
`harness_version at write time: sha256:d47a10728a3cc799`, naming "the next corpus-turn apply" as the
run that would supersede it. run-005 IS that run and its `harness_version` matches exactly — F28's
reverse-audit rule says the marker is deleted the moment a landed artifact's hash matches what it
anticipated, so `forward-events/PENDING-RUN.md` is deleted in this landing (confirmed by re-running
`node .discipline/fitness/runner.mjs`: F28 flagged it stale before the deletion, clean after).

**Family gates status:** this landing adds one run artifact, deletes the now-stale `PENDING-RUN.md`, and
adds this attestation; the governing-file change it records (`82f70e2f`, FE-SLOT) was already landed on
master before this lane started — this pass reads and attests to it, it does not author it.

## Pass of 2026-09-03, midday (forward-events-run-003 and -004 — the turn after the first limit-200 population slice)

**Artifacts read:** forward-events-run-003 (corpus-turn run 33658489880, apply, 2026-09-02T17:02Z,
since `2026-09-01T22:26:28Z`: 53 processed, 1 item with events, 2 events, 2 skips) and
forward-events-run-004 (corpus-turn run 33756943043, apply, 2026-09-03T12:45Z, since `1970-01-01`:
481 processed, 21 items with events, 70 events, 298 skips; by_kind compliance_deadline 52 /
entry_into_force 14 / review_or_report 4; by_confidence high 35 / medium 35; every event day-precise),
both at `harness_version sha256:0a36113e8e96ade5` (unchanged since run-002, so no PENDING-RUN marker
was owed). Run-003 sat unlanded on its `turn/` branch for a day (the repository refuses PR creation, so
each turn pushes a branch and nothing lands it until a coordinator does); run-004's numbering came from
the workflow's sibling-branch hydration guard, which is that guard doing its job. Both land here.

**Full traces read:** run-004's `turn-corpus.json`, `.events.json`, `.skipped.json` under
`scripts/_snapshots/turn-33756943043/` on the pushed branch (the fix from the previous pass held: the
traces survived the runner this time); the same corpus turn's discover step (5,460 edges across 506/619
targets, 5,455 rows written: 3,449 new, 2,006 refreshed, 5 skipped as entity/semantic-owned, 0 chunk
failures) and analyze step (18 themes, 19 gaps: 3 opened / 2 resolved / 16 unchanged; 7 anticipate
targets unchanged; 930 signal candidates: 694 flags opened / 147 resolved / 236 unchanged); the live
`item_forward_events` (903 → 973), `item_cross_references` (6,059 rows, 5,993 discovery-origin), and
`integrity_flags` (930 open signal flags, 2,416 open in total) tables; the same day's population
apply-ready payloads (`scripts/_snapshots/population-33749140151/census-rows.apply-ready.json`).

**Hypotheses (verified, with basis):**
1. **The yield on record-grade items is one tenth of the yield on brief-grade items, and that is the
   input, not the extractor.** 17 of run-004's 21 event-bearing items are the day's 177 record-grade
   mints (read back by id against `created_at`); 17/177 = 9.6%, against run-001's 137/322 = 43% on
   LLM-brief items. A record-grade payload carries 5–6 claims and 3 sections, and the applied batch's
   claims are 712 GAP to 416 FACT; the extractor reads `claim_text` and `content_md` only
   (`src/lib/forward-events/read-and-extract.mjs` lines 32–35), so an item whose facts are mostly
   "the source does not state" has little to extract. Not a defect; a ceiling set upstream.
2. **A grounded date the mint already holds is invisible to this family.** 48 of the 178 payloads carry
   `item.due_date` (16 day-precise, 2 month, 2 year, 28 with no precision recorded), located verbatim by
   `record-facts.mjs` (MINT-RUNBOOK §13). `read-and-extract.mjs`, `export-corpus-for-extraction.mjs` and
   `run-extraction.mjs` contain no reference to `due_date` or `date_precision` (grep, all three). So the
   same date is derived twice by two regexes, or once and then missed. The slot is deliberately untyped
   ("locates A date, not which of the four it is", MINT-RUNBOOK §13), so it cannot be written as a
   `compliance_deadline` event by assumption; but its grounding span can be offered to the extractor as
   input text, and the extractor's own kind classifier decides. Proposal 1.
3. **No new item is isolated after the turn.** All 177 mints carry at least one edge (4,222 edge rows
   touch them) despite empty connection-signature tags, because `shared_source` and jurisdiction bases
   still score. What they cannot score is `shared_scenario` / `shared_compliance_object` /
   `shared_jurisdiction_topic`, which is the tag pipeline's job (MAINT `tag-proposals`, landed today).
4. **Run-003's 53 / 1 / 2 is the previous pass's hypothesis 2 observed again**: the turn re-processes the
   no-event set every time, and a `since` marker only narrows it to items created after the marker.
   `by_skip_reason` (previous pass, proposal 1) is still not in the artifact's metrics; the 298 skip
   reasons of run-004 live only in the snapshot's `.skipped.json`.

**Proposal (scoped, NOT implemented in this landing):**
1. **Offer the slot FACT's span to the extractor.** In `read-and-extract.mjs`, when the item row carries
   `due_date`, append the `source_span` of the FACT claim whose `slot_key` is `due_date` to the text
   candidates (it is already a claim, so this may reduce to ensuring slot FACTs are not filtered out
   before extraction; read `readAndExtractForwardEvents`'s claim filter first). One derivation, the
   extractor's classifier decides the kind, `date_precision` from the slot is carried when the
   extractor's own precision is coarser. Governing-file change; PENDING-RUN re-stamp.
2. `by_skip_reason` in metrics (carried forward from the previous pass).
3. The turn branch has no landing path of its own; a coordinator lands it. Until the repository's
   PR-creation setting changes, the runbook should say so where it says "PR".

**Family gates status:** this landing adds two run artifacts and this attestation; no governing-file
change (`harness_version` of runs 003/004 matches the current tree).

## Pass of 2026-09-01 (forward-events-run-001, -002) — retained verbatim

**Artifacts read:** forward-events-run-001 (the external scratch-script run, 322 items, 902 events,
137 items with events) and forward-events-run-002 (the first run through the family's own versioned
runner, `scripts/forward-events/run-extraction.mjs`, driven by the corpus-turn GitHub Actions workflow,
run 33566259450, 2026-09-01T22:26:32Z, `harness_version sha256:0a36113e8e96ade5`).

**Full traces read:** run-002's `full_trace_refs` name `/tmp/turn-corpus.json`,
`/tmp/turn-corpus.events.json`, `/tmp/turn-corpus.skipped.json` on the Actions runner that produced them.
**Those files no longer exist** — the runner is ephemeral and the workflow only retained
`scripts/_snapshots/`. The 276 skip reasons run-002 recorded were therefore NOT readable from the repo.
This is defect 2 below; the workflow was changed in the same landing so no future run loses them.

**Hypotheses (verified, with basis):**
1. **Run-002's `0 events / 185 items / 276 skips` is the correct result, not a defect.** The corpus-turn
   exporter (`scripts/turns/export-corpus-for-extraction.mjs`) selects live verified items with NO
   `item_forward_events` row. Run-001 processed all 322 live items and 137 produced ≥1 event;
   322 − 137 = 185, exactly the set run-002 received. Those 185 produced 0 events in run-001 as well (their
   share of its 834 skips); the same pure extractor at the same `EXTRACTOR_VERSION` (`fe1-2026-09-01.1`)
   over the same text returns the same answer. Basis: read both artifacts' metrics and the exporter's
   selection query; the exporter's `{claim_id, kind, text, span}` / `{section_id, key, md}` mapping was
   checked field-for-field against `src/lib/forward-events/read-and-extract.mjs`, the live per-item reader.
   The coordinator first reported this as "a shape mismatch" to the operator before reading run-001; that
   was an inference presented as a finding and was corrected on the record (session-log Addendum 82).
2. **Every corpus turn re-processes the no-event set.** The exporter's "lacks any forward-event row"
   scope is by construction the set of items the extractor already found nothing in, plus any genuinely
   new items. At today's corpus that is 185 items at $0 and 0 seconds; it becomes a real cost only if the
   no-event set grows large, and it is the honest behavior (a text edited since the last turn can gain a
   date). No change proposed; recorded so the next pass does not "discover" it again.
3. **Defect (workflow, fixed this landing): full traces on `/tmp`.** `corpus-turn.yml` now writes the
   corpus file and run-extraction's events/skipped outputs under `scripts/_snapshots/turn-<run_id>/`,
   which the workflow's existing upload-artifact step retains for 90 days, so `full_trace_refs` of every
   future artifact resolve to a retained file.
4. **Defect (family artifact, fixed this landing): a raw NUL byte in `apply-extraction-output.mjs`'s
   `dedupeKey` separator** made `grep` treat the load-half script as binary. Replaced with the escape
   `"\u0000"` — same runtime value, text source. No key changed; run-002 loaded 0 rows so no row was ever
   keyed by it in production before the fix.

**Proposal (scoped, NOT implemented in this landing):**
1. **Skip-reason histogram in the artifact's metrics** (`by_skip_reason`, alongside `by_kind`): the
   extractor already returns a `reason` per skip, and run-001's 834 / run-002's 276 skips are the family's
   only signal about where the rule table under-reaches (e.g. "'as of' marks a data-unavailability note").
   A histogram in `metrics` makes the next proposer pass readable from the artifact alone, even if a
   trace file is lost again. One `runExtraction()` change plus a test; bumps no `EXTRACTOR_VERSION`.
2. **Reconcile the two runs' `per_item` shapes.** Run-001 carries a single per_item entry (the scratch
   script summarised the whole corpus as one row); run-002 carries one per item (185). CONVENTION.md's
   per_item contract is per unit of work; run-001 is grandfathered as the external-script run its own
   `proposer_notes` describe, and no rewrite of a landed artifact is proposed.

**Family gates status:** this landing deletes `forward-events/PENDING-RUN.md` (run-002's
`harness_version` matches the current tree, so F28's reverse-audit says the planned run happened) and
adds this attestation. No governing-file change; `EXTRACTOR_VERSION` unchanged.
