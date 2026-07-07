# Sources + content verification, 2026-05-11

## TL;DR

All headline counts match the wave outcomes. Sources total 794, active 66, paused 728, classified 11. Intelligence items total 648, within the expected 647 to 650 window after the drain worker seeded one stub for finance.ec.europa.eu. Both intended archive rows are correctly archived with hidden_reason text. Zero of the 66 deletion IDs remain present and zero agent_runs reference deleted intelligence_item_id values, so the deletion was clean. The post PR 86 fetch quality filter is holding (zero fetch failure titles in the single new item written since merge). Anomalies are minor and pre existing, the most notable being 484 of 648 items with NULL or empty full_brief and a single legacy duplicate row pair from 2026-04-05.

## A. Sources

### A1. Total source count

`SELECT count(*) FROM sources` returns **794**, exactly the expected value. Delta is 0.

### A2. Task 6 sources verification

All 11 Task 6 priority sources are present in the corpus, all 11 carry the 5 axis classification (source_role, tier, jurisdictions, scope_topics, scope_modes, scope_verticals, expected_output), and the GCC URL split is confirmed as two separate rows with distinct roles and tiers. The classification timestamp on every row is `2026-05-10T21:20:49.14489+00:00`, indicating a single batched write.

| URL fragment | Source ID | source_role | tier | auto_run_enabled | classified |
|---|---|---|---:|:---:|:---:|
| finance.ec.europa.eu | 1d0265c2 | primary_legal_authority | 1 | TRUE | yes |
| esma.europa.eu | 7aa784cf | primary_legal_authority | 1 | FALSE | yes |
| eba.europa.eu | 2d27b8d9 | primary_legal_authority | 1 | FALSE | yes |
| fca.org.uk | c75ea058 | primary_legal_authority | 1 | FALSE | yes |
| sec.gov (root) | 390fb3eb | primary_legal_authority | 1 | FALSE | yes |
| carbon-pulse.com | e1cf70bc | trade_press | 5 | FALSE | yes |
| galleryclimatecoalition.org/about | 5cb7d618 | industry_association | 5 | FALSE | yes |
| galleryclimatecoalition.org/research | f81c2cd0 | academic_research | 3 | FALSE | yes |
| aam-us.org | 0768a0d2 | industry_association | 5 | FALSE | yes |
| icom-cc.org | bb01d11f | industry_association | 5 | FALSE | yes |
| iiconservation.org | 7fd006b9 | industry_association | 5 | FALSE | yes |

The GCC split is correct: `/about/` carries source_role=industry_association at tier 5, `/research/` carries source_role=academic_research at tier 3, both with jurisdictions=["global"] and scope_verticals=["fine_art"]. The expected_output distributions also differ as designed (about leans Market_Intel 0.55, research leans Research 0.85).

A pre existing `https://www.sec.gov/climate-disclosure` row also matched the sec.gov ilike search (id `cdce56bf`), but it is a legacy entry independent of Task 6, sits at auto_run_enabled=TRUE, and carries NULL classification. Surfaced separately in section A4.

### A3. Active versus paused state

| Bucket | Count | Expected |
|---|---:|---:|
| auto_run_enabled = TRUE | 66 | 66 |
| auto_run_enabled = FALSE | 728 | 728 |
| Total | 794 | 794 |

The 66 active rows include the expected smoke test flip on finance.ec.europa.eu (id `1d0265c2`) plus 65 legacy active rows. Of the 65 legacy active rows, 4 also carry `processing_paused = TRUE` (DPNR Virgin Islands `3cab0b63`, Maryland MDE `9fefb65c`, VDOT `76852e81`, plus one more), meaning the scheduled GHA worker will skip them but they remain on the active roster. None of the 66 active rows are unexpected: each has a freight, sustainability, or regulatory mission consistent with the cold start whitelist. No silent flips detected.

### A4. Classification coverage

| Bucket | Count | Expected |
|---|---:|---:|
| source_role IS NULL | 783 | 783 |
| source_role IS NOT NULL | 11 | 11 |

Coverage matches the spec. None of the 11 Task 6 rows have NULL on any of the 7 expected non null axis fields. Every row carries jurisdictions, scope_topics, scope_modes, scope_verticals, and expected_output (all populated as multi value arrays or jsonb). Note that scope_modes is `["none"]` for finance and museum sources, which is the correct sentinel for "no transport mode applies".

## B. Intelligence items

### B5. Total item count

`SELECT count(*) FROM intelligence_items` returns **648**. The pre Phase 2 baseline was 713, minus 66 hard deletes equals 647, plus the 1 finance.ec.europa.eu drain worker stub (id `53c3fcd5-a234-4e97-a294-908dacb01c04`, pipeline_stage='draft', created `2026-05-10T21:58:54Z`) equals 648. Within the expected 647 to 650 window. The 2 archived items remain in place per spec.

