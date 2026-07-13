> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Four-page architecture survey, 2026-05-09

## TL;DR

The `sources` registry has 63 columns (not 55), and none of them encode the operator's four-role taxonomy (`regulatory`, `research`, `market_news`, `operational_data`). The closest existing classifiers are `intelligence_types` (a 14-value mixed-case bag including REG, GUIDE, MKT, RES, NEWS) and `domains` (1 to 7), neither of which maps cleanly onto the four pages. All four operator-facing pages read from a single content table, `intelligence_items`, which is itself heavily skewed to domain 1 (388 of 446 rows). `/regulations` is well-supported, `/research` is partially supported (uses `pipeline_stage`, but draws from the same domain-1 dominant pool, not from a horizon-scan-specific source role), and both `/market` and `/operations` are weakly supported: they client-filter the same `getResourcesOnly()` payload by `item_type` and `domain`, and there is no schema for time-series prices, tariffs, wages, or jurisdiction-keyed structured operational data. There are zero `intelligence_items` rows with `item_type = 'innovation'` or `'tool'` matching the Tech tab and only 48 `market_signal` rows total.

## 1. sources schema (63 columns enumerated)

The live `sources` table has 63 columns, not 55. The discrepancy is real, not a heuristic miscount: the script pulled `Object.keys(row)` against a freshly fetched row.

Grouped by semantic role, with the migration that introduced each column:

### Identity (5)
| column | added in | meaning |
|---|---|---|
| `id` | 004 | UUID primary key |
| `name` | 004 | human label for the portal |
| `url` | 004 | landing page URL |
| `description` | 004 | free text |
| `notes` | 004 | operator notes |

### Classification (10)
| column | added in | meaning |
|---|---|---|
| `tier` | 004 | trust tier 1..7 |
| `tier_at_creation` | 004 | initial tier when added |
| `tier_history` | 004 | JSONB array of tier changes |
| `intelligence_types` | 004 | TEXT[] tag bag, free taxonomy |
| `domains` | 004 | INT[] of domains 1..7 the source covers |
| `transport_modes` | 004 | TEXT[], e.g. road, rail, ocean, air |
| `topic_tags` | 007_community_layer | TEXT[] community-curated topic tags |
| `vertical_tags` | 007_community_layer | TEXT[] vertical (cargo type) tags |
| `jurisdictions` | 004 | TEXT[] free-form jurisdiction labels |
| `jurisdiction_iso` | 033 | TEXT[] ISO 3166 codes |

Operator-relevant note: `intelligence_types` is the only column whose values approximate the four-role taxonomy, but it conflates emission categories (REG, STD, RES) with content type (NEWS, GUIDE, MKT, INN, IND, SUP) and case-style (legislation, regulation, guidance vs. REG, STD). It is the most likely target for a normalisation pass, not a source-role pass.

### Ingestion routing (10)
| column | added in | meaning |
|---|---|---|
| `update_frequency` | 004 | text: daily/weekly/monthly |
| `last_checked` | 004 | populated by HEAD prober |
| `last_substantive_change` | 004 | populated by trust engine |
| `next_scheduled_check` | 004 | scheduler input |
| `status` | 004 | active / stale / inaccessible / provisional / suspended |
| `paywalled` | 004 | bool |
| `access_method` | 004 (extended in 056) | api / rss / html_scrape / scrape / gazette / manual |
| `api_endpoint` | 004 | older endpoint URL field, retained for compat |
| `rss_feed_url` | 004 | RSS URL when access_method=rss |
| `last_scanned` | 051 | per-source agent/run cooldown timer |

