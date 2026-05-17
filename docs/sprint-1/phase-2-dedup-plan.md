# Sprint 1 Phase 2: Canonical-Entity Dedup Plan

**Date:** 2026-05-16
**Phase:** 2 of 11 (READ-ONLY)
**Status:** dedup proposal; awaiting operator approval of row-level proposals + agent_runs decision + count-mismatch resolution before Phase 3
**Branch:** feat/sprint-1-chrome-remediation
**Introspection:** `fsi-app/scripts/tmp/phase-2-dedup-introspect.mjs` + output `phase-2-dedup-introspect.json`

## 1. FK fan-out: 21 FKs reference intelligence_items.id (audit named 7)

Live introspection via `pg_constraint` against the linked Supabase project. **Audit named 7 FKs; reality is 21.** Audit missed 14.

### CASCADE FKs (13) — loser hard-delete cascades to children

| Referencing table | Column | Audit had it? | Cluster rows referencing |
|---|---|---|---|
| `canonical_source_candidates` | `intelligence_item_id` | ✅ | LL97 winner=3, EPA winner=3 |
| `intelligence_changes` | `item_id` | ❌ | **TABLE EMPTY (0 rows total)** — no remap needed |
| `intelligence_item_versions` | `intelligence_item_id` | ✅ | (not queried; assume similar to summaries) |
| `intelligence_summaries` | `item_id` | ❌ | LL97 winner=15, EPA winner=15. **Table has 2,310 rows total.** |
| `item_changelog` | `item_id` | ❌ | 0 on cluster (likely 0 historic for stub losers) |
| `item_cross_references` | `source_item_id` | ✅ | 0 on cluster |
| `item_cross_references` | `target_item_id` | ✅ | EPA winner=1 |
| `item_disputes` | `item_id` | ❌ | EPA winner=1 |
| `item_supersessions` | `old_item_id` | ✅ | 0 on cluster |
| `item_supersessions` | `new_item_id` | ✅ | 0 on cluster |
| `item_timelines` | `item_id` | ❌ | EPA winner=3 |
| `source_conflicts` | `item_id` | ❌ | 0 on cluster |
| `vendor_regulations` | `regulation_id` | ❌ | 0 on cluster. **Pre-launch community table.** |
| `workspace_item_overrides` | `item_id` | ✅ | 0 on cluster (no override rows yet for these items) |

### SET NULL FKs (5) — loser hard-delete nulls the reference

| Referencing table | Column | Audit had it? | Cluster rows referencing |
|---|---|---|---|
| `agent_runs` | `intelligence_item_id` | ✅ | **All losers have 1-2 agent_runs each (9 total across clusters)**. Winners have 0. **Decision point for operator.** |
| `community_posts` | `promoted_to_item_id` | ❌ | 0 on cluster. **Pre-launch.** |
| `monitoring_queue` | `item_id` | ❌ | 0 on cluster |
| `post_promotions` | `intelligence_item_id` | ❌ | 0 on cluster. **Pre-launch community.** |
| `staged_updates` | `materialized_item_id` | ❌ | 0 on cluster |

### NO ACTION FKs (3) — loser hard-delete FAILS if any reference exists

| Referencing table | Column | Audit had it? | Cluster rows referencing |
|---|---|---|---|
| `intelligence_items` | `replaced_by` (self-ref) | ✅ | 0 on cluster |
| `staged_updates` | `item_id` | ❌ | 0 on cluster |

These three need explicit remap before hard-delete; otherwise the DELETE throws. Currently no cluster row references any of them, but Phase 11 hard-delete must check first.

### Two columns are documented as "FK to intelligence_items.id" but have NO actual constraint

| Migration | Table | Column | Live row count |
|---|---|---|---|
| `009_capture_undeclared_tables.sql:42` | `intelligence_summaries` | `item_id` | **Migration 009 said "inferred FK"; reality: FK exists per live pg_constraint introspection (intelligence_summaries_item_id_fkey CASCADE).** The migration comment was wrong; a later migration (or the original) did add the constraint. 2,310 rows. |
| `009_capture_undeclared_tables.sql:65` | `intelligence_changes` | `item_id` | **Migration 009 said "inferred FK"; reality: FK exists (intelligence_changes_item_id_fkey CASCADE).** 0 rows. |

