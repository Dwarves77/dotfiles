# DB-1 (Substrate) Register — Full-System Audit 2026-07-11

Agent: DB-1. Scope: 19 substrate tables per coverage-manifest §B. Access: `mcp execute_sql`
(SELECT / information_schema / pg_catalog only) + one authorized read-only scratch script for the
62-item pool-coverage deliverable. Zero writes, zero DDL, zero fetches, zero model calls.
Branch `audit/full-system-2026-07-11`; DB = live `kwrsbpiseruzbfwjpvsp`.

Severity legend: **BC** breaks-customer · **BD** breaks-doctrine · **DW** dead-weight · **CO** cosmetic.
Every finding carries a candidate next-action (NA).

---

## 0. Row-count reconciliation (all 19 exact)

Query: per-table `count(*)` UNION (single statement). Result matched manifest §B exactly:
intelligence_items 653 · intelligence_item_sections 3,379 · intelligence_item_versions 1,328 ·
section_claim_provenance 8,686 · agent_run_searches 3,126 · intelligence_summaries 2,265 ·
item_timelines 1,000 · regional_data_facts 75 · item_cross_references 53 · item_type_required_slots 48 ·
region_dimension_coverage 30 · sector_contexts 15 · state_cost_facts 13 · item_supersessions 11 ·
item_changelog 9 · item_disputes 7 · regions 5 · published_price_statistics 4 · coverage_gaps 2.

## 0b. RLS / trigger inventory (queried pg_class, pg_policies, pg_trigger)

- All 19 tables have RLS **enabled** (none forced).
- **No policies at all** on: `agent_run_searches`, `section_claim_provenance` → deny-all except
  service_role. Not an exposure; but any non-service reader (readClient used to be assumed anon in one
  memory note — it is in fact the service-role client, `scripts/lib/db.mjs:59`) gets zero rows silently.
  NA: X-agent confirm the customer citation surface reads claims via service-role API only (CODE-3).
- Public-`true` SELECT on child/aux tables: `item_timelines`, `item_changelog`, `item_cross_references`,
  `item_disputes`, `item_supersessions`, `regional_data_facts`, `regions`, `state_cost_facts`,
  `region_dimension_coverage`, `coverage_gaps`. Parent gate exists ONLY on `intelligence_item_sections`
  (verified + not-archived). **Finding RLS-1 (BD, mild):** anon can enumerate timelines/xrefs/disputes/
  supersessions naming quarantined or archived items that the items RLS hides (689 timeline rows +
  many xrefs point at non-verified items). NA: parent-gated policies mirroring the sections pattern.
- `intelligence_item_versions`: service_role-only policy (deny app users) — consistent with audit-trail use.
- Triggers found and consistent with code assumptions: provenance stamping (`set_provenance_status` on
  items/sections/claims, `guard_provenance_flip`, `stamp_prov_origin`), `_guard_source_archive` (mig 135),
  integrity-flag recompute on full_brief, jurisdiction normalizer, version snapshot trigger, updated_at,
  and `rdf_sync_coverage` on regional_data_facts. fact_count sync **verified exact** (see §11).

---

## 1. intelligence_items (653)

Stats (full-scan aggregates): 74 live columns (ordinal 73 dropped). legacy_id 192 distinct / 461 NULL /
UNIQUE constraint holds. domain 1–7 (d1=321, d3=106, d7=91, d4=82, d2=36, d5=16, **d6=1**).
provenance: verified 380 (179 live + 201 archived) · quarantined 197 (106 live) · unverified 57 ·
pending_human_verify 19 (all unverified/pending rows are archived). added_date 2023-07-07..2026-06-21.
full_brief: 277 NULL; lengths 1,118–82,980 (avg 27,157). All verified rows have provenance_verified_at.
Every verified-live item has sections (0 missing) and claims (0 missing).

Findings:

1. **ITM-1 (BC candidate): 5 verified-live items with NULL full_brief** — f72155a2 (TCEQ Current Rules),
   9622fa5d (MEPC.377(80)), 8fb37a9e (Amendment C376), bd7c3f5a (EPA Fast Facts 28%), cda44a7d
   (North Carolina Register). All format_type NULL, never regenerated, yet sections+claims exist and RLS
   exposes them. Customer brief surface renders from full_brief and/or sections — if full_brief path, tile
   is empty. NA: regenerate through the canonical pipeline or re-quarantine; CODE-4 confirm render path.