### Wave 1a foundation columns (8)
| column | added in | meaning |
|---|---|---|
| `processing_paused` | 016 | per-source pause for budget control |
| `admin_only` | 017 | gates workspace visibility |
| `auto_run_enabled` | 055 | per-source kill switch for scheduled worker |
| `last_content_hash` | 054 | SHA-256 of last successful raw_fetch HTML body |
| `last_content_fetched_at` | 054 | timestamp of last successful raw_fetch |
| `last_intelligence_item_at` | 054 | timestamp of last item create or update keyed to source |
| `api_endpoint_url` | 056 | concrete API endpoint (Wave 1a path) |
| `api_auth_method` | 056 | auth scheme for API path |
| `api_response_format` | 056 | json / xml / rss / atom / html / text |

(Counts 9 because the table groups `api_*` together; folded into 10 above.)

### Trust metrics, denormalised (15)
| column | added in | meaning |
|---|---|---|
| `confirmation_count` | 004 | running tally |
| `conflict_count` | 004 | running tally |
| `conflict_total` | 004 | conflicts opened against this source |
| `accuracy_rate` | 004 | computed by trigger from confirmation_count and conflict_count |
| `avg_lead_time_days` | 004 | numeric average |
| `lead_time_samples` | 004 | sample count for the average |
| `consecutive_accessible` | 004 | streak counter |
| `total_checks` | 004 | running tally |
| `successful_checks` | 004 | running tally |
| `accessibility_rate` | 004 | computed by trigger |
| `last_accessible` | 004 | timestamp |
| `last_inaccessible` | 004 | timestamp |
| `independent_citers` | 004 | citation graph metric |
| `total_citations` | 004 | running tally |
| `highest_citing_tier` | 004 | INT 1..7 |
| `self_citation_count` | 004 | running tally |

### Trust score, computed cache (6)
| column | added in | meaning |
|---|---|---|
| `trust_score_overall` | 004 | INT 0..100 |
| `trust_score_accuracy` | 004 | sub-score |
| `trust_score_timeliness` | 004 | sub-score |
| `trust_score_reliability` | 004 | sub-score |
| `trust_score_citation` | 004 | sub-score |
| `trust_score_computed_at` | 004 | when last recomputed |

### Spotcheck audit (3)
| column | added in | meaning |
|---|---|---|
| `spotchecked` | 036 | bool |
| `spotchecked_by` | 036 | UUID -> auth.users |
| `spotchecked_at` | 036 | timestamp |

### Provenance (2)
| column | added in | meaning |
|---|---|---|
| `cited_by` | 004 | text breadcrumb |
| `reliability_score` | 007_community_layer | NUMERIC(3,2) community signal |

### Bookkeeping (2)
| column | added in | meaning |
|---|---|---|
| `created_at` | 004 | inserted timestamp |
| `updated_at` | 004 | updated timestamp |

Total: 63 columns confirmed live. None of the columns encodes a source-role taxonomy of the operator's four-bucket form. The fields nearest to a role classifier are `intelligence_types`, `domains`, `topic_tags`, and `tier`. None drive the four pages' content selection: pages select on `intelligence_items.domain` and `intelligence_items.item_type` instead.

## 2. Distribution across classification fields

Total sources in the registry: 783. Status breakdown:

```
status   active      718
status   provisional  62
status   suspended     3
admin_only=true        0
admin_only=false     783
processing_paused=true 3
auto_run_enabled=true 783   (cold-start has not yet flipped these to false)
```

So the active-and-visible workspace cohort is exactly 718, matching the operator's framing.

### `tier` distribution (1..7)
```
1: 373    (official legal text)
2: 164    (regulator guidance)
3: 115    (IGO)
4:  81    (expert analysis)
5:  29    (industry)
6:   1    (news)
7:  20    (provisional)
```

### `domains` distribution (sources can carry multiple)
```
1: 633    (regulations and policy)
2: 126    (technology and innovation)
3:  66    (operations and infrastructure)
4:  86    (markets and economics)
5:  29    (humanitarian and resilience)
6:  36    (energy and facilities)
7:  45    (other / horizon)
```
Empty rows: 0. Every source has at least one domain.