### B6. Archive verification

Both target rows are correctly archived with hidden_reason text populated.

**NYC ICE row** (`eb08d16c-f51c-44bd-8f50-0fada86c67d4`):
- pipeline_stage: `archived`
- hidden_reason present: yes
- Reason text begins: `topic_out_of_scope: NYC City Council immigration / sanctuary city lawsuit. Subject matter is sanctuary city immigration enforcement, not freight, transport, sustainability, or any vertical Caros Ledge serves...`

**Latvian Saeima row** (`0554d47e-3e90-40cb-aced-fcfb42ff793d`):
- pipeline_stage: `archived`
- hidden_reason present: yes
- Reason text begins: `topic_out_of_scope: Latvian Saeima homepage. The page is a parliamentary portal landing, not a freight, sustainability, transport, or operations item. The Haiku classifier promoted a homepage to an intelligence item...`

Both archive rows verify clean.

### B7. Delete verification + orphan check

Loaded the 66 deletion IDs from `fsi-app/scripts/tmp/deletion-preview-title-only.json`.

| Check | Result |
|---|---|
| Of 66 deletion IDs, count still present in intelligence_items | 0 |
| Of 66 deletion IDs, count referenced as agent_runs.intelligence_item_id | 0 |

Deletion is fully effective. No FK orphans. The `ON DELETE SET NULL` cascade on agent_runs.intelligence_item_id (migration 057 line 31) means any prior agent_runs that referenced these intelligence_items have had the FK column nulled, so reporting against agent_runs by item id will not surface them but historical run telemetry remains.

### B8. Post PR 86 fetch failure leakage

| Metric | Value |
|---|---:|
| Items created since `2026-05-10T20:00:00Z` (PR 86 merge) | 1 |
| Of those, titles matching the fetch failure pattern | 0 |
| Expected fetch failure leakage | 0 |

The single post merge item is the finance.ec.europa.eu drain worker stub (id `53c3fcd5`), which has a normal source name title. The fetch quality filter has not let any failure pages through since deploy. Sample size is small, so this is a hold for review until more sources are flipped to active and more items written.

### B9. Misclassification check (per Task 6 source)

| Source | source_role | auto_run_enabled | Item count | Notes |
|---|---|:---:|---:|---|
| finance.ec.europa.eu | primary_legal_authority | TRUE | 1 | The 1 item is the drain worker stub at `pipeline_stage=draft`, will NOT appear on /regulations until promoted |
| esma.europa.eu | primary_legal_authority | FALSE | 0 | as expected |
| eba.europa.eu | primary_legal_authority | FALSE | 0 | as expected |
| fca.org.uk | primary_legal_authority | FALSE | 0 | as expected |
| sec.gov (root) | primary_legal_authority | FALSE | 0 | as expected |
| sec.gov/climate-disclosure | NULL (legacy) | TRUE | 0 | legacy active source, classified as NULL, no items either way |
| carbon-pulse.com | trade_press | FALSE | 0 | as expected |
| gcc.org/about | industry_association | FALSE | 0 | as expected |
| gcc.org/research | academic_research | FALSE | 0 | as expected |
| aam-us.org | industry_association | FALSE | 0 | as expected |
| icom-cc.org | industry_association | FALSE | 0 | as expected |
| iiconservation.org | industry_association | FALSE | 0 | as expected |

The finance.ec.europa.eu stub is correctly held in `pipeline_stage=draft`, so it will not surface on the /regulations listing. The 10 paused Task 6 sources have produced zero items, as expected. Misclassification check passes.

## C. Content health

### C10. NULL fields

| Field | NULL or empty count | Total items | Percent |
|---|---:|---:|---:|
| title | 0 | 648 | 0.0% |
| summary | 1 | 648 | 0.2% |
| full_brief | 484 | 648 | 74.7% |

The single NULL or empty summary is worth surfacing for spot review (anomaly 4 below). The 484 NULL or empty full_brief count is expected behavior given that full_brief is a Sonnet generated artifact attached only to promoted items, and the dashboard payload intentionally drops it for list views, but the percentage is high enough that it is worth confirming the policy is intentional.

### C11. Cost anomalies

| Bucket | Count |
|---|---:|
| agent_runs with cost_usd_estimated < 0 | 0 |
| agent_runs with cost_usd_estimated > $1.00 | 0 |

Cost telemetry is clean within sanity bounds. No negative writes, no single run exceeding the $1.00 ceiling.

### C12. Duplicate items

Sampled the most recent 2000 intelligence_items for `(source_id, source_url)` collisions within a 5 minute window. **1 candidate pair** surfaced.