2. **ITM-2 (DW/data-quality): 51 archived rows with archive_reason NULL** (full dump taken; the 51 ids
   include the EcoVadis cluster ×6, parliamentary/agency portals ×~20, ss1–ss5 superseded snapshots, IMO
   strategy dups). Violates "archived-with-reason" reachability story; /admin archive grouping shows an
   unlabeled bucket. NA: backfill reasons (most fit portal_artifact / reclassified_to_source /
   superseded_snapshot patterns); consider NOT NULL-when-archived CHECK.
3. **ITM-3 (BD, vocab): archive_reason vocab fracture, no CHECK constraint.** 14 distinct live values:
   machine snake_case (reclassified_to_source 253, portal_artifact 16, off_vertical 9, …) + Title-case UI
   vocab ("Superseded" 3, "Repealed" 1) + free-text ("source_url_unverifiable_no_replacement_found") +
   three duplicate-flavored values (duplicate, duplicate_instrument, duplicate_of_verified).
   `src/lib/constants.ts` ARCHIVE_REASONS = ["Superseded","Expired","Repealed","Consolidated","Manual"] —
   matches almost nothing in the DB. NA: one vocab, one CHECK, map constants.ts to it (same class as the
   severity fracture fixed by metadata-vocab.ts).
4. **ITM-4 (CO): severity off-skill-vocab on 6 rows** ("high" ×2: AFIR, K-Taxonomy; "moderate" ×4: India
   Green Credit + 3 UAE items) — CHECK-legal per-surface vocab, but outside the 5-label skill set;
   toDisplaySeverity falls back to raw string. NA: normalize during next regen pass.
5. **ITM-5 (data anomaly): 3 rows with FUTURE last_regenerated_at = 2026-07-14** (a8 Aviation Week,
   r22 EcoEnclose Blog, r20 JOC) — audited on 2026-07-11. A writer stamped a *scheduled* time into a
   field the contract treats as "when regenerated". NA: find the writer (monitoring/queue path) and stamp
   actual time; correct the 3 rows via migration.
6. **ITM-6 (DW): all-NULL / all-empty columns across 653 rows:** compliance_deadline, next_review_date,
   last_verified, replaced_by, version_history ('[]' ×653), linked_forum_thread_ids, linked_vendor_ids,
   linked_case_study_ids, linked_regulation_ids, region_tags, vertical_tags, **theme (0 rows despite CHECK
   + metadata-vocab support)**, **trajectory_points (0 rows despite Sprint-3 schema + trajectory CHECK)**.
   Near-dead: operational_impact '' ×647, open_questions {} ×647, reasoning '' ×524, instrument_type 15
   non-NULL, instrument_identifier 25, entry_into_force 23. NA: consumer audit then drop-or-populate
   decision per column; theme is deliberately banked (Emergence-Capture) — theme_candidate holds 20 values.
7. **ITM-7 (BC candidate): live verified duplicate item pairs**, confirmed by direct query:
   EIA Spot Prices ×2 (one `regional_data`, one `market_signal` — same title), First Movers Coalition ×3,
   Getting to Zero Coalition ×2, Singapore Green Finance Incentive Scheme ×2 (slug + `sg-` slug). All are
   is_archived=false + verified → customer sees duplicates; three of the pairs are stitched together with
   an `item_cross_references` 'related' row instead of deduped (see §9). NA: RC-9 dedup pass on these
   4 clusters (winner + archive loser + supersession row, the built mechanism).
8. **ITM-8 (CO): hidden_reason is free-text** (10 rows: rc9_dedup_archived ×6, two multi-sentence
   topic_out_of_scope essays, rc8_review_pending, dedupe_legacy_double_write). NA: code + note pattern
   (`code: note`) or reference table.
9. Vocab checks vs `metadata-vocab.ts` (live CHECKs dumped and diffed): severity/priority/urgency_tier/
   format_type/signal_band/theme CHECK sets **match the module exactly**. status, item_type, confidence,
   instrument_type, pipeline_stage enums all within CHECK. No CHECK violations possible; none found.

## 2. intelligence_item_sections (3,379)

Stats: 390 items with sections; section_key ∈ "1".."15" (15 distinct), section_order == int(section_key)
in every row (min=max per key); UNIQUE(item_id, section_key) holds; content_md never empty, 132–32,228
chars (avg 2,802); is_conditional 795; created 2026-05-28..2026-07-11.