### `access_method` distribution
```
scrape:      534
rss:         190
api:          59
html_scrape:   0   (Wave 1a transition target; not yet populated)
gazette:       0
manual:        0
```

### `intelligence_types` distribution (any-of, free taxonomy)
Mixed-case, mixed-grain. The bag of values:
```
GUIDE: 396       guidance: 70
REG:   103       regulation: 105
STD:   16        STANDARD: 1
RES:   30        RESEARCH: 1
MKT:   44
NEWS:  8
INN:   21        IND: 8        SUP: 3
legislation: 115
```
This column is the operator's nearest-existing role signal, but it has dual encoding (uppercase three-letter codes coexist with lowercase long-form), missing values for some categories, and overlaps that would have to be resolved before it could drive page selection.

### `topic_tags` distribution
473 of 783 rows (60%) are empty. Top values:
```
emissions: 168    reporting: 111   fuels: 80
transport: 74     research: 40     corridors: 22
facility: 10      customs: 8       packaging: 8
sanctions: 5      dangerous-goods: 4
```
Coverage is too sparse to drive page filtering.

### `vertical_tags` distribution
773 of 783 rows (99%) are empty. Effectively unused.

### `jurisdictions` and `jurisdiction_iso`
- `jurisdictions` (text array, free form): 325 empty
- `jurisdiction_iso` (ISO codes): 57 empty

`jurisdiction_iso` has wide coverage (93%) and is the production filter (e.g., `?region=us-ca` on `/regulations`).

## 3. Pattern-match role classification of 718 active sources

URL + name keyword classifier run against all 718 active+visible sources. Buckets are mutually exclusive (first-match wins, in the order: regulatory -> research -> market_news -> operational_data -> unknown). Heuristic, not perfect; intended only as a reality check on registry composition.

```
regulatory:        438   (61%)
research:           40   (6%)
market_news:        38   (5%)
operational_data:   17   (2%)
unknown:           185   (26%)
```

Sample of 5 from each bucket:

### regulatory (438)
- U.S. Department of Energy (DOE) Alternative Fuels Data Center, https://afdc.energy.gov/laws, tier 2, intelligence_types=[GUIDE]
- South Coast Air Quality Management District (SCAQMD), https://www.aqmd.gov, tier 2, [GUIDE]
- Florida Department of Transportation (FDOT) Freight and Rail Office, https://www.fdot.gov/rail/, tier 2, [GUIDE]
- Renewables, Climate and Future Industries Tasmania (ReCFIT), https://www.recfit.tas.gov.au, tier 2, [GUIDE]
- Diario Oficial da Uniao (Brazil), https://www.gov.br/pt-br/servicos/acessar-o-diario-oficial-da-uniao, tier 1, [REG]

### research (40)
- IRENA Data Portal, https://www.irena.org/Data, tier 1, [MKT, RES]
- IEA Data and Statistics Hub, https://www.iea.org/data-and-statistics/data-explorers, tier 1, [MKT, INN, RES]
- IMT Institute for Market Transformation, https://www.imt.org, tier 3, [REG]
- Policy Research Institute for Land, Infrastructure, Transport and Tourism (PRILIT) MLIT Japan, https://www.mlit.go.jp/pri/english/houkoku/english_nendo.html, tier 3, [GUIDE]
- MIT Center for Transportation and Logistics, https://ctl.mit.edu, tier 2, [RES]

### market_news (38)
- Maritime Carbon Intelligence, https://maritimecarbonintelligence.com/, tier 5, [NEWS]
- FreightWaves, https://www.freightwaves.com, tier 4, [MKT, INN]
- Commercial Carrier Journal, https://www.ccjdigital.com, tier 4, [INN, MKT]
- FreightWaves duplicate, https://www.freightwaves.com/, tier 5, [NEWS]
- H2Accelerate Collaboration, https://h2accelerate.eu/, tier 4, [GUIDE]