| Source | URL | Item A | Item B | Gap |
|---|---|---|---|---:|
| `b534ca39-6ec5-4dce-9889-92367a2f5c62` (clean-trucking.eu) | https://clean-trucking.eu/about-us/ | `29132ca6` "European Clean Trucking Alliance" | `58bf0406` "European Clean Trucking Alliance" | 0 ms |

Both rows have identical `created_at` of `2026-04-05T01:02:57.452179Z`, identical title, identical source_url. This is a pre Phase 2 legacy double write that survived the cleanup. Severity is low because the title pattern is content describing (not a fetch failure) and one row could be dropped without losing data. Surfaced as anomaly 1 below.

### C13. Recent error patterns

| Window | agent_runs.status='error' count |
|---|---:|
| Since cold start completion `2026-05-10T03:00:00Z` | 23 |
| Since PR 86 merge `2026-05-10T20:00:00Z` | 0 |

Top 10 chronic error sources since cold start (each with 1 error in the sampled window, no source dominates):

| Source ID | URL | Errors |
|---|---|---:|
| 33154dd7 | transport.ec.europa.eu/news-events/news/commission-welcomes-political-agreement... | 1 |
| cc11069e | transport.ec.europa.eu/transport-modes/air/environment/refueleu-aviation_en | 1 |
| 272e9339 | taxation-customs.ec.europa.eu/customs/customs-security/import-control-system-2 | 1 |
| 5a81a775 | transport.ec.europa.eu/transport-themes/clean-transport/alternative-fuels... | 1 |
| c7ac74e3 | mof.go.kr/doc/en/selectDoc.do | 1 |
| f67106c2 | rules.sos.georgia.gov | 1 |
| 5391bc5f | dubai.gov.ae | 1 |
| 087c1289 | dm.gov.ae (Dubai Municipality) | 1 |
| 36433d07 | sthj.sh.gov.cn (Shanghai Eco Bureau) | 1 |
| c30febdb | ilostat.ilo.org/topics/labour-costs/ | 1 |

The error distribution is flat (1 each across the top 10), so no single source is a chronic failure repeater. The 23 total errors since cold start are distributed across many sources, suggesting a fetch-availability tail rather than systemic regression. Crucially, **zero new errors have been written since the PR 86 merge**, so the new fetch quality filter has either prevented errors entirely or no in flight runs have failed since deploy. Sample size is small, so this is also a hold for review.

## Anomalies surfaced

1. **Duplicate clean-trucking.eu rows, severity LOW.** Two rows with identical `(source_id, source_url, title, created_at)` exist for `https://clean-trucking.eu/about-us/`: ids `29132ca6-9172-45ab-95c2-e7fd7b8aa62a` and `58bf0406-3be9-45bd-a2c8-b7c9d0b5c1a4`, both timestamped `2026-04-05T01:02:57.452179Z`. Pre Phase 2 artifact. **Recommended next action:** dedupe by keeping the row with the more complete `full_brief` and archiving the other to `pipeline_stage=archived` with `hidden_reason='dedupe_legacy_double_write'`. No execution here, hold for operator approval.

2. **finance.ec.europa.eu drain worker stub at pipeline_stage='draft', severity NONE (informational).** Item id `53c3fcd5-a234-4e97-a294-908dacb01c04` titled "European Commission DG FISMA (finance)" exists from the smoke run. It correctly sits at `pipeline_stage='draft'` so it is suppressed from /regulations. **Recommended next action:** decide whether to promote (publish), discard (hard delete), or hold. No execution here.

3. **Legacy unclassified sec.gov/climate-disclosure row remains active, severity LOW.** Source id `cdce56bf-04e9-4102-9d70-ad40db2db704` (`https://www.sec.gov/climate-disclosure`) is auto_run_enabled=TRUE with NULL classification. It shares the host `sec.gov` with the Task 6 root (id `390fb3eb`) which is paused. Two rows for the same root host with conflicting active states. **Recommended next action:** when classifying the next wave, decide whether to deactivate the legacy row or apply a URL-path split classification consistent with the Task 6 framework. No execution here.

4. **Single intelligence_item with NULL or empty summary, severity LOW.** 1 of 648 items has a NULL or empty `summary` field. Not surfaced by the deletion preview because the item title is content describing (it would not match fetch failure regex). **Recommended next action:** identify the row id with `SELECT id, title, source_id FROM intelligence_items WHERE summary IS NULL OR summary = ''` and either backfill the summary or archive if it is a stub. No execution here.

5. **High percentage of NULL or empty full_brief, severity LOW (informational).** 484 of 648 items (74.7%) have NULL or empty `full_brief`. This is consistent with the design that full_brief is a Sonnet generated artifact attached to promoted items only, but the gap is large enough to confirm the policy is intentional rather than a write regression. **Recommended next action:** spot check 5 random non null full_brief items against 5 NULL items to confirm the split aligns with `pipeline_stage` (i.e., NULL on draft and archived, populated on published). No execution here.