1. **SEC-1 (DW): `source_ids` = '{}' on ALL 3,379 rows** — attribution lives in
   section_claim_provenance; this column was never populated. NA: drop (with consumer sweep) or document
   as superseded-by-claims.
2. **SEC-2 (flag, don't judge):** 787 sections belong to archived items, 1,194 to live non-verified
   (quarantined) items — invisible via RLS parent gate, retained as resynth substrate. Consistent with the
   deferral design; no action.
3. Distribution note: keys 9 (11 rows), 12 (72), 13 (52) are rare conditional sections — matches the
   15-section regulatory format's conditional design. CO only.

## 3. intelligence_item_versions (1,328)

Stats: 640 items covered (13 items have zero versions — all never-regenerated rows; flag only);
version_number 1..15; chain integrity clean (0 rows with version>1 and NULL previous_version_id; 640
roots = 640 items); full_brief NULL on 459 (metadata-only snapshots), lengths 2,681–83,835.

1. **VER-1 (DW): created_by_run_id NULL on ALL 1,328 rows** — the snapshot trigger never stamps the
   producing run; provenance of "which run wrote this version" is unrecoverable. NA: wire run id into the
   trigger path (session GUC or app-level insert) or drop the column.
2. **VER-2 (CO, historical): severity display-form leakage** — versions carry "MONITORING" ×8,
   "COST ALERT" ×1, "moderate" ×4, "high" ×2 (no CHECK on this table). These are faithful snapshots of the
   pre-migration-102 fracture; leave as audit history. NA: none (document).
3. regeneration_skill_version: 2 distinct ("2026-04-29", "2026-05-27") + NULL — matches items table.
   Priority/urgency/format vocab all in-range.

## 4. section_claim_provenance (8,686)

Stats: claim_kind FACT 7,038 / GAP 1,075 / ANALYSIS 573 / **LEGAL 0**; 332 items, 2,571 sections covered;
claim_text 27–891 chars, never empty; extracted_at 2026-06-02..2026-07-11; 0 rows where section_row_id's
item ≠ intelligence_item_id (cross-FK consistency verified); 0 claims with neither source_id nor
search_result_id; every FACT has a span.

1. **CLM-1 (BD candidate): 890 FACT claims (12.6%) have search_result_id but NULL source_id and NULL
   source_tier_at_grounding.** The moat contract stamps span→source→tier at grounding; for these the tier
   stamp is absent and authority is only re-derivable by re-resolving the search row's URL. The floor
   validator (validate_item_provenance) and claims-tier audit re-resolve via the canonical resolver, so
   enforcement holds — but the STORED stamp the schema promises is missing. NA: backfill source_id/tier via
   buildResolver over the 890 rows' result_urls (read-compute-migrate), or record why unresolved-host FACTs
   were allowed to verify.
2. **CLM-2 (DW): verified_by / verified_at NULL on all 8,686 rows** — human-verify columns never used.
   NA: drop or reserve explicitly for pending_human_verify workflow.
3. **CLM-3 (CO/vocab): claim_kind 'LEGAL' permitted by CHECK, zero rows** — the legal-line discipline
   emits legal caveats but the parser never labels claims LEGAL. NA: confirm intended mapping (LEGAL→
   ANALYSIS?) or wire the kind; keep CHECK meanwhile.
4. Tier stamp range where present: 1–6 (no tier-7 grounding) — consistent with floor discipline.

## 5. agent_run_searches (3,126)

Stats: 351 items have pools; result_url never NULL/empty; result_index 0–99; excerpts: 264 NULL + 19
empty, lengths up to **559,167 chars** (avg 10,335 — the truncation fix's full-document pulls are visibly
present); searched_at 2026-06-02..2026-07-11.

1. **ARS-1 (DW): agent_run_id NULL on ALL 3,126 rows** (0 distinct) and **no FK to agent_runs** — the
   table's name promises run-keyed provenance; reality is item-keyed pools. NA: either stamp run ids at
   write time + add FK, or rename/document as item search pool. (Orphan check trivially clean.)
2. FK to intelligence_items enforced (CASCADE); 0 orphans both directions (every pool row's item exists;
   302 items have no pool — includes never-generated and legacy rows; flag only).
3. No RLS policies (see §0b) — internal substrate only.

## 6. intelligence_summaries (2,265)

Stats: **perfectly rectangular 151 items × 15 sectors**; all generated 2026-04-11..13 under the retired
multi-sector model; model_version single distinct value; summary 624–10,295 chars; sector orphans vs
sector_contexts: 0; item FK enforced, 0 orphans; 645 rows belong to now-archived items.

1. **SUM-1 (DW, ruled):** entire table is stale pre-B.2.5 output, SHELVED-not-RETIRED by the 2026-04-30
   decision. Doctrine text says "2,325 rows"; live count is 2,265 — 60 rows silently lost to item CASCADE
   deletes since. NA: none now (per ruling); update the stale 2,325 figure wherever it's quoted; note that
   CASCADE erosion means the shelved corpus is not immutable.
2. **SUM-2 (DW): urgency_score NULL on all rows** — dead column in a dead table. NA: fold into the
   activation-time redesign.

## 7. item_timelines (1,000)

Stats: 127 items; milestone_date 1862-10-01..2060-01-01 — extremes verified LEGITIMATE (DOU founded 1862;
China 2060 carbon-neutrality target); is_completed 669; sort_order 0–39; no dup (item_id, date, label)
groups; created 2026-04-05..2026-07-11.

1. **TML-1 (see RLS-1, BD mild):** 689 rows belong to live non-verified items and 85 to archived items,
   all anon-readable while parents are hidden. NA: parent-gated RLS.
2. **TML-2 (CO):** 16 rows where is_completed disagrees with (milestone_date ≤ today) — editorial flag vs
   date; plausible for postponed/early milestones. NA: none; optionally a nightly recompute if the flag is
   meant to be mechanical.
3. No uniqueness constraint on (item_id, milestone_date, label) — clean today; NA: consider unique index
   to keep the ingestion idempotent.

## 8. regional_data_facts (75) — full dump taken (see below)

Stats: 3 of 5 regions populated (ASIA 25, UAE 25, UK 25; **EU 0, US 0**); 5 dimensions × 5 facts per
populated region; dimension `regulatory_feasibility` has 0 rows anywhere; status/trend never NULL; all
last_updated 2026-05-28.

1. **RDF-1 (BD candidate): source_id NULL on ALL 75 rows.** Facts on a customer-facing surface carry
   only free-text `source_note` (name + URL + date), and many notes cite tier-5-ish hosts (Indeed, Mordor
   Intelligence, GoComet, vendor blogs). The platform's provenance doctrine (facts owned by DB with
   traceable provenance) is not met by FK here. NA: register the recurring publishers and link source_id,
   or explicitly label the Operations facts surface as note-cited (decision for operator).