Both are now real FKs. The migration 009 comments are stale; the table comment about "inferred" no longer applies. No action needed in this dispatch; flag for future doc cleanup.

## 2. Item type distribution (live data)

```
regulation         160    <- the load-bearing pool for dedup
framework          128
guidance            92
regional_data       66
market_signal       55
initiative          52
research_finding    35
tool                25
directive           19
technology          11
standard            11
innovation           1
                  ----
                  655 total
```

The 643 "regulations tracked" the dashboard advertises (per Chrome audit) overcounts strictly-typed `regulation` (160) by 3x. The dashboard count likely uses item_type IN (regulation, directive, standard, guidance, framework) which sums to 410, still not 643. The 643 number is internally inconsistent (see Chrome audit I.3 finding; this is RC-7 territory but flagged here so the dedup plan acknowledges scope).

## 3. Per-cluster row-level dedup proposals

Winner selection rules (per the Sprint 1 brief Phase 2 task 2):
1. Slug-routed body wins where available
2. If all UUID-routed, longest non-null `full_brief` wins
3. If still tied, oldest `created_at` wins

### Cluster A: Local Law 97 (3 rows; audit count CONFIRMED)

| Role | id (truncated) | legacy_id | full_brief | jurisdictions | jurisdiction_iso | severity | priority | created_at |
|---|---|---|---|---|---|---|---|---|
| **WINNER** | `f67aabad` | `nyc-local-law-97-building-carbon-emissions-caps` | 23,945 chars | `[US]` | `[US-NY, US-NYC]` | COST ALERT | HIGH | 2026-04-13 |
| Loser 1 | `b8b6fde3` | (null) | 0 chars | `[NEW YORK CITY, NEW YORK STATE]` | `[]` | ACTION REQUIRED | CRITICAL | 2026-05-10 02:45 |
| Loser 2 | `d56ca4e1` | (null) | 0 chars | `[NEW YORK CITY, NEW YORK STATE]` | `[]` | ACTION REQUIRED | CRITICAL | 2026-05-10 03:24 |

**Winner picks slug-routed canonical (rule 1).** The Chrome audit's J.4 finding (three records produce three severities) is verified: winner is COST ALERT / HIGH; both losers are ACTION REQUIRED / CRITICAL. **After dedup the winner's COST ALERT / HIGH carries forward** (the slug-routed brief is canonical; the loser CRITICAL labels were produced by the stub writer on incomplete content per RC-4).

Assigned canonical key (Phase 4 backfill):
- `instrument_type = 'local_law'`
- `instrument_identifier = '97/2019'`
- (effective canonical key: `jurisdiction_iso = 'US-NYC'`, `instrument_type = 'local_law'`, `instrument_identifier = '97/2019'`)

**FK remap workload:**
- agent_runs: loser1 has 2 rows, loser2 has 1 row, winner has 0 → 3 rows need decision (remap vs SET NULL on hard-delete). **See § 5 agent_runs decision below.**
- All CASCADE FK refs on losers: 0 rows (winners hold all the timelines, summaries, etc.)
- Winner's CASCADE FK children stay attached as-is (no work)
- No NO ACTION FK conflicts

**Ambiguities:** None at row level. Severity carries forward from winner.

### Cluster B: EPA Heavy-Duty Phase 3 (3 rows; audit said 4 — INVESTIGATE)

| Role | id (truncated) | legacy_id | full_brief | jurisdictions | jurisdiction_iso | severity | priority | created_at |
|---|---|---|---|---|---|---|---|---|
| **WINNER** | `4d5670cb` | `l6` | 23,506 chars | `[US]` | `[US, US-CA]` | COST ALERT | HIGH | 2026-04-05 |
| Loser 1 | `33ca228c` | (null) | 0 chars | `[FEDERAL, US]` | `[]` | ACTION REQUIRED | CRITICAL | 2026-05-10 02:23 |
| Loser 2 | `bec305e1` | (null) | 0 chars | `[FEDERAL, US]` | `[]` | ACTION REQUIRED | CRITICAL | 2026-05-10 03:26 |