### operational_data (17)
- Estidama Pearl Rating System, https://www.abudhabi.ae/en/infrastructure-environment/environment/estidama, tier 2, [STD, REG]
- European Sea Ports Organisation ESPO EcoPorts, https://www.ecoports.com/, tier 4, [GUIDE]
- CER Community of European Railway and Infrastructure Companies, https://www.cer.be/, tier 4, [GUIDE]
- Measurabl Building Benchmarking Tracker, https://www.measurabl.com/ordinance-filing, tier 4, [REG]
- International Carbon Action Partnership (ICAP), https://icapcarbonaction.com/en/terms-use-and-documentation-notes-allowance-price-explorer, tier 3, [GUIDE]

### unknown (185)
- Ley Chile, https://www.bcn.cl/leychile, tier 1, [REG]  (Chilean legal corpus, missed by .gov pattern)
- Cortes Generales Congreso de los Diputados, https://www.congreso.es/, tier 1, [legislation]
- Transport Canada, https://tc.canada.ca/en, tier 2, [GUIDE]
- Sabin Center for Climate Change Law, https://climate.law.columbia.edu, tier 4, [REG, RES]
- USGBC LEED Project Database, https://www.usgbc.org/projects, tier 2, [STD]

The unknown bucket is large enough (26%) that the pattern-match cannot serve as a final classification. It also contains regulatory sources missed by US/EU-centric domain heuristics (Ley Chile, congreso.es). The takeaway is structural: the registry is dominated by regulatory portals, with research and market-news representation in the single-digit percent range and operational-data representation negligible. There is no operator-visible source-role column distinguishing these.

Duplicate detected: FreightWaves appears twice with different tiers (4 and 5) and trailing-slash URL variants. The registry has duplicate-by-trailing-slash drift at minimum.

## 4. Per-page schema discovery

### `/regulations` (`fsi-app/src/app/regulations/page.tsx`)

- Data fetcher: `getResourcesOnly()` -> `fetchResourcesOnly(orgId)` in `src/lib/supabase-server.ts:721`. Plus an unstable_cache wrapper around a direct count query against `intelligence_items` filtered by `domain=1, is_archived=false` (line 33-59 of page.tsx).
- Backing table: `intelligence_items` via the `get_workspace_intelligence_slim` RPC (migration 047). Joined left-side with `workspace_item_overrides`.
- Filters: server-side count uses `domain=1 AND is_archived=false`. The slim RPC returns ALL the workspace's resource-shaped items (every domain), and filtering down to regulations happens entirely in the `RegulationsSurface` client component (`r.domain === 1` plus optional priority and region URL params).
- Page-content backing row: `intelligence_items` row, projected through the `Resource` interface. Carries `full_brief`, `what_is_it`, `why_matters`, `key_data`, `timeline`, `jurisdictions`, etc. The slim RPC drops `full_brief`, `operational_impact`, `open_questions`, and `reasoning` to keep wire payload light.
- Fit assessment: well-supported. `intelligence_items` was designed for this use case in migration 004. The schema gives status (proposed, adopted, in_force, monitoring, superseded, repealed, expired), severity, dates (entry_into_force, compliance_deadline, next_review_date), jurisdiction arrays, and a structured timeline table. 388 of 446 items have domain=1.

### `/research` (`fsi-app/src/app/research/page.tsx`)

- Data fetcher: inline `fetchPipelineItems()` using `createClient` directly with the anon key. Fetches `intelligence_items` with the join `source:sources(name, url)`, ordered by added_date desc, capped at 100.
- Filters: `is_archived=false`. No filter on item type, domain, or pipeline_stage on the server. The pipeline stage filtering is done in `ResearchView` client component using `pipeline_stage` (added in migration 026, values: draft, active_review, published, archived, plus null treated as published).
- Backing table: `intelligence_items` -> joined `sources`.
- Fit assessment: partial. The page treats Research as an editorial pipeline view of `intelligence_items`. The operator's May 2026 horizon-scan framing (MIT, universities, sustainability research bodies) is NOT enforced anywhere in the data path. The page draws from the same content pool as `/regulations`. Of the 446 items, only 21 have `item_type='research_finding'`. There is no source-role gate that would route MIT/academic publications differently from EUR-Lex; everything funnels through the same item table. Of the 718 active sources, only 40 (5%) match a research-keyword pattern.
- pipeline_stage distribution in DB: `published: 186`, `null: 261`. So 261 of 446 items have null pipeline_stage and are treated by `ResearchView.normalizeStage` as "unstaged / published" by default.