2. **RDF-2 (flag):** EU + US regions render zero facts (coverage table says "missing" honestly — §11).
   NA: population is a corpus task, not a defect.
3. Full dump: 75 rows recorded during audit (region · dimension · fact_label · len(value) · left(value,80)
   · status · trend · has_src=false · left(source_note,50) · last_updated). Representative rows:
   ASIA/infrastructure "Hong Kong International Airport — Air cargo throughput 2024" (88ch, note: CAAS);
   UK/labor_markets "HGV driver structural shortage" (96ch, note: AllTruckInfo); UAE/operational_cost
   "diesel pump price AED 4.69/litre May 2026" (87ch, note: DubiCars/UAE Fuel Price Committee). The full
   75-row result set is reproducible with:
   `SELECT r.code, f.dimension, f.fact_label, length(f.value), left(f.value,80), f.status, f.trend, f.source_id, left(f.source_note,50), f.last_updated::date FROM regional_data_facts f JOIN regions r ON r.id=f.region_id ORDER BY 1,2,3;`

## 9. item_cross_references (53) — full dump taken

Stats: relationship='related' on 53/53; origin='manual' on 53/53 (richer vocab supersedes/implements/
conflicts/amends/depends_on + agent_semantic/entity_extraction entirely unused); UNIQUE(source,target)
holds; FKs enforced.

1. **XRF-1 (BC candidate, pairs with ITM-7):** 4 xref rows are duplicate-item stitches, not intersections:
   EIA Spot Prices↔EIA Spot Prices (same title), First Movers Coalition (WEF)↔r25, Getting to Zero
   Coalition↔WEF twin, Singapore GFIS↔sg-twin. NA: dedup the items; delete the stitch rows.