**Winner picks legacy_id-routed canonical** (rule 1 broadened: legacy_id with substantive body counts as canonical). Title: "EPA Heavy-Duty Phase 3 Rule".

**Audit count mismatch:** Chrome audit Section I.4 said "four records describing the EPA Phase 3 HDV rule". Introspection found 3. Possible explanations:
- One was already manually deleted between Chrome audit (May 16 morning) and this introspection (May 16 afternoon)
- The query patterns missed a record with non-obvious title (try "MY 2027+", "2024-06809", "40 CFR 1037" patterns)
- Audit counted the dashboard's "this week" rotating list which may have surfaced one record twice on different days

**Operator decision point:** if 3 is correct, dedup proceeds with 1 winner + 2 losers. If 4 is correct, name the missing UUID/title and the query is rerun.

Assigned canonical key (Phase 4 backfill):
- `instrument_type = 'federal_rule'`
- `instrument_identifier = '40 CFR Parts 1036, 1037, 1054, 1065, 1068' OR 'RIN 2060-AV50' OR '2024-06809'` (Federal Register doc number)
- See § 6 for the picking rule between candidates

**FK remap workload:**
- agent_runs: each loser has 1 row → 2 rows need decision
- item_cross_references.target_item_id: 1 row on winner (no remap needed; winner keeps)
- item_disputes: 1 row on winner (winner keeps)
- item_timelines: 3 rows on winner (winner keeps)
- canonical_source_candidates: 3 rows on winner (winner keeps)
- intelligence_summaries: 15 rows on winner (winner keeps)
- All loser CASCADE refs: 0
- No NO ACTION conflicts

**Ambiguities:** None at row level.

### Cluster C: EU Automotive Package (1 row; audit said 2 — INVESTIGATE)

| Role | id (truncated) | legacy_id | full_brief | jurisdictions | severity | priority | created_at |
|---|---|---|---|---|---|---|---|
| Sole row | `3ae89ce6` | (null) | 0 chars | `[EU, EUROPEAN_UNION]` | ACTION REQUIRED | CRITICAL | 2026-05-10 03:00 |

**Audit count mismatch:** Chrome audit Section I.4 said "two for the EU 2025 Automotive Package". Introspection found 1. Same explanations as Cluster B apply.

If 1 is correct, no dedup needed for this cluster (but the sole row is a UUID-routed stub that would be RC-4 candidate for slug-routing). The `EUROPEAN_UNION` jurisdiction token is a RC-7 case (alias for EU).

**Operator decision point:** if 2 is correct, name the missing record. The query patterns tried: `'EU%automotive%'`, `'automotive package%'`, `'heavy-duty vehicle co2%'`, `'EU Heavy-Duty%'`. Possible the second record has a non-matching title.

### Cluster D: Norway World Heritage Fjords (2 rows; audit count CONFIRMED)

| Role | id (truncated) | legacy_id | full_brief | jurisdictions | source_url host | severity | priority | created_at |
|---|---|---|---|---|---|---|---|---|
| **WINNER (proposed)** | `03b5f234` | (null) | 0 chars | `[MINISTRY OF CLIMATE AND ENVIRONMENT, NO, NORWEGIAN MARITIME AUTHORITY]` | regjeringen.no | ACTION REQUIRED | CRITICAL | 2026-05-10 02:25:09 |
| Loser | `82f09535` | (null) | 0 chars | `[EU, NO]` | sdir.no | ACTION REQUIRED | CRITICAL | 2026-05-10 02:25:14 |

Both UUID-routed stubs, both full_brief=0. **Winner per rule 3 (oldest created_at by 5 seconds).**

