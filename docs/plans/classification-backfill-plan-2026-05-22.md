# intelligence_items.domain backfill plan (proposed, not executed)

Date: 2026-05-22
Dispatcher: read-only classification backfill agent (no DB writes; docs commit only)
Tip at dispatch: `a5347c0` (master)

Skills loaded:
- `caros-ledge-platform-intent` (five-surface model; Value Delivery Check obligation)
- `source-credibility-model` (Sections 3, 8: source_role taxonomy + per-surface signal sets)
- `environmental-policy-and-innovation` (format_type derivation from item_type; source category taxonomy)
- `sprint-followups-discipline` (loop closure)

Inputs consumed in full:
1. `docs/plans/ingest-pipeline-investigation-2026-05-22.md` (commit `a5347c0`, dispatch E)
2. `docs/plans/regulations-classification-mismatch-counts-2026-05-22.md` (commit `aac9986`)
3. `fsi-app/.claude/skills/source-credibility-model/SKILL.md`
4. `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` (sections on item_type, format_type derivation, source taxonomy)
5. `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` (five-surface model)
6. `docs/decisions/ADR-001-platform-model.md` (three-layer tenant model; five customer-facing surfaces)

Also consulted:
- `fsi-app/supabase/migrations/084_sources_canonical_category.sql` (the canonical `sources.category` four-value taxonomy already in use for category routing; reused as the disambiguation axis here)
- `fsi-app/src/lib/dashboard/surface-coverage.ts` (the live four-surface routing rule the dashboard uses today, which combines item_type and domain)
- `fsi-app/supabase/migrations/063_sources_classification_axes.sql` (`source_role` 10-value vocabulary)

Scope: READ-ONLY. This dispatch produces a migration file and supporting docs. The operator decides whether to apply.

---

## 1. The corrected routing rule

### Headline

`item_type` plus `sources.category` together determine the correct `domain` for an intelligence_item. Of the 12 item_types in the live data, 8 are unambiguous (single target domain regardless of source); 4 are ambiguous and route by `sources.category` (the four-value canonical taxonomy from migration 084: `regulatory`, `research`, `market_news`, `operational_data`).

The disambiguation axis is `sources.category` rather than `source_role` because category already implements exactly the four-way customer-facing intelligence-surface map the platform uses (per migration 084 and `caros-ledge-platform-intent` Section 3). `source_role` is the more granular axis it derives from; using category collapses ten roles into the four buckets the surface routing actually consumes, which is the right granularity for a domain integer (1-7).

### The integer-to-surface mapping (derived from live application code)

`intelligence_items.domain` is INT 1-7 with CHECK (1..7). The integer values are not codified in a single skill document; the de facto mapping comes from the application code that filters on them. The canonical reference is `fsi-app/src/lib/dashboard/surface-coverage.ts:107-115` (the five-surface dashboard widget classifier):

| domain | surface | code filter |
|---|---|---|
| 1 | Regulations | `d=1 OR item_type IN (regulation, directive, standard, guidance, framework, law)` |
| 2 | Market Intel (Tech sub-tab) | `d=2 OR item_type=technology/innovation` (per `MarketPage.tsx`) |
| 3 | Operations (regional sub-tab) | `d=3 OR item_type=regional_data` (per `OperationsPage.tsx`) |
| 4 | Market Intel (Price/Signals sub-tab) | `d=4 OR item_type=market_signal/initiative` (per `MarketPage.tsx`) |
| 5 | (no surface today) | unreferenced by any surface filter |
| 6 | Operations (facility sub-tab) | `d=6` (per `OperationsPage.tsx`) |
| 7 | (no surface today) | unreferenced by any surface filter |

Surface implications of the integer assignments:
- d=5 and d=6 are not produced by the rule (the rule routes nothing to them). d=5 and d=6 contain only legacy rows that the existing application code partially handles (d=6 -> Operations facility tab) or ignores (d=5).
- d=7 is the only target for `research_finding` per existing data. The dashboard surface-coverage classifier does NOT include d=7 in its Research filter: Research is routed by `item_type=research_finding` alone. So `framework` items moved to d=7 (because their source is a research-category source like UNCTAD or World Bank) become semantically correct in their domain but do NOT surface on /research until application code is updated or the category-aware RPCs (migration 070/084 `get_research_items`) replace the existing fetcher. This is a known gap and a downstream task, NOT in scope for this backfill.