2. **XRF-2 (flag for CODE-4):** many xrefs point at archived (t5, g28, a6, r35, c9/c10, t3, ICCT…) or
   quarantined targets — the customer "related" rail either leaks hidden titles or silently drops rows
   depending on implementation. NA: CODE-4 verify the join gates on verified+live.
3. **XRF-3 (DW):** relationship/origin single-valued — the intersection-detection feature writes nothing
   here. NA: none (feature-maturity note).
Dump: all 53 rows recorded in audit evidence (source legacy_id/title · target legacy_id/title ·
relationship · origin · both sides' is_archived + provenance) — reproducible via the JOIN query used
(`SELECT ... FROM item_cross_references x JOIN intelligence_items si ... JOIN intelligence_items ti ...`).

## 10. item_type_required_slots (48) — full dump taken

12 item_types × 4 slots exactly; UNIQUE(item_type, slot_key) holds; covers every CHECK item_type.
Reg-family (regulation/directive/standard/guidance/framework): effective_date, jurisdictional_scope,
penalty_summary, primary_deadline. market_signal/initiative: action_now, conversion_trigger,
driving_parties, signal_event. technology/innovation/tool: deployment_reality, operational_fit,
procurement_window, supplier_access. research_finding: decision_relevance, does_not_resolve, finding,
methodology_limits. regional_data: cost_baseline, feasibility_choice, pending_change, region_jurisdiction.

1. **SLT-1 (CO):** description registers are inconsistent — framework/guidance/standard penalty_summary +
   primary_deadline descriptions embed prompt-fragment text ("… Emit a FA…") vs the clean phrasing on
   regulation/directive. NA: normalize descriptions (display-only).

## 11. region_dimension_coverage (30) — full dump taken

5 regions × 6 dimensions exactly; state ∈ {populated, missing} only (partial/pending unused);
**fact_count verified EQUAL to actual regional_data_facts count in all 30 rows** (trigger
`rdf_sync_coverage` proven correct). EU: 6× missing/0. US: 6× missing/0. ASIA/UK/UAE: 5× populated/5 +
regulatory_feasibility missing/0.

1. **RDC-1 (DW):** notes all NULL/empty, last_reviewed_at all NULL — review workflow never used. NA: none.

## 12. sector_contexts (15) — full dump taken (synopsis_prompt as len+left80 per dump rule)

15 sectors (automotive, bulk-commodity, cold-chain, dangerous-goods, e-commerce, film-tv, fine-art,
general-air, general-ocean, humanitarian, industrial-equipment, live-events, luxury-goods, oil-gas,
pharmaceutical); prompts 616–815 chars, all "Analyze this regulation for a …" (archived multi-sector
model's inputs); urgency_weights well-formed 4-mode maps; arrays populated everywhere.

1. **SCT-1 (DW, ruled):** input table for the SHELVED per-sector feature; retained per the 2026-04-30
   decision. NA: none until sector activation.

## 13. state_cost_facts (13) — full dump taken

13 US states (AZ CA CO FL GA IL MA NJ NY OH PA TX WA), all dimension=labor_markets, all fact_label=
"Minimum wage", values $7.25–$17.13/hr, trend up/flat, **all 13 have source_id** (contrast RDF-1), all
carry statute_citation; effective_date 2026-01-01 or NULL (federal-floor states).
UNIQUE(state_code, dimension, fact_label) holds.

1. **SCF-1 (CO):** table exercises 1 of 6 CHECK dimensions and one fact type — fine as v1; the FL citation
   notes "rises to $15.00 on 2026-09-30" (still future; not stale). NA: none.

## 14. item_supersessions (11) — full dump taken

5 curated chains (ss1→g2 PPWR, ss2→c1 CSRD Omnibus threshold, ss3→g8 Endangerment-Finding note,
ss4→o1 IMO 2023, ss5→o13 NZF) + 6 "Phase 5 RC-9 dedup; loser archived under canonical winner" rows
(2026-05-18). severity ∈ {major, minor, replacement} per CHECK. FKs enforced.

1. **SUP-1 (CO/flag):** one RC-9 row memorializes the off-vertical "Matrix Hudson 2BR/1BA Affordable
   Rental Unit" housing-lottery duplicate pair — both endpoint items confirmed archived (verified,
   market_signal). Harmless audit trail of an ingestion mistake; the ingest gate class-fix is the real
   cure. NA: none here; optionally archive_reason=off_domain on those two items (currently
   hidden_reason=rc9-style).
2. **SUP-2 (CO):** ss3 "EPA 2009 Endangerment Finding" supersession points at g8 EPA SmartWay with
   severity=minor and a note describing removal of the legal basis for ALL vehicle GHG regulation —
   new_item is a weak stand-in and severity understates the note. NA: operator review of that one chain.

## 15. item_changelog (9) — full dump taken

All 9 rows change_date=2026-03-01, change_type=UPDATED, impact_level=MODERATE, detected_by NULL on all.
Rows: o1 IMO GHG Strategy ×3 (Key data/Priority/Timeline), o4 CII ×3, t1 EU CBAM ×3.

1. **CHG-1 (data-quality, BD candidate): content mismatch inside the CII rows** — o4 (Carbon Intensity
   Indicator) carries "All packaging recyclable by 2030…" and "Regulation published in Official Journal"
   diffs that are PPWR-shaped, not CII-shaped. The batch looks like seeded/demo changelog data written
   under one date with cross-item content bleed. Customer-facing "what changed" must never show a
   packaging diff on a maritime item. NA: verify origin (single 2026-03-01 writer), purge or regenerate
   the 9 rows; wire detected_by.

## 16. item_disputes (7) — full dump taken

All active (resolved_at NULL, is_active=true), all created 2026-04-05: c1 CSRD Omnibus scope, g2 PPWR
implementation guidance, g33 EUDR delays, l6 EPA Phase 3 survival, l7 CARB waiver, o13 US opposes IMO NZF,
t1 CBAM WTO compatibility.

1. **DSP-1 (data-quality): every `disputing_sources` entry has `"url": ""`** — name-only sources
   (EU Commission, EPA, CARB…) on a surface whose doctrine is checkable citations. NA: populate URLs or
   render explicitly as "institutional position, uncited".
2. **DSP-2 (flag):** disputes are 15 months unresolved-by-design (live disputes); several attach to
   quarantined items (c1 is verified; l6/l7 quarantined) — same RLS-1 exposure class.

## 17. regions (5) — full dump taken

EU(critical, {EU,DE,NL,BE,FR,IT,ES}, order 1) · US(critical, {US,US-CA,US-NY,US-TX}, 2) ·
ASIA(high, {SG,HK,CN,JP,KR}, 3) · UK(high, {GB}, 4) · UAE(moderate, {AE}, 5). code UNIQUE; all created/
updated 2026-05-25.

1. **RGN-1 (DW): operations_decisions = '{}' on all 5 rows** — jsonb column never populated. NA: drop or
   populate when Operations decisions ship.
2. **RGN-2 (CO):** regions.severity uses the per-surface vocab (critical/high/moderate/low) — legal per its
   own CHECK; one more strand of the severity multi-vocab (see ITM-4/VER-2). NA: fold into the
   surface-severity consolidation follow-on.

## 18. published_price_statistics (4) — full dump taken

WTI $73.59/bbl · Brent $73.63/bbl · Jet Fuel USGC $2.788/gal (item crude-oil-jet-fuel-price-intelligence)
· Henry Hub $3.20/MMBtu (lng-natural-gas-price-intelligence). All severity_tone=neutral, source_tier=3,
released_at=2026-06-26, **next_release_at=2026-07-03**.

1. **PPS-1 (BC candidate): stale beyond own promise** — next_release_at was 8 days before audit date with
   no refresh; the customer tile shows June prices and a lapsed "next release" date. NA: refresh cadence
   (cron honoring unit budget) or an is-stale visual state; decide which before Market Intel demo.
2. RLS: authenticated-only read (tighter than the public-read aux tables) — noted, consistent.

## 19. coverage_gaps (2) — full dump taken

CH "Switzerland packaging waste regulation" (high, sectors {packaging,waste}, action "Suggest a source" →
/admin?tab=coverage&suggest=ch-packaging-waste) · US-CA "CA SB 261 climate-related financial risk"
(medium, {finance,climate-disclosure}, "Add to registry" → /admin?tab=coverage&add=ca-sb-261).
Both created 2026-05-10.

1. **CVG-1 (CO):** SB 261 description contains a raw `<i>` HTML tag — renders literally or injects markup
   depending on the component. NA: strip markup; CODE-4 confirm the renderer escapes.
2. **CVG-2 (flag):** 2 rows, 2 months old, severity vocab (high/medium/low) is a third severity dialect.
   NA: fold into severity consolidation; confirm the /admin coverage tab still consumes this table.

---

## Cross-table verdict summary (top items)

| # | Finding | Severity | Next action |
|---|---|---|---|
| 1 | ITM-1: 5 verified-live items, NULL full_brief | breaks-customer | regenerate or re-quarantine; verify render path |
| 2 | PPS-1: price tiles 8 days past next_release promise | breaks-customer | refresh job or stale-state UI |
| 3 | ITM-7/XRF-1: 4 verified-live duplicate clusters stitched as "related" | breaks-customer | RC-9 dedup the 4 clusters |
| 4 | CLM-1: 890 FACTs missing source/tier stamp (search-row-only grounding) | breaks-doctrine | resolver backfill migration or documented allowance |
| 5 | RDF-1: all 75 regional facts have no source FK, low-tier note citations | breaks-doctrine | register+link publishers or label surface |
| 6 | RLS-1: aux tables (timelines/xrefs/disputes/supersessions/changelog) public-read without parent gate | breaks-doctrine (mild) | parent-gated policies like sections |
| 7 | CHG-1: changelog rows with cross-item content bleed (PPWR diffs on CII) | breaks-doctrine | purge/regenerate 9 rows; wire detected_by |
| 8 | ITM-3: archive_reason 3-way vocab fracture, no CHECK | breaks-doctrine | single vocab + CHECK (metadata-vocab class fix) |
| 9 | ITM-5: 3 future last_regenerated_at stamps | dead-weight/anomaly | fix writer; correct 3 rows |
| 10 | Dead columns: items ×13 (ITM-6), sections.source_ids, versions.created_by_run_id, claims.verified_*, ars.agent_run_id, summaries.urgency_score, regions.operations_decisions, rdc.notes/last_reviewed_at | dead-weight | consumer sweep → drop-or-wire per column |
| 11 | ITM-2: 51 archived-no-reason rows | dead-weight | backfill reasons |
| 12 | DSP-1: dispute sources with empty URLs | dead-weight/data-quality | populate URLs or honest labeling |

Healthy-by-construction confirmations: all FK constraints hold with 0 orphans both directions on every
FK-bearing pair audited; UNIQUE constraints hold everywhere; provenance triggers + fact_count sync trigger
verified against data; verified-live items all have sections and claims; claims cross-FK consistency
(section↔item) is 0-defect; CHECK vocabularies match `src/lib/agent/metadata-vocab.ts` exactly.

## 62-item pool-coverage deliverable

Full 62-row table: [pool-coverage-62.md](pool-coverage-62.md). **45 COVERED · 8 PARTIAL · 9 NOT-COVERED.**
The 9 NOT-COVERED (zero floor rows in the stored pool — paid re-ground cannot clear floor 2 without new
fetches): UAE hydrogen implementation decree, China Environmental Code, China carbon-market extension,
GLEC a7 + c5, SBTi c7, ASEAN g24, GRI c3, GRI cookie-policy portal artifact (156ec17c — archive candidate,
not resynth). Probe artifacts: `fsi-app/scripts/tmp/db1-pool-coverage-62.mjs` + `.json` (read-only,
gitignored scratch).

---

**Manifest check-off: 19/19 tables scanned (counts reconciled against §B — all exact).**

**Tool-call count: 51** (26 execute_sql · 9 Read · 5 Bash · 1 ToolSearch · 4 Write/Edit-class incl. this
register and pool-coverage-62.md · 3 TodoWrite · plus the scratch-script node run counted in Bash).

**Deviation log:**
1. The 62-item deliverable used the authorized scratch script (`fsi-app/scripts/tmp/db1-pool-coverage-62.mjs`,
   node + service-role readClient, SELECTs only) instead of execute_sql — explicitly permitted by the
   dispatch for this deliverable; everything else went through execute_sql.
2. Dump rule applied: <500-row tables fully dumped into audit evidence; bulk text (full_brief, content_md,
   result_content_excerpt, synopsis_prompt, regional fact values) recorded as length + left(…,80) only.
   For the two largest small-table dumps (regional_data_facts 75, item_cross_references 53) the register
   records the complete result sets' content in condensed form + the exact reproduction query rather than
   re-printing every row verbatim.
3. No files modified other than the two NEW register/deliverable files + the NEW gitignored scratch script
   and its JSON output. No writes to the database of any kind.