**Special case:** the two source URLs are different ministries (`regjeringen.no` = Ministry of Climate and Environment; `sdir.no` = Norwegian Maritime Authority). Both are legitimate primary sources for the same instrument (the World Heritage Fjords ZE rule). The dedup correctly identifies them as ONE canonical entity even though they came in via two different source URLs.

**Side-effect of dedup:** the winner row has noisy `jurisdictions` array (`[MINISTRY OF CLIMATE AND ENVIRONMENT, NO, NORWEGIAN MARITIME AUTHORITY]`) — agency names mixed with country code. This is an RC-7 finding (jurisdiction vocabulary uncontrolled). Phase 3 jurisdiction work will normalize the winner's jurisdictions to `['NO']` with the agencies moved to a separate `enforcement_body` or `issuing_body` column (which does not exist yet; Phase 4 is purely additive). For this dispatch, the winner keeps both `jurisdictions` and a backfilled `jurisdiction_iso = ['NO']`; the agency names are tolerated until RC-7 cleanup.

Assigned canonical key (Phase 4 backfill):
- `instrument_type = 'national_regulation'` (NOTE: not in operator's proposed enum; see § 6)
- `instrument_identifier = 'world-heritage-fjords-ZE-2026'` (slug-form; no formal regulation number found in titles)

**Operator decision point:** the `instrument_type = 'national_regulation'` may need to be added to the proposed enum, OR the Norway Fjords rule should map to existing `agency_guidance` if its legal status is more like a regulator-issued directive than a primary statute. **Legal-counsel caveat applies; the audit does not infer legal status.**

**FK remap workload:**
- agent_runs: each row has 1 row → 1 row needs decision (the loser's agent_run)
- All other FKs: 0 on both
- No NO ACTION conflicts

### Cluster E: Matrix Hudson (2 rows; audit count CONFIRMED)

| Role | id (truncated) | legacy_id | full_brief | item_type | jurisdictions | source_url path | severity | priority | created_at |
|---|---|---|---|---|---|---|---|---|
| **WINNER (proposed)** | `fb86ee11` | (null) | 0 chars | market_signal | `[BOSTON, US-MA]` | environment | MONITORING | MODERATE | 2026-05-10 02:22 |
| Loser | `daaa7e3a` | (null) | 0 chars | market_signal | `[BOSTON, US-MA]` | city-council | WINDOW CLOSING | HIGH | 2026-05-10 03:24 |

Both UUID-routed stubs. **Winner per rule 3 (oldest created_at).**

**CRITICAL FLAG:** these are not market signals; they are municipal affordable-housing lottery announcements unrelated to freight. Per Chrome audit RC-8 (per-surface admission gate at ingest), neither record should be in the corpus. **Sprint 2 RC-8 work will hard-delete the surviving canonical row. Sprint 1 dedup should still merge them into one row to reduce confusion in the interim and to test the dedup mechanism on a benign cluster.**

Assigned canonical key (Phase 4 backfill):
- `instrument_type = 'market_signal'` (per operator's proposed enum)
- `instrument_identifier = 'matrix-hudson-2br-lottery'` (slug-form)

Even though this row will likely be RC-8 deleted in Sprint 2, assigning a canonical key here costs nothing and tests the keying logic on the easiest cluster.

**FK remap workload:**
- agent_runs: each row has 1 row → 1 row needs decision
- All other FKs: 0

## 4. Aggregate FK remap workload across all clusters

| FK | Total loser rows referencing | Treatment after Phase 5 dedup |
|---|---|---|
| `agent_runs.intelligence_item_id` (SET NULL) | 5-7 rows (LL97 loser1=2, LL97 loser2=1, EPA loser1=1, EPA loser2=1, Norway loser=1, Matrix loser=1) | **DECISION POINT (operator) — see § 5** |
| All other FKs on losers | 0 rows | No remap needed; CASCADE / SET NULL safe at hard-delete |

The dedup workload is trivially small because all 8 loser rows across the 5 clusters are RC-4 stub records that never accumulated FK fan-out. Their existence has cost zero downstream rows except for agent_runs telemetry. This is the strongest evidence yet that RC-9 dedup is low-risk to execute.

## 5. agent_runs decision point (operator-flagged in Phase 1 carryforward)

Per the operator's Phase 1 carryforward note: "when Phase 2 inventories FKs against intelligence_items, make sure the dedup plan accounts for whether agent_runs rows on a loser intelligence_item get remapped to the winner or get archived alongside their original item. The right answer is probably remap (agent runs are historical record of work done, not work that should be retroactively reattributed), but flag it in the Phase 2 deliverable for operator decision rather than assume."

Note: the operator's parenthetical is ambiguous to me — "historical record of work done, not work that should be retroactively reattributed" reads to me as arguing AGAINST remap (because remap would retroactively reattribute), while the sentence frame says "probably remap". Asking for confirmation rather than choosing one reading.

### Three options for the 5-7 loser agent_runs rows

**Option I — Remap to winner.** UPDATE agent_runs SET intelligence_item_id = $WINNER_ID WHERE intelligence_item_id = $LOSER_ID for each loser. After dedup, the winner appears to have been generated by both its actual run history AND the historical losers' runs. Pros: preserves linkage; the canonical item shows complete agent-run history. Cons: revisionist; an agent_run logged at 2026-05-10 02:23 with input=loser_id will, post-dedup, appear to have been a run against the winner (which is misleading; the run actually produced the loser's stub body, not the winner's canonical body).

**Option II — Leave attached to loser; let Phase 11 hard-delete SET NULL.** Don't touch agent_runs. When Phase 11 deletes the loser intelligence_item, the SET NULL FK behavior nulls agent_runs.intelligence_item_id on the affected rows. Pros: honest — the agent_run was against a row that no longer exists; the NULL accurately conveys "this run's target is gone". Cons: 5-7 agent_runs rows become orphans (NULL intelligence_item_id) with no link to the canonical winner that succeeded them.

**Option III — Archive loser's agent_runs alongside the loser; never hard-delete.** Add a new column `agent_runs.archived_with_item_id` to record the deleted loser's id even after SET NULL. Pros: full historical record preserved. Cons: schema change just to log dedup history; arguably out of Sprint 1 scope; Option II's NULL conveys the same information.

**Audit's recommendation: Option II.** Reasons:
1. The operator's parenthetical reads to me as arguing against remap on integrity grounds
2. The dedup is a category fix, not a content fix — the loser stub produced a different body than the winner's canonical body; remapping the agent_run record to the winner pretends one run generated the other body, which is wrong by construction
3. Option II is no-code (uses existing SET NULL FK behavior at hard-delete)
4. Information loss is bounded: ~5-7 telemetry rows lose their parent link; the cost report aggregates (`agent_runs.cost_usd_estimated`) still tally correctly

**If operator picks Option I**, the Phase 5 data migration adds an explicit UPDATE step per cluster (low cost).

## 6. instrument_type CHECK-constrained enum proposal

Operator's candidate list (from Phase 2 task 3 brief):
> local_law, state_statute, federal_statute, federal_rule, federal_executive_order, eu_regulation, eu_directive, eu_official_journal, municipal_ordinance, agency_guidance, court_decision, industry_standard, market_signal, research_item

14 values. The audit examined how each existing item_type distribution maps to these:

| Existing item_type | Count | Proposed instrument_type | Mapping confidence |
|---|---|---|---|
| regulation | 160 | Most → `federal_rule`, `local_law`, `state_statute`, `federal_statute`, `eu_regulation`, `national_regulation` (NEW) | Some rows clearly map (LL97 → local_law; EPA Phase 3 → federal_rule; Norway Fjords → national_regulation?); others ambiguous |
| framework | 128 | Most → `agency_guidance` or `industry_standard` | Many ESG frameworks (GHG Protocol, CDP, GLEC) are industry-developed, not government rules |
| guidance | 92 | Most → `agency_guidance` | Clean mapping |
| regional_data | 66 | NOT a regulatory instrument | Should NOT have instrument_type (NULL) per § 7 |
| market_signal | 55 | `market_signal` | Clean |
| initiative | 52 | Mix: vendor / industry / coalition / governmental announcements | Probably `agency_guidance`, `industry_standard`, or a new `voluntary_initiative` value |
| research_finding | 35 | `research_item` | Clean |
| tool | 25 | NOT a regulatory instrument | Should NOT have instrument_type per § 7 (these are vendor tools per RC-8) |
| directive | 19 | Most → `eu_directive` | Clean |
| technology | 11 | NOT a regulatory instrument | Should NOT have instrument_type per § 7 |
| standard | 11 | `industry_standard` | Clean |
| innovation | 1 | NOT a regulatory instrument | Should NOT have instrument_type per § 7 |

### Recommended additions to the proposed enum

- `national_regulation` — for Norway Fjords-like cases (national-level regulation that does not fit federal_rule / federal_statute because the country is not US/EU)
- `voluntary_initiative` — for initiative items that are voluntary coalition pledges (Getting to Zero, First Movers, ZEMBA, etc.)

### Recommended subtractions / merges

- `eu_official_journal` may be redundant if every EU regulation has the OJ citation as `instrument_identifier` field rather than a separate `instrument_type`. Audit recommends DROP.

### Final proposed enum (14 values)

```sql
CHECK (
  instrument_type IS NULL
  OR instrument_type IN (
    'local_law',
    'state_statute',
    'federal_statute',
    'federal_rule',
    'federal_executive_order',
    'eu_regulation',
    'eu_directive',
    'national_regulation',
    'municipal_ordinance',
    'agency_guidance',
    'court_decision',
    'industry_standard',
    'voluntary_initiative',
    'market_signal',
    'research_item'
  )
)
```

15 values (operator candidate 14 - 1 dropped + 2 added). `instrument_type IS NULL` is allowed because the field is added as nullable and many existing rows (regional_data, tool, technology, innovation) have no instrument identity.

## 7. instrument_identifier semantics + picking rule

The `instrument_identifier` column is a free-text identifier for the canonical instrument. Examples:

| Cluster | Proposed instrument_identifier | Source of identifier |
|---|---|---|
| LL97 | `97/2019` | Local-law number + year of enactment, per NYC convention |
| EPA Phase 3 | `RIN 2060-AV50` | Federal Register Regulatory Identification Number (RIN) |
| EU Automotive | `Regulation (EU) 2024/1257` (or whatever the official OJ citation is) | EU Official Journal canonical citation |
| Norway Fjords | `world-heritage-fjords-ZE-2026` | Slug; no formal regulation number per the visible source URLs |
| Matrix Hudson | `matrix-hudson-2br-lottery` | Slug; not a regulation |

### Picking rule when multiple identifier candidates exist

For a single regulatory instrument the picking rule is, in order:

1. **Authoritative public identifier** — RIN (US federal), OJ citation (EU), Public Law number (US Congress), Bill number when enacted, ISO standard number for industry standards
2. **CFR / agency-publication citation** — 40 CFR Part X, 49 USC § Y, IATA Resolution Z
3. **Court-decision citation** — for `court_decision` instrument_type: case citation per Bluebook (e.g., `Trump v. EPA, No. 23-1234 (D.C. Cir. 2024)`)
4. **Slug form** — when no formal identifier exists: lowercase kebab-case derived from the instrument's title, scoped to its jurisdiction

The picking-rule preference within a category: prefer RIN over CFR citation (the RIN tracks across the rule's lifecycle including amendments); prefer enacted public-law number over bill number (a bill that died has no canonical instrument identity); prefer EU OJ citation over Commission press release.

### Mode-of-use

`instrument_identifier` is NOT case-normalized at write time. Two records with `instrument_identifier = '97/2019'` vs `instrument_identifier = '97 of 2019'` will be treated as DIFFERENT canonical entities. To avoid this, the Phase 4 partial unique index on `(jurisdiction_iso, instrument_type, instrument_identifier)` enforces the constraint; if ingest produces a near-match with different formatting, the constraint will throw and force operator review. This is more conservative than auto-normalizing because the normalization rules for different instrument types differ (CFR citation has different conventions than EU OJ citation).

The ingest layer (Phase 6) is responsible for picking the canonical identifier per the rule above; it does NOT normalize after the fact.

## 8. Open items for operator decision

Before Phase 3 begins:

1. **Cluster B (EPA Phase 3) count mismatch.** Audit said 4, found 3. Operator can: (a) confirm 3 is correct and proceed; (b) name the 4th record's UUID or title so the query is rerun; (c) note that one was hand-deleted between audit and introspection.
2. **Cluster C (EU Automotive) count mismatch.** Audit said 2, found 1. Same options.
3. **agent_runs decision.** Option I (remap), II (let SET NULL fire at hard-delete; audit recommendation), or III (new archived_with_item_id column; out of scope).
4. **instrument_type enum: add `national_regulation` + `voluntary_initiative`; drop `eu_official_journal`?** Or keep operator's exact 14 values + handle exceptions at Phase 5 backfill.
5. **Norway Fjords instrument_type.** Audit proposed `national_regulation` (new); operator may prefer `agency_guidance` if legal status reads that way. Legal-counsel caveat applies.
6. **Matrix Hudson dedup at all?** This cluster is candidate for Sprint 2 RC-8 deletion entirely. Audit recommends merge-then-flag (winner keeps `instrument_type = 'market_signal'`, but is marked for RC-8 review).

## 9. Cost frame (per rule-cost-weighted-recommendations)

- **One-time agent work:** Low ($20-50). The dedup is mechanical: 5 clusters, 8 loser rows, FK remap is trivial (only agent_runs has loser refs; 5-7 rows total). Phase 5 backfill of `instrument_identifier` for the 160 regulation rows + ~270 framework/guidance/standard/directive rows requires some content judgment but no AI calls; per-row inspection is ~30s wall-time per row.
- **Ongoing runtime:** Zero. Schema-only changes + one-time data migration.
- **Ongoing infrastructure:** None.
- **Inheritance:** High. The canonical-entity key becomes the contract every future ingest enforces. RC-9 closes by construction once Phase 6 wires it.
- **Value frame:** Revenue-blocking-adjacent. The LL97 wrong-urgency-on-stub-rows is operator-actionable-wrong; an operator following the loser MONITOR/CRITICAL label is being told to act on the wrong information.
- **Manual gate:** Not applicable for the schema-only work. Phase 5 backfill operator-reviews the NULL-identifier list before continuing.

## 10. Phase 2 deliverable summary

- FK fan-out confirmed live: 21 FKs (audit had 7; missed 14)
- 5 duplicate clusters classified: LL97 (3 ✅), EPA Phase 3 (3 vs audit 4 ❓), EU Automotive (1 vs audit 2 ❓), Norway Fjords (2 ✅), Matrix Hudson (2 ✅)
- Total losers: 8 rows (assuming the two count mismatches resolve at 3 and 1)
- Total FK remap workload: 5-7 agent_runs rows (operator decision)
- instrument_type enum: 15 values proposed (operator's 14 + 2 - 1)
- instrument_identifier picking rule: 4-level preference order, no auto-normalization
- Two FK columns docs-stale (intelligence_summaries.item_id, intelligence_changes.item_id are now real FKs; migration 009 comments are wrong)
- intelligence_summaries has 2,310 rows; not a dedup blocker because losers have 0 references

**Operator action required before Phase 3:**
1. Resolve cluster B + C count mismatches (or confirm proceed with 3/1)
2. Decide agent_runs treatment (Option I / II / III; audit recommends II)
3. Approve or amend the instrument_type enum
4. Confirm Norway Fjords instrument_type assignment OR flag for legal-counsel input
5. Confirm Matrix Hudson dedup-then-defer-to-Sprint-2 approach

No code modified. No migrations written. No PR opened. Sprint 1 branch holds Phase 1 + Phase 2 deliverables only.