### The rule, per item_type

For each item_type, listed below: the routing rule and a worked example from the live data.

**1. regulation, directive, standard, guidance** (unambiguous)
- Target: `domain=1` (Regulations).
- Rationale: per `environmental-policy-and-innovation` format_type derivation, these emit Regulatory Fact Documents and belong on /regulations.
- Example: `California Advanced Clean Fleets Rule (CARB)` (regulation, currently d=2) -> d=1.

**2. framework** (mostly unambiguous; routes by source.category when source signals non-regulatory)
- Default target: `domain=1` (Regulations). A "framework" is usually a statutory or standards-defining framework (UNECE WP.6, EU PPWR-type instruments).
- Exception 1: `sources.category = 'research'` -> `domain=7` (research). Frameworks emitted by intergovernmental research bodies (World Bank, OECD, UNCTAD, UN DESA, ECLAC) are horizon-scanning analytical frameworks, not statutory.
- Exception 2: `sources.category = 'market_news'` -> `domain=4` (market intel). Frameworks emitted by industry associations or trade press (CLECAT strategic priorities) are sector positioning frameworks.
- Exception 3: `sources.category = 'operational_data'` -> `domain=3` (operations). Frameworks emitted by statistical/operational-data agencies (rare).
- Example: `World Bank Carbon Pricing Dashboard` (framework, currently d=5, source=World Bank, source.category=research) -> d=7.
- Example: `CLECAT Strategic Priorities 2024-2029` (framework, currently d=1, source=CLECAT, source.category=market_news) -> d=4.

**3. research_finding** (unambiguous)
- Target: `domain=7` (the existing convention from the pre-Wave-1b corpus, which already used d=7 for OECD/IRENA research_finding rows).
- Rationale: maps to Research Summary format per env-policy skill.
- Example: `OECD Environmental Finance Publication` (research_finding, currently d=1) -> d=7.

**4. regional_data** (unambiguous)
- Target: `domain=3` (Operations regional sub-tab).
- Rationale: maps to Operations Profile format. Pre-Wave-1b convention already used d=3 for regional_data.
- Example: `City of Los Angeles Departments & Bureaus Directory` (regional_data, currently d=1) -> d=3.

**5. market_signal** (unambiguous)
- Target: `domain=4` (Market Intel price/signals sub-tab).
- Rationale: maps to Market Signal Brief format. Pre-Wave-1b convention already used d=4 for market_signal.
- Example: `Environmental Finance Market Update: Sustainable Debt, Nature Capital...` (market_signal, currently d=1) -> d=4.

**6. technology, innovation** (unambiguous)
- Target: `domain=2` (Market Intel tech sub-tab).
- Rationale: maps to Technology Profile format. Pre-Wave-1b convention already used d=2 for technology.
- Example: `Singapore Statutes Online` (technology, currently d=1, on a regulatory source) -> d=2. Note: this row's classification as `technology` is the Haiku classifier's call; it is the brief that classifies, not the source.

**7. tool** (mostly unambiguous; routes by source.category for research/operations sources)
- Default target: `domain=2` (Technology Profile -> Market Intel).
- Exception 1: `sources.category = 'research'` -> `domain=7`. Research tools (academic database tools) belong with Research.
- Exception 2: `sources.category = 'operational_data'` -> `domain=3`. Operational data tools (Climate Change Laws database) belong with Operations.
- Example: `EcoVadis: Enterprise Sustainability Intelligence and Ratings Platform` (tool, currently d=1, source=EcoVadis, source.category=market_news) -> d=2.
- Example: `Climate Change Laws of the World Database` (tool, currently d=1, source.category=operational_data) -> d=3.