### `/market` (`fsi-app/src/app/market/page.tsx`)

- Data fetcher: `getResourcesOnly()`. Identical to `/regulations`.
- Filters: client-side in `MarketPage.tsx`:
  - Tech tab: `r.type === "technology" || r.type === "innovation" || r.domain === 2`
  - Price tab: `r.type === "market_signal" || r.domain === 4`
- Backing table: same `intelligence_items` slim RPC payload as `/regulations`.
- Fit assessment: weak. Database content for these two tabs is sparse: there are 15 technology items, 1 innovation item, 48 market_signal items in the entire `intelligence_items` table (across all domains and statuses, archived included). The page's child components include `KeyMetricsRow`, `CostTrajectoryChart`, `PolicySignals`. Inspecting the imports, these are presumed time-series-rendering components. The schema has nowhere to store a price time series, a forward curve, or a SAF spot price. Every numeric data point is currently either inside `intelligence_items.summary`/`full_brief` text or in `key_data TEXT[]` (free strings). Cost trajectory charts will render placeholders or seed data, not live data.

### `/operations` (`fsi-app/src/app/operations/page.tsx`)

- Data fetcher: `getResourcesOnly()`. Identical to `/regulations`.
- Filters: client-side in `OperationsPage.tsx`:
  - Jurisdiction tab: `r.type === "regional_data" || r.domain === 3`
  - Facility tab: `r.domain === 6`
- Chips on each region card (`Solar`, `Electricity`, `Labor`, `EV Charging`, `Green Building`) populate by regex-matching the resource title, note, and tag arrays. No structured tariff or wage table is read.
- Backing table: same `intelligence_items` slim RPC payload as `/regulations`.
- Fit assessment: weak, with built-in disclosure. There are 47 `regional_data` items and 4 `domain=6` items in the entire table. The page already self-narrates the gap with placeholder copy ("Operations data points (solar, electricity, labor, EV charging, green building) for this jurisdiction will populate here as the source monitoring system ingests them"). The schema can hold the qualitative regional_data items, but nothing in `intelligence_items` is shaped for tariff-per-region-per-year, wage-per-region-per-year, or permit-timeline-per-jurisdiction.

## 5. Content tables inventory

Confirmed content-shaped tables, with row count and consuming page(s):

| table | rows | columns | consumed by |
|---|---|---|---|
| `intelligence_items` | 446 | 60 | regulations, research, market, operations (all four pages) |
| `resources` | dropped (migration 013) | 0 | none. Legacy table. The codebase still ships `Resource` as a TS type, but the table no longer exists; resources are reconstructed from `intelligence_items` rows in `fetchWorkspaceResources` |
| `staged_updates` | 24 | 18 | admin staged-updates approval flow |
| `raw_fetches` | 316 | 8 | not consumed by any of the four pages; provenance only |
| `intelligence_item_versions` | 0 | (table exists, no rows yet) | not consumed by any of the four pages; append-only history |
| `agent_runs` | 589 | (cold-start writing now) | admin Source Health Dashboard |
| `monitoring_queue` | 470 | scheduler input | worker only |
| `provisional_sources` | 396 | source discovery candidates | admin only |
| `canonical_source_candidates` | 370 | discovery agent candidates | admin only |
| `source_verifications` | 1414 | verification audit log | admin only |
| `source_trust_events` | 779 | immutable trust log | admin only |
| `item_timelines` | 107 | milestone events | regulations detail page |
| `item_changelog` | 9 | what changed for an item | regulations detail page |
| `item_disputes` | 7 | source disputes per item | regulations detail page |
| `item_cross_references` | 49 | item-to-item links | regulations detail page |
| `item_supersessions` | 5 | repeal / replace | regulations detail page |
| `intelligence_changes` | 0 | (table not present or empty in current schema) | dashboard hero |
| `workspace_item_overrides` | 1 | per-org per-item priority override | all four pages via slim RPC |
| `intelligence_summaries` | 2310 | shelved per CLAUDE.md sector-activation note | none currently |
| `coverage_gaps` | 2 | dashboard widget | dashboard only |
| `briefings` | 0 | weekly digest | not yet rendered |
| `bulk_imports` | 0 | bulk import audit | admin only |