No critical or high severity anomalies surfaced. All 5 above are informational or low priority.

## Methodology

### Queries used

All queries were executed with `@supabase/supabase-js` against the production Supabase URL using the service role key, all read only via `.select(...)`, `.is(...)`, `.eq(...)`, `.in(...)`, `.gte(...)`, `.gt(...)`, `.lt(...)`, and `.or(...)`. No `insert`, `update`, `delete`, or `rpc` write calls were made. The throwaway script lives at `fsi-app/scripts/_verification-temp.mjs` and writes its raw output to `fsi-app/scripts/tmp/_verification-temp-output.json` and `fsi-app/scripts/tmp/_verification-stdout.json` for traceability. The script can be deleted after operator review.

Specifically:

- **A1**: `count(id)` head only on `sources`.
- **A2**: 11 separate `ilike` queries on `sources.url`, one per Task 6 URL fragment.
- **A3**: two `count(id)` head only queries on `sources` filtered by `auto_run_enabled`, plus a full select of the 66 active rows for inspection.
- **A4**: two `count(id)` head only queries on `sources` filtered by `source_role IS NULL` and `source_role IS NOT NULL`.
- **B5**: `count(id)` head only on `intelligence_items`.
- **B6**: per row select on the two known archive ids.
- **B7**: chunked `select` on `intelligence_items` and `agent_runs` with the 66 deletion ids loaded from `scripts/tmp/deletion-preview-title-only.json`.
- **B8**: select all `intelligence_items` created since `2026-05-10T20:00:00Z` and apply the fetch failure regex client side.
- **B9**: per Task 6 source, count items by source_id and pull a 3 row sample.
- **C10**: three `count(id)` head only `or(field.is.null, field.eq.)` queries.
- **C11**: select rows where `cost_usd_estimated < 0` or `> 1.0` from `agent_runs`.
- **C12**: select most recent 2000 intelligence_items, group by `(source_id, source_url)`, surface adjacent pairs within 5 minutes.
- **C13**: count and select `agent_runs` with `status='error'` since the cold start and since PR 86 merge, then group by `source_id` client side and resolve names from `sources`.

### Where data may be partial

- **C12 duplicates** scans only the most recent 2000 intelligence_items, ordered by `created_at DESC`. Since total is 648, this scans 100% of the table and is complete. If the table grows past 2000 in future runs, raise the limit or paginate.
- **C13 errors** selects up to 2000 agent_runs error rows for the client side group by. The total since cold start is 23 (well under the cap), so this is complete. If the error count climbs past 2000 in a future run, raise the limit or aggregate server side via an RPC.
- **B8 post PR 86** selects up to 2000 items since merge. Currently only 1 item has been written, so this is complete.
- **A2 Task 6** uses `ilike` on URL fragments rather than exact match, which is why the sec.gov fragment matched two rows (the Task 6 root and the legacy /climate-disclosure entry). This is intended and surfaced as anomaly 3. Other URL fragments matched exactly one row each.
- **B7 deletion IDs** depend on `scripts/tmp/deletion-preview-title-only.json` being intact. The file was present at audit time with the 66 expected ids.

### Tier value type observation

Migration 063 declares `sources.tier` as `TEXT`, but the Task 6 rows surface in the JSON output as integers (e.g., `"tier": 1`). The Supabase JS client does not parse text columns as integers, so the column type may have been changed in a later migration not surveyed here, or the inserts wrote integer literals which Postgres coerced. Worth confirming the live column type if the tier framework expects T1 to T6 string codes per the migration comment. Not surfaced as an anomaly because the values are semantically correct, only the data type is inconsistent with the migration declaration.

### Date constants used

- PR 86 merge time: `2026-05-10T20:00:00Z` (approximate, per dispatch).
- Cold start completion: `2026-05-10T03:00:00Z`.
- Audit generation time: `2026-05-10T22:19:40.736Z`.

## Related

- [[topic-relevance-investigation-2026-05-09]] — The two archived rows verified here (NYC ICE + Latvian Saeima) are the off-topic items that investigation recommended flag-and-hide
- [[wave1b-stub-quality-investigation-2026-05-11]] — Anomaly 2 (finance.ec.europa.eu stub 53c3fcd5 at pipeline_stage=draft) is the exact drain-worker stub that investigation dissects
- [[source-classification-final-summary-2026-05-11]] — That audit verifies these classified rows (same 2026-05-10T21:20:49 write batch, Task 6 11-source subset)
- [[deletion-reclassification-log]] — Confirms the 66 hard deletions this audit checks (0 remain, 0 agent_runs FK orphans) — the ops log of that deletion action