**8. initiative** (fully ambiguous; routes by source.category)
- The hardest case. 98% of `initiative` rows are currently in d=1 because of the hardcoded-domain bug. Initiatives can be government-driven (Drive Electric -> regulatory), industry-coalition (H2Accelerate, CLECAT initiatives -> market_news), research (OECD STI Forum -> research), or operational (Lloyd's Register Decarb Hub -> operational_data).
- Rule:
  - `sources.category = 'regulatory'` -> `domain=1`
  - `sources.category = 'research'` -> `domain=7`
  - `sources.category = 'market_news'` -> `domain=4`
  - `sources.category = 'operational_data'` -> `domain=3`
  - `sources.category IS NULL` -> `domain=4` (market intel default, low-confidence; flagged as AMBIGUOUS for operator review)
- Example: `Getting to Zero Coalition` (initiative, currently d=1, source=UNFCCC, source.category=market_news) -> d=4.
- Example: `Drive Electric: Zero-Emission Freight` (initiative, currently d=2, source=Federal Highway Administration, source.category=regulatory) -> d=1.
- Example: `9th Multi-Stakeholder Forum on STI for the SDGs` (initiative, currently d=1, source=UN DESA, source.category=research) -> d=7.

**9. law** (no live rows; rule covers it for safety)
- Target: `domain=1` (Regulations). Same as regulation/directive.
- Note: not currently in the CHECK constraint vocabulary for `item_type`; included in the SQL CASE as a safety branch.

### Cross-references to skills (no conflicts)

The rule is consistent with `environmental-policy-and-innovation` section "format_type derivation from item_type" (lines 781-787 of SKILL.md). The skill's mapping `(regulation|directive|standard|guidance|framework) -> regulatory_fact_document` is the basis for the unambiguous regulatory routing. The skill's `(market_signal|initiative) -> market_signal_brief` mapping is the basis for routing market_signal to d=4; for `initiative` the rule extends the skill mapping by saying "yes, market_signal_brief by default, but if the source is regulatory/research/operational_data, the brief lands on the corresponding surface" because the skill does not prescribe a surface for initiatives whose source is on a different page.

The rule is consistent with `source-credibility-model` Section 3 (the source type tier hierarchy) and Section 8 (per-surface credibility signal sets). Section 8 enumerates the per-surface signals (Regulations: tier+jurisdiction+binding status; Research: tier+bias+citation count+recency; etc.) but does not prescribe which item_type lives on which surface; that comes from the env-policy skill format_type derivation. So no conflict.

The rule is consistent with ADR-001-platform-model.md (five customer-facing surfaces, three-layer tenant architecture). The backfill does not move any row to a non-existent surface; d=7 (research) and d=2/4 (market intel) and d=3 (operations) all map to declared surfaces. d=5 and d=6 receive no new rows; the rule does not need them.

NO conflicts surfaced. The disambiguation rule uses `sources.category` (set per migration 084 from `source_role`), which is the same axis the platform's own category-aware RPCs already use to route content to the four intelligence pages.

---

## 2. Full backfill scope

Snapshot at investigation 2026-05-22:
- Total non-archived items: 646
- Total moves: **212** (33% of corpus)
- Rows unchanged: 434
- Ambiguous after rule: **7** (all `initiative` items where the source has no `sources.category` set)

### Reconciliation with prior counts

| Source | Count | Note |
|---|---|---|
| Dispatch E (2026-05-22) | 193 leaking INTO /regulations + 5 leaking OUT | Conservative; only counted obvious mis-routings |
| Mismatch-counts doc (2026-05-22) | 120 conservative + flagged ~73 more | Conservative heuristic; explicitly flagged framework/regional_data/tool as undercount |
| This dispatch | **212 total moves** | Granular rule with source.category disambiguation |

The 212 figure exceeds E's 193 because:
- 193 was the "INTO /regulations" leak count alone
- This dispatch also moves the 5 reg-typed rows in d∈{2,5,6} back to d=1
- This dispatch additionally moves rows already in d∈{2,3,4,5,6,7} when those domain assignments disagree with the rule (e.g., the 1 `initiative` in d=2 moves to d=4 or d=1 depending on source.category)
- The conservative count of 120 from the mismatch doc covered only `market_signal/initiative/research_finding/technology` in d=1. This rule adds `regional_data` (54 leaks), `framework` (where source.category disagrees, 22 framework moves), `tool` (25 tool moves; the doc flagged 19 d=1 tools but didn't have the source.category axis to route them), and the cross-domain cleanups.

### Per-destination distribution

| Transition | Count |
|---|---|
| 1 -> 2 | 15 |
| 1 -> 3 | 65 |
| 1 -> 4 | 68 |
| 1 -> 7 | 49 |
| 2 -> 1 | 2 |
| 2 -> 3 | 1 |
| 5 -> 1 | 1 |
| 5 -> 2 | 2 |
| 5 -> 7 | 5 |
| 6 -> 1 | 1 |
| 6 -> 3 | 2 |
| 6 -> 7 | 1 |
| **Total** | **212** |

### Per-domain counts before and after

| domain | before | after | delta |
|---|---|---|---|
| 1 (Regulations) | 588 | 395 | -193 |
| 2 (Market Intel: Tech) | 10 | 24 | +14 |
| 3 (Operations: Regional) | 10 | 78 | +68 |
| 4 (Market Intel: Signals) | 16 | 84 | +68 |
| 5 (none) | 8 | 0 | -8 |
| 6 (Operations: Facility) | 4 | 0 | -4 |
| 7 (Research) | 10 | 65 | +55 |
| **Total** | 646 | 646 | 0 |

### Per-item_type moves

| item_type | total | unchanged | moved | dest distribution | ambiguous |
|---|---|---|---|---|---|
| regulation | 150 | 148 | 2 | d=1 (both back from d=2 and d=5) | 0 |
| directive | 19 | 19 | 0 | n/a | 0 |
| standard | 11 | 10 | 1 | d=1 (from d=6) | 0 |
| guidance | 92 | 92 | 0 | n/a | 0 |
| framework | 128 | 106 | 22 | d=3 (2), d=4 (6), d=7 (14) | 0 |
| research_finding | 35 | 10 | 25 | d=7 (25) | 0 |
| regional_data | 66 | 10 | 56 | d=3 (56) | 0 |
| market_signal | 56 | 16 | 40 | d=4 (40) | 0 |
| technology | 11 | 6 | 5 | d=2 (5) | 0 |
| innovation | 1 | 1 | 0 | n/a | 0 |
| tool | 25 | 0 | 25 | d=2 (12), d=3 (4), d=7 (9) | 0 |
| initiative | 52 | 16 | 36 | d=1 (1), d=3 (6), d=4 (22), d=7 (7) | 7 |

### Surface-level customer-facing impact

Per the existing dashboard surface-coverage classifier (`fsi-app/src/lib/dashboard/surface-coverage.ts`):

| Surface | Before (estimate) | After (estimate) | Delta |
|---|---|---|---|
| Regulations (d=1 OR reg item_types) | ~593 (588 d=1 + 5 reg-typed in other d) | ~400 (395 d=1 + 5 reg-typed) | -193 |
| Market Intel (d∈{2,4} OR market types) | ~83 (16 d=4 + 10 d=2 + ~57 market types in d=1) | ~135 (84 d=4 + 24 d=2 + remaining market types) | +52 net (different rows now visible) |
| Operations (d∈{3,6} OR regional_data) | ~64 (10 d=3 + 4 d=6 + 50 regional_data in other d) | ~78 (78 d=3 + 0 d=6) | +14 net |
| Research (item_type=research_finding) | 35 | 35 | 0 (Research routing is item_type-only; backfill changes domain but NOT what /research surfaces) |

Note on Research: the dashboard surface-coverage classifier filters Research by `item_type=research_finding` only (see line 113 of surface-coverage.ts). The 14 `framework`+`research_source` rows + 7 `initiative`+`research_source` rows that get routed to d=7 by this backfill become semantically correct in domain but DO NOT surface on /research until either:
- (a) the application code is updated to include `domain=7` in the Research filter, or
- (b) REC-OBS-G (the category-aware RPCs at migration 070/084) is wired in (then `get_research_items` would surface them by `sources.category='research'`).

This is a real surface-routing limitation of the tactical backfill. The domain backfill alone fixes /regulations completely (the headline 33% leak goes to 0). It improves /market and /operations partially (the routed rows surface there because their existing code includes d=4/d=2/d=3 in the filter). It does NOT yet fix /research because Research has no domain-based fallback. REC-OBS-G remediation (Sprint 2+, per `caros-ledge-platform-intent` Customer-Facing Value Gap section) closes this.

---

## 3. The migration

File: `fsi-app/supabase/migrations/101_intelligence_items_domain_backfill.sql`

Approach:
- Single transaction (BEGIN/COMMIT).
- Step 1: snapshot pre-state into `intelligence_items_domain_backfill_audit`. The audit table records id, old_domain, proposed_domain, item_type, source_id, source_category, source_role, source_name, rule_branch, certainty, captured_at. Only rows where the rule produces a DIFFERENT domain are snapshotted; the audit table IS the move set.
- Step 2: UPDATE intelligence_items.domain from the audit table. Joins on id; defensive `AND ii.domain = a.old_domain` clause skips rows that may have been modified between snapshot and update (concurrency safety).
- Step 3: DO block raises EXCEPTION if any audited row's post-update domain disagrees with proposed_domain. This forces transaction rollback on any integrity violation.
- Reversibility: explicit REVERSE block in commented SQL at the bottom. Restores old_domain from audit table; idempotent. Audit table is intentionally preserved (not dropped on reverse) so the change history remains queryable.
- Verification queries (V1-V5) are appended as commented SQL the operator runs separately AFTER the migration commits.

Why a single migration (not staged):
- The rule is deterministic per (item_type, source.category) pair; no per-row operator judgment needed for the 205 non-ambiguous moves.
- 7 ambiguous rows are out-of-band (operator reviews `docs/plans/classification-backfill-ambiguous-2026-05-22.md` and can apply a follow-up per-row UPDATE if their decision differs from the default).
- Atomicity is the safety mechanism: if the integrity check fails, the entire txn rolls back and no rows change.

What the migration does NOT do (explicit out-of-scope, per dispatch constraints):
- Does NOT modify any ingest code (the three `domain: 1` hardcoded sites at drain-first-fetch/community-promote/admin-scan remain). New items will continue to be inserted as d=1 until that fix lands (dispatch F or later).
- Does NOT modify any application code (/regulations, /market, /operations, /research, dashboard surface-coverage filters all unchanged).
- Does NOT change the `domain` CHECK constraint (still 1..7).
- Does NOT add `domain` to the Haiku classifier output.
- Does NOT drop the `domain` column (that's REC-OBS-G, Sprint 2+).
- Does NOT touch any other table (sources, staged_updates, pending_first_fetch, etc.).

---

## 4. Post-backfill verification queries

All embedded in the migration file as commented SQL at the bottom; reproduced here for visibility:

- (V1) Per-domain count check vs expected post-state (395/24/78/84/65 across d=1/2/3/4/7).
- (V2) Per-(item_type, domain) cross-tab; should show no leak cells.
- (V3) Audit-table roll-up by rule_branch and certainty; lets the operator see what fired.
- (V4) Per-destination-domain 5-row sample joined with source name + role + category for human spot-check.
- (V5) Ambiguous rows list (7 rows on 2026-05-22 snapshot).

Operator runs these manually after committing the migration's BEGIN/COMMIT block.

---

## 5. The ambiguous bucket

7 rows require per-item operator decision. All are `item_type='initiative'` where the source's `category` is NULL in the sources registry. The default rule routes them to d=4 (market intel) as the most common "industry coalition / consortium initiative" pattern, but the operator may choose differently per row.

See `docs/plans/classification-backfill-ambiguous-2026-05-22.md` for the full table.

The ambiguity ALSO surfaces a sources-registry gap: 7 sources lack `sources.category` (and likely also `source_role`). Closing that gap permanently (operator classifies the 7 sources) automatically resolves the ambiguity AND prevents the next backfill from re-encountering it. That source-registry classification is out of scope for this dispatch but worth flagging as a parallel cleanup.

---

## Value Delivery Check

=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery.

This is a docs-only planning dispatch. The deliverable is a proposed migration file + supporting docs. No customer-facing surface (Regulations, Market Intel, Research, Operations, Community, Map, Intelligence Assistant, Onboarding) changes as a result of this dispatch. The CUSTOMER-FACING impact arrives only after the operator approves and the migration is executed.

If the operator approves the migration, the resulting impact on customer-facing value delivery is:
- Regulations (large positive): 193 mis-classified items leave the /regulations surface. The "regulations tracked" headline drops by 33%, but the surface stops mis-rendering market signals, regional operations data, research findings, and technology profiles as regulations.
- Market Intel (moderate positive): ~62 items become visible on /market (40 market_signal + 22 framework/initiative routed to d=4 + technology/tool rows in d=2). Subject to /market page's existing fetcher logic correctly picking up domain=2 and domain=4 (per `MarketPage.tsx` it does).
- Operations (moderate positive): ~70 items become visible on /operations (56 regional_data + 14 other routed to d=3). Subject to /operations page filter (per `OperationsPage.tsx` it includes domain=3 and 6).
- Research (no change): Research is item_type-routed (research_finding only); 35 research_finding items remain visible. The 21 framework/initiative items routed to d=7 do NOT surface on /research until REC-OBS-G remediation (Sprint 2+).
- Community, Map, Assistant, Onboarding: not affected by this work.

Dual-posture: the routing rule applies equally to current operational scope (art logistics, live events, etc.) and to expansion-time freight forwarders. The four-category source taxonomy (regulatory, research, market_news, operational_data) is sector-agnostic and serves both cohorts.

---

## OBS coverage

Per `sprint-followups-discipline`, this is an investigation-and-planning dispatch with one docs deliverable + one unapplied migration. It captures findings that future dispatches may want to formalize:

| OBS candidate | What | Where |
|---|---|---|
| Domain backfill applied | Migration 101 executed (post-approval) | This plan + migration 101 |
| Sources missing category | 7 sources lack `sources.category` (cause of all 7 ambiguous rows) | `classification-backfill-ambiguous-2026-05-22.md` |
| Research not domain-routed | Surface-coverage classifier filters /research by item_type only; 21 framework/initiative items routed to d=7 stay invisible until REC-OBS-G | This plan, section 2 |
| Ingest hardcode persists | The three `domain: 1` hardcodes remain; backfill closes the gap once but new items will re-leak until ingest code fix | Dispatch E, items A/B options |

The investigation does not owe loop closure per the skill's explicit exclusion. These are surfaced for the operator to choose whether to formalize as OBS entries in the current sprint's followups doc.

---

## DP compliance (not applicable)

Per `sprint-followups-discipline`, this docs-and-unapplied-migration dispatch produces no design surface. Each DP entry in `docs/design-principles.md` is not applicable to this work product.

---

## Files

- `docs/plans/classification-backfill-plan-2026-05-22.md` (this document)
- `fsi-app/supabase/migrations/101_intelligence_items_domain_backfill.sql` (the proposed unapplied migration)
- `docs/plans/classification-backfill-ambiguous-2026-05-22.md` (the 7-row per-item review list)
- `docs/inventories/migrations.md` (updated to include migration 101 per C3 consistency check)

## Related

- [[ingest-pipeline-investigation-2026-05-22]] — Consumes Dispatch E's report as primary input; reconciles its 193-leak count against this plan's 212 moves
- [[ingest-restart-sequencing-2026-05-22]] — That doc locks migration 101 as step b (DONE 2026-05-23) in the leakage-fix-before-restart sequence
- [[classification-backfill-ambiguous-2026-05-22]] — Explicit companion; this doc holds the 7 ambiguous rows that plan routes to the default d=4
- [[regulations-classification-mismatch-counts-2026-05-22]] — Consumes the mismatch-counts doc; reconciles its conservative 120 against the granular 212
- [[source-classification-framework-2026-05-10]] — Uses migration 084 sources.category which derives from the framework's source_role axis