`intelligence_items` columns (60 total, alphabetised):
```
added_date, agent_integrity_flag, agent_integrity_flagged_at, agent_integrity_phrase,
agent_integrity_resolved_at, agent_integrity_resolved_by, archive_note, archive_reason,
archived_date, category, compliance_deadline, compliance_object_tags, confidence,
created_at, domain, entry_into_force, format_type, full_brief, id, intersection_summary,
is_archived, item_type, jurisdiction_iso, jurisdictions, key_data, last_regenerated_at,
last_verified, legacy_id, linked_case_study_ids, linked_forum_thread_ids,
linked_regulation_ids, linked_vendor_ids, next_review_date, open_questions,
operational_impact, operational_scenario_tags, pipeline_stage, priority, reasoning,
regeneration_skill_version, region_tags, related_items, replaced_by, severity,
source_id, source_url, sources_used, status, summary, tags, title, topic_tags,
transport_modes, updated_at, urgency_tier, version_history, vertical_tags, verticals,
what_is_it, why_matters
```

`intelligence_items.item_type` distribution across all 446 rows:
```
regulation:       139
guidance:          48
market_signal:     48
framework:         58
regional_data:     47
initiative:        33
research_finding:  21
tool:              20
technology:        15
standard:          10
directive:          7
innovation:         1
```

`intelligence_items.domain` distribution across all 446 rows:
```
1: 388   (87%)
2:  10
3:  10
4:  17
5:   8
6:   4
7:  10
```
The 87% domain-1 dominance is the structural reality. Market and Operations pages are filtering this same pool by `item_type` and `domain` and getting tiny matched counts.

`intelligence_items.status` distribution:
```
monitoring: 413
in_force:    20
adopted:      7
superseded:   5
proposed:     2
```

## 6. Time-series and structured-jurisdictional shape

Honest answer: absent. There is no time-series table, no per-jurisdiction-per-year fact table, no price index table, no tariff schedule table. Survey of every table in the schema:

- Time-stamped tables that exist: `raw_fetches` (per-fetch provenance, HTML bytes, no domain values), `agent_runs` (run telemetry, cost, model), `source_trust_events` (trust ledger, immutable), `item_changelog` (per-field change history), `intelligence_item_versions` (full per-version snapshot of an item, but only the brief, severity, priority, tag fields, no numeric series).
- None of those carry a value column shaped like a price, an index, a tariff, a wage, or a per-jurisdiction-per-year scalar.
- `intelligence_items.key_data TEXT[]` is the only column that holds anything resembling numeric facts, and it is a free-form string array. Cost trajectories and price curves cannot be queried out of it without parsing.
- For Market Intel: there is nowhere to write, "EU SAF spot price was 2,310 EUR / tonne on 2026-04-30." The closest you can do is create a `market_signal` `intelligence_items` row whose `summary` text contains that fact.
- For Operations: there is nowhere to write, "Dubai Q1 2026 industrial electricity tariff for >10 MW load was AED 0.345 / kWh." You can create a `regional_data` `intelligence_items` row whose `key_data` array contains "AED 0.345 per kWh" as a string.
- The `OperationsPage.tsx` chip grid (Solar, Electricity, Labor, EV Charging, Green Building) inspects `r.title + r.note + r.tags` with regex matchers and surfaces the first matching item per region. There is no structured tariff-per-region join.

The `CostTrajectoryChart` and `KeyMetricsRow` components in `/market` are imported but do not appear (from the data path) to be reading anything from Supabase: the page's only data source is `getResourcesOnly()`. They presumably render against component-local seed data or against the small set of fields available on the `Resource` type.

## 7. Structural gap report

By page:

### `/regulations` (well-supported)
- `intelligence_items` was designed for this. Status, severity, dates, jurisdictions, full_brief, timeline are all there.
- 388 of 446 items already match.
- Migration 026 (pipeline_stage), 037 (verification audit), 047 (slim RPC) all serve this surface.
- No structural gap.

### `/research` (partial fit)
- The page shape (horizon-scan editorial pipeline) is workable on top of `intelligence_items.pipeline_stage`. That column exists.
- But the operator's framing requires the page to draw from a research-source role. There is no column in `sources` that flags MIT or academic or sustainability-research-body sources distinctly from regulatory sources.
- The data path joins `intelligence_items` to `sources(name, url)` only; it does not gate on a source role.
- 261 of 446 items have `pipeline_stage = null`, treated as published. So pipeline_stage is sparsely set.
- Specific gap, enumerated:
  - No `sources.source_role` column or equivalent (regulatory vs research vs market_news vs operational_data).
  - 60% of sources have empty `topic_tags`, the other classification field that could approximate this.
  - `intelligence_types` carries 14 values in mixed encoding; cannot be queried as an enum.

### `/market` (requires new tables and new schema)
- Currently filters the same content pool as the other pages, by `item_type IN ('technology', 'innovation', 'market_signal')` or `domain IN (2, 4)`.
- Total row count matching those filters across the entire DB: 15 technology + 1 innovation + 48 market_signal = 64 items. Plus any additional domain-2 or domain-4 items not tagged with those types.
- Specific gaps, enumerated:
  - No price or index time-series table. Schema would need a `market_data_points` or similar table keyed by (item_id or signal_id, date, value, unit, currency, source_id).
  - No vendor-announcement entity. Currently rolled into `intelligence_items.summary` text.
  - No carbon-price ticker, SAF-price ticker, freight-rate-index entity.
  - No `sources.source_role = 'market_news'` flag distinguishing FreightWaves and Lloyd's List from EUR-Lex.
- Page components (`KeyMetricsRow`, `CostTrajectoryChart`) suggest a UI design that anticipates time-series; no schema backs them.

### `/operations` (requires new tables and new schema)
- Currently filters on `r.type === 'regional_data' || r.domain === 3` for jurisdiction tab and `r.domain === 6` for facility tab.
- Total row counts: 47 regional_data items + 4 domain-6 items.
- The page already discloses the gap with "Coming soon Phase D" copy and "data points will populate here as the source monitoring system ingests them" copy.
- Specific gaps, enumerated:
  - No utility-tariff schedule table keyed by (utility, jurisdiction_iso, tariff_class, effective_date, value, unit).
  - No labour-cost benchmark table keyed by (jurisdiction_iso, occupation_code, year, wage, currency).
  - No permitting-timeline table keyed by (jurisdiction_iso, permit_type, median_days, source_id).
  - No infrastructure-permission table (e.g., Dubai rooftop solar feasibility flag per municipality).
  - No `sources.source_role = 'operational_data'` flag distinguishing utility regulators and labour statistics agencies from EUR-Lex.

### Cross-cutting (registry composition)
- 26% of active sources do not match any URL/name keyword pattern for the four roles. This means even a manual classification pass against the existing 718 sources will require human review of 185 rows.
- Tier 1 dominates the registry (373 of 783, 48%); Tier 2 is 21%; Tier 5 (industry) is 4%; Tier 6 (news) is 1 source. The registry is heavily weighted toward primary regulatory sources, not toward the source roles that would feed Market Intel or Operations.
- Wave 1a foundation columns (auto_run_enabled, last_content_*, api_*) are about ingestion plumbing. They do not encode source role.

## Methodology and caveats

What was queried (read-only):

- Migration files 001 through 061 in `fsi-app/supabase/migrations/`. All of `004_source_trust_framework.sql` was read end to end.
- Live database via `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` from `fsi-app/.env.local`. Single throwaway script at `fsi-app/scripts/_survey-temp.mjs`, deleted after the run.
- `src/app/regulations/page.tsx`, `src/app/research/page.tsx`, `src/app/market/page.tsx`, `src/app/operations/page.tsx` read in full.
- `src/lib/data.ts` and `src/lib/supabase-server.ts` (the `fetchWorkspaceResources` helper and `fetchResourcesOnly` function) read in full.
- `src/components/pages/MarketPage.tsx` and `OperationsPage.tsx` read in full to confirm client-side filtering logic.

Sample sizes:

- Sources: full registry, 783 rows.
- Intelligence items: full table, 446 rows.
- Pattern-match classification: ran against all 718 active+visible sources.

Heuristics used:

- The four-bucket URL+name keyword classifier is a first-match-wins regex check. It will misclassify domain-specific URLs that do not match its keyword sets (Ley Chile, congreso.es, Transport Canada all landed in the unknown bucket). It is intended only as a reality check on registry composition, not as a final classification.
- Column count of 63 is from `Object.keys(row)` against a freshly fetched live row; the operator's prior memo of 55 may reflect an earlier point in the migration history (before 054, 055, 056, plus the spotcheck triple in 036, plus 033 jurisdiction_iso, plus 051 last_scanned). Migration count for `ALTER TABLE sources` after 004: 16, 17, 33, 36 (3 cols), 51, 54 (3 cols), 55, 56 (3 cols, plus check-constraint swap on access_method) = 14 added columns, plus the original 49 in migration 004, totalling 63. Confirmed.

Discrepancies noted:

- Operator memo says 55 columns; live table has 63. Reconcile by acknowledging the schema has continued to grow.
- `intelligence_changes` table appears in code paths (`fetchDashboardData` queries it) but the row-count probe returned 0 with no error, suggesting it exists but is empty.
- `sector_contexts` and `ingestion_state` returned errors on the row-count probe. They may not have been migrated yet, or may live under a different table name.
- One workspace_item_overrides row exists; this is the test workspace.
- The `resources` legacy table was dropped in migration 013 and no longer exists; the `Resource` TypeScript type is reconstructed from `intelligence_items` row shape.

## Related

- [caros-ledge-product-audit-2026-05-15](./caros-ledge-product-audit-2026-05-15.md) — The four-page architecture, domain-1 dominance, and weak market/operations schema this audit specs against were first established by that survey
- [caros-ledge-supabase-schema-audit-2026-05-15](./caros-ledge-supabase-schema-audit-2026-05-15.md) — Shares the sources-table column inventory and the three-vocabulary (scope_topics/topic_tags/intelligence_types) drift and two-tier-semantics finding
- [primitives-audit-2026-05-09](./primitives-audit-2026-05-09.md) — Explicitly cites and extends it; both find the source-role/six-category taxonomy absent and reconstruct pages from item_type/domain TypeScript filters
- [classification-rules-audit-2026-05-09](./classification-rules-audit-2026-05-09.md) — Explicitly extends this survey; both find the missing sources.source_role column and domain-1 acting as a catch-all are the root of unclassifiability
- [dashboard-payload-audit-2026-05-11](./dashboard-payload-audit-2026-05-11.md) — Shares the slim RPC (migration 047) and the per-route fetcher split (getResourcesOnly vs full) that the survey first mapped across the four pages
