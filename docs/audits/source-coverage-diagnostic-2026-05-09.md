> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# EU ESRS coverage diagnostic + curation methodology audit, 2026-05-09

## Snapshot context

- Snapshot timestamp: `2026-05-10T03:18:35.452Z` (UTC).
- `intelligence_items` total: **644** (the four-page survey saw 446 one day prior, the topic-relevance investigation 488, the primitives audit 584; the cold-start backfill `b37bz0u4z` is writing concurrently and the count climbs by tens per hour).
- `sources` total: **783** (status: 718 active, 62 provisional, 3 suspended).
- `agent_runs` total: **905** (582 success, 322 error, 1 running).
- `raw_fetches`: **583**. `item_supersessions`: 5. `item_cross_references`: 49. `intelligence_summaries`: 2,310 (legacy backfill, shelved). `source_health_summary` is a VIEW with 12 aggregate rows.
- This audit cites and extends `four-page-architecture-survey-2026-05-09.md`, `topic-relevance-investigation-2026-05-09.md`, and `primitives-audit-2026-05-09.md`. It does NOT touch the in-flight `classification-rules-audit-2026-05-09.md` (concurrent task `a147d709d252a1d80`) and does NOT modify the handoff doc.
- Read-only audit. Three throwaway scripts at `fsi-app/scripts/_coverage-temp{,2,3}.mjs` created and deleted within the run; no schema changes; no inserts; no updates.

## TL;DR

The EU ESRS revision arc is a **Mode B (ingestion silently failing) plus Mode A (not in registry) plus Mode E (wrong channel monitored) compound miss**. `finance.ec.europa.eu` is not in the registry under any URL. `efrag.org` is in the registry as a `provisional` tier-2 source with `last_checked=null`, `last_scanned=null`, `last_intelligence_item_at=null`, and zero `agent_runs` rows: registered but never fetched. `esgtoday.com` is in the registry as `active` tier-4 with a valid RSS feed URL, but identically has zero fetches and zero agent_runs. The May 6 to 7 ESRS-revision item is absent from `intelligence_items` (zero rows mention ESRS by name; two rows mention CSRD and were both seed-data backfilled on 2026-05-05 with `source_id=null`). The highest-leverage methodology gap is the **complete absence of a written source-curation methodology**: no doc names categories, jurisdictions, verticals, or coverage targets. The `coverage_gaps` table exists with 2 rows but is dashboard-display only.

## Phase 1: Diagnostic

### 1.1 Source presence

| Probe | Matches | Source ID | Name | Status | Tier | Access | RSS | last_checked | last_scanned | last_item | Auto-run | Topic tags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `finance.ec.europa.eu` (URL) | **0** | n/a | not in registry | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `ec.europa.eu/finance` (URL) | **0** | n/a | not in registry | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| `ec.europa.eu` (broad URL) | 18 | various | DG TAXUD, DG MOVE, DG CLIMA, DG Energy, DG TAXUD CBAM, EU CSDDD, etc. | mixed (16 active, 2 provisional) | mostly tier 1 to 2 | mostly RSS or scrape | shared press-corner aggregate feed | mostly null (only DG-TAXUD-CBAM has 2026-05-01 timestamp) | mostly null | **all 18 are null** | true | mixed |
| `efrag.org` (URL) | **1** | `71b29085-7625-4f90-8693-946a89377fed` | `EFRAG, European Financial Reporting` (DB row name uses an em-dash verbatim) | **provisional** | 2 | scrape | none | **null** | **null** | **null** | true | `[reporting]` |
| `esgtoday.com` (URL) | **1** | `6a4fbc59-5412-4541-a9a3-eeb155b15cc6` | `ESG Today` | **active** | 4 | rss | `https://www.esgtoday.com/feed/` | **null** | **null** | **null** | true | `[]` (empty) |

`finance.ec.europa.eu` is not in the registry. The closest captured set is the 18 `ec.europa.eu` subdomains, of which the 7 RSS-flagged rows all share `https://ec.europa.eu/commission/presscorner/api/notifications/rss`, the press-corner aggregate feed, not per-DG sustainable-finance feeds.

EFRAG row notes field (verbatim DB string contains an em-dash): `Added from comprehensive source registry expansion, April 2026. Requires verification.` Registered ~4 weeks; never touched by the pipeline.

ESG Today: registered ~5 weeks ago; access_method `rss`; valid feed URL; zero `agent_runs` rows; zero `raw_fetches` rows; `auto_run_enabled=true`.

Aggregate: of the 20 sources matched (18 ec.europa.eu + EFRAG + ESG Today), only ONE (`DG-TAXUD-CBAM legislation page`) has non-null `last_checked` / `last_scanned`. Recent (last 30 days) `agent_runs` for the matched IDs returned 12 source-status pairs, all but two with status `error`; recent `raw_fetches` for the same set: 2 rows total.

### 1.2 May 2026 ESRS items

Search criteria: `intelligence_items` with `created_at` between 2026-05-01 and 2026-05-09 AND title or summary matching any of `ESRS`, `EFRAG`, `Omnibus`, `CSRD`, `VSME`, `European Sustainability Reporting`, `Corporate Sustainability Reporting`, `sustainability reporting standards`.

**Total matches: 2.**

| ID | Title | Source | Domain | item_type | Status | Pipeline | Page | Created | Source_id |
|---|---|---|---|---|---|---|---|---|---|
| `9c5d1d17-...` | EU CSRD - Transport Provisions | EUR-Lex CELEX URL only | 1 | regulation | in_force | published | /regulations | 2026-05-05T16:34:34Z | **null** |
| `f0833999-...` | EU CSRD - Transport Sector Implementation | EUR-Lex CELEX URL only | 1 | regulation | in_force | published | /regulations | 2026-05-05T16:34:32Z | **null** |

Both rows have `source_id=null` (no link to any registered source) but carry `source_url=https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2464`, `entry_into_force=2024-01-05`, `topic_tags=[]` (empty). Both summaries describe the 2024 CSRD already-in-force directive, not the 2026-05-06 revision. Both timestamped 2026-05-05T16:34Z, ~24 hours before the trigger event. They are part of a 12-item burst at the same 2026-05-05T16:34Z timestamp (Brazil PNCA, K-Taxonomy, Singapore Green Maritime, UAE Net Zero, etc.), confirming a backfill batch, not a fetch.

**Zero items mention `ESRS` literally across the entire `intelligence_items` table. Zero items mention `EFRAG` across the entire table. Zero items mention `Omnibus` outside the four arc rows in 1.3.** The 2026-05-06 trigger event is **absent from the database**.

### 1.3 Broader Omnibus arc since 2024-12-01

Search: `intelligence_items.created_at >= 2024-12-01` matching any of `CSRD simplification`, `Omnibus`, `EFRAG technical advice`, `ESRS`, `EFRAG`, `VSME`. **4 unique items**, only via the `Omnibus` and `Corporate Sustainability Reporting` terms.

| ID | Title | Source ID | Status | Created | Added | Entry_into_force |
|---|---|---|---|---|---|---|
| `87493612-...` | CSRD | `d8d21ad5-...` | monitoring | 2026-04-05 | 2026-02-28 | null |
| `b0307895-...` | CSRD 250+ employee threshold | null | monitoring | 2026-04-05 | 2026-02-24 | null |
| `9c5d1d17-...` | CSRD - Transport Provisions | null | in_force | 2026-05-05 | 2026-05-05 | 2024-01-05 |
| `f0833999-...` | CSRD - Transport Sector Implementation | null | in_force | 2026-05-05 | 2026-05-05 | 2024-01-05 |

A fifth row visible via the supersession ledger: `8ef75b0c-...` (`CSRD 250+ employees threshold`, status=`superseded`) is the OLD row, replaced by `87493612-...` per `item_supersessions.id=fcfc4401-...` with note `Omnibus raised company size threshold from 250 to 1,000 employees. Companies in scope dropped from ~50,000 to ~5,000. Wave 2 delayed by 2 years.` Supersession date 2026-02-01.

**Chain navigability**: PARTIAL. `item_supersessions` carries one explicit `8ef75b0c → 87493612` edge tagged with the Omnibus narrative. `item_cross_references` has 4 rows fanning out from `87493612` with `relationship='related'` to four non-arc targets. The chain `8ef75b0c (250-emp threshold, superseded) → 87493612 (CSRD, monitoring)` is real and queryable; it stops there. The 2026-05-05 backfill rows have `replaced_by=null` and no supersession ledger entries; stylistically siblings but not linked. The 2026-05-06 ESRS revision is absent and cannot supersede anything.

**Surface check**: all four arc items are domain=1, is_archived=false, visible on `/regulations`. Two of them (`9c5d1d17`, `f0833999`) read as a near-duplicate pair to a user.

### 1.4 Failure-mode determination

**Mode A: not in registry.** The most-on-target source for the trigger event, `finance.ec.europa.eu`, is not in the registry. ESG Today's coverage is in the registry but the EU Commission's own finance-directorate news page that hosts the draft is not. Verdict: **A applies for finance.ec.europa.eu**.

**Mode B: ingestion silently failing.** EFRAG and ESG Today both have `last_checked=null`, `last_scanned=null`, `last_intelligence_item_at=null`, zero `agent_runs`, zero `raw_fetches`. The cold-start backfill has not yet swept these two. ESG Today's RSS feed URL is well-formed; access is RSS, not scrape. EFRAG's access_method is `scrape`, no RSS feed URL on file. Both are functionally dormant despite being registered. There is no error trail because no run has been attempted. Verdict: **B applies for both EFRAG and ESG Today**.

**Mode C: selection logic excluded.** EFRAG's status is `provisional`, not `active`. Whether the cold-start filter set excludes provisional rows is a question for the in-flight classification-rules audit. Even active sources have not been swept (718 active sources have `last_intelligence_item_at=null`), so C is not the proximate cause for ESG Today. Verdict: **C applies as a secondary factor for EFRAG**.

**Mode D: misclassified or hidden.** Zero items mention ESRS or EFRAG by name across `intelligence_items`. There is no item-record to misclassify or hide. Verdict: **D does not apply**.

**Mode E: wrong channel monitored.** The 7 `ec.europa.eu` sources flagged as `access_method=rss` all share a SINGLE rss_feed_url: the press-corner aggregate feed, not per-DG feeds. A draft published at `finance.ec.europa.eu/news` may not appear in the press-corner aggregate; even if it does, attribution to the finance directorate is lost. EFRAG has scrape access pointed at `/sustainability-reporting`, not at the announcements channel `efrag.org/news` (which has its own RSS at `efrag.org/news/rss`, not in the registry). Verdict: **E applies for the ec.europa.eu cluster and for EFRAG**.

**Ranking**:
1. **B (ingestion silently failing)** dominant. EFRAG and ESG Today are registered, configured, and have zero fetch attempts.
2. **A (not in registry)** for `finance.ec.europa.eu` specifically.
3. **E (wrong channel monitored)** as a structural co-factor across the 7 press-corner-aggregate sources and EFRAG's wrong scrape path.
4. **C (selection logic excluded)** as a contributing factor for EFRAG (provisional status).
5. **D** does not apply.

A sixth mode is named but not added to A-E: **registry-to-ingestion handoff gap**. Sources are added (via `provisional_sources` upgrade or `canonical_source_candidates` approval) with `last_checked=null`. Nothing schedules an immediate first-fetch on insert. Cold-start is the only sweep, runs on operator command, and between cold-starts new sources are dormant.

## Phase 2: Curation methodology + coverage matrix

### 2.1 Written methodology

Searched `fsi-app/README.md`, `fsi-app/STATUS.md`, `fsi-app/.claude/CLAUDE.md` (795 lines), `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` (814 lines), and `dotfiles/docs/*.md` matching `curation`, `source`, `registry`, `methodology`, `intake`.

**Quote what exists**:

`fsi-app/.claude/CLAUDE.md` line 133, the entire `## Source Registry` section:
> Source registry counts and current state visible at /admin Source Health Dashboard. Counts move per commit; static doc claims here would always drift.

`fsi-app/STATUS.md` line 156, "API-first source retrieval":
> When a source has a free public API, the registry record uses access_method='api' and points at the canonical API endpoint, not a docs page or the human-facing portal. Browserless is the fallback for sources without APIs, not the default. New sources are evaluated for an API equivalent at intake.

`SKILL.md` line 652, "Source Type Hierarchy":
> When encountering conflicting information, weight sources in this order: 1. Binding law and regulation 2. Regulator guidance and interpretation 3. Intergovernmental body position 4. Industry body interpretation 5. News reporting 6. Analysis and opinion.

`SKILL.md` line 665, "Priority Source Registry": a flat enumeration of ~30 named sources (IMO, EUR-Lex, EU CLIMA, CBAM, FuelEU, ReFuelEU, EUDR, EPA, CARB, ICAO, UNFCCC, World Bank, EMSA MRV, FIATA, ICCT, Smart Freight Centre, GHG Protocol, SBTi, ISSB/IFRS, EU Council, EU Commission, IEA, Climate Laws, Federal Register, Sabin Center, EEA, CDP, ISO, Maritime Carbon Intelligence) plus regional bookends (Asia and LatAm gazettes; FreightWaves, GreenBiz, Reuters Sustainable Business, Lloyd's Register, etc.).

The above four quotes are the totality. **No document specifies a category-by-jurisdiction-by-vertical coverage target. No document defines the criteria for source presence per cell. No document defines the gap-detection process or what triggers a coverage-gap escalation.** `finance.ec.europa.eu` is not on the SKILL.md priority list. EFRAG is not on it. ESG Today is not on it. The `coverage_gaps` table (migration 061) carries 2 rows; the populating logic is procedural inside cold-start and undocumented.

**Verdict: written source-curation methodology is effectively absent.** The closest artifacts are (a) the SKILL.md priority registry (a flat list, not a coverage matrix, not gap-aware, no last-reviewed metadata), and (b) the source-type hierarchy (a 6-tier weighting for conflict resolution, not a registration rule).

### 2.2 Coverage matrix

Built from `sources` at snapshot. Roles inferred via `intelligence_types` keyword classification.

Aggregate role distribution across all 783 sources:

```
regulatory_or_guidance:   727  (93%)
market_news:               29  (4%)
research:                  25  (3%)
industry_or_innovation:     2  (<1%)
unclassified:               0
```

Confirms the four-page survey's structural pattern: registry overwhelmingly regulatory; market_news and research are single-digit-percent.

**Top jurisdictions by source count** (jurisdiction_iso, top 15):

| Jurisdiction | Source count |
|---|---:|
| GLOBAL | 206 |
| US | 80 |
| EU | 80 |
| GB | 25 |
| US-CA | 14 |
| SG | 12 |
| US-NY | 7 |
| US-WA | 7 |
| US-PA | 6 |
| US-GA / US-KS / US-IL / US-TX / AE-DU | 5 each |
| US-FL | 4 |

**Vertical_tags distribution**: 13 sources of 783 carry any vertical_tag (`dangerous-goods` 4, `cold-chain` 3, `chemicals` 3, `pharma` 1, `agriculture` 1, `bulk-commodity` 1, `oil-gas` 1). **Zero sources** carry `vertical_tags` for any of the operator's six verticals (`fine_art`, `live_events`, `luxury`, `film_tv`, `automotive`, `humanitarian`). Schema field exists; data does not.

**Category x jurisdiction matrix** (inferred role across 783 sources):

| Jurisdiction | Regulatory | Research | Market news | Industry/Innov |
|---|---:|---:|---:|---:|
| EU | 78 | **1** | **1** | 0 |
| GLOBAL | 163 | 19 | 22 | 2 |
| US | 72 | 2 | 6 | 0 |
| UK (probed as `UK`, registry uses `GB`) | 0 | 0 | 0 | 0 |
| DE | 2 | 0 | 0 | 0 |
| FR | 3 | 0 | 0 | 0 |
| JP | 3 | 0 | 0 | 0 |
| CN | 1 | 0 | 0 | 0 |
| AE | 0 | 0 | 0 | 0 |
| SG | 12 | 0 | 0 | 0 |
| BR | 0 | 0 | 0 | 0 |
| CA | 2 | 0 | 0 | 0 |

**Zero-coverage cells** in this slice: `UK x all roles` (GB has 25 sources whose role split was not separately computed in this script slice; the 0 here is the `UK` probe miss), `AE x all roles`, `BR x all roles`. **Low-coverage cells**: `EU x research = 1`, `EU x market_news = 1`, `US x research = 2`, plus all non-regulatory cells for DE, FR, JP, CN, SG, CA = 0. **The single EU x research and single EU x market_news cells are striking**: the EU is the operator's densest-regulation jurisdiction and has effectively no research or market-news coverage.

**Category x vertical matrix** (vertical_tags x inferred role): for all six operator verticals plus variant tag spellings (`fine-art`, `art-museums`, `live-events`, `events`, `film-tv`, `filmtv`, `high-value-auto`): **every cell is zero**. The thirteen sources that DO have vertical_tags carry shippable-cargo-class tags (`dangerous-goods`, `cold-chain`, `pharma`, `chemicals`), operationally useful for sub-vertical cargo but unmapped to the operator's vertical-customer framing.

**Sustainability-reporting topical coverage**: 111 sources (14%) have `topic_tags` or `intelligence_types` matching `report|sustainab|csrd|esrs|efrag|disclosure|esg|cdp|gri`. EFRAG is one of the 111. ESG Today is NOT (empty topic_tags). Of the 111, only EFRAG and the 7 `ec.europa.eu` rows are EU-jurisdiction primary publishers, and ALL of them have `last_intelligence_item_at=null`.

### 2.3 Candidate primary-publishing bodies

Coverage map below. Read-only enumeration, not a recommendation list. Format: `name | URL | role | in registry yes/no | confidence high/medium/low`.

**EU x sustainability-reporting / regulations**:
- EU Commission DG FISMA finance directorate | finance.ec.europa.eu/news | regulatory + market_news | **no** | high
- EFRAG (sustainability reporting standards body) | efrag.org/news | regulatory (technical advice) | **yes (provisional, dormant)** | high
- ESMA Sustainable Finance | esma.europa.eu/policy-activities/sustainable-finance | regulatory | no | high
- EBA Sustainable Finance | eba.europa.eu/regulation-and-policy/sustainable-finance | regulatory | no | medium
- ISSB (IFRS) | ifrs.org/sustainability | regulatory (standards) | partial (in SKILL.md priority list, registry status not separately verified) | high
- GRI | globalreporting.org | regulatory (standards) | no | high

**EU x research / horizon**:
- Joint Research Centre (JRC) | joint-research-centre.ec.europa.eu | research | no | high
- European Topic Centre on Climate Mitigation | eionet.europa.eu/etcs/etc-cme | research | no | medium
- Transport & Environment | transportenvironment.org | research + advocacy | unverified | medium
- Bruegel | bruegel.org | research | no | medium

**EU x market_news**:
- ESG Today | esgtoday.com | market_news + competitor-intercept | **yes (active, dormant)** | high
- Carbon Pulse | carbon-pulse.com | market_news | no | high
- Responsible Investor | responsible-investor.com | market_news | no | medium
- ESG Investor | esginvestor.net | market_news | no | medium
- Sustainable Views (FT) | sustainableviews.com | market_news | no | medium

**US x sustainability-reporting**:
- SEC Climate Disclosure | sec.gov/news | regulatory | unverified | high
- Treasury Sustainable Finance | home.treasury.gov/policy-issues/financing-the-economy/sustainable-finance | regulatory | no | medium

**Vertical cells (all six are zero in the registry; candidates per vertical, none currently in registry unless noted)**:

- Fine art and museum logistics: ICOM (icom.museum, industry watch, medium); Gallery Climate Coalition (galleryclimatecoalition.org, industry standards + research, high); AAM Sustainability (aam-us.org, industry watch, medium); Bizot Group Green Protocol (bizotgroup.org, industry standards, medium).
- Live events and touring: A Greener Future (agreenerfuture.com, research + industry standards, high); Julie's Bicycle (juliesbicycle.com, research, high); Live Nation sustainability (livenationentertainment.com/sustainability, industry watch, low).
- Luxury goods: Watch & Jewellery Initiative 2030 (wj2030.org, industry standards, medium); Responsible Jewellery Council (responsiblejewellery.com, regulatory standards, medium); Kering Sustainability Reporting (kering.com, industry watch + competitor, low); LVMH Environment (lvmh.com, industry watch, low).
- Film and TV production: albert / BAFTA sustainability (wearealbert.org, industry standards, high); Producers Guild of America Green (producersguild.org, industry standards, medium); Sustainable Production Forum (sustainableproductionforum.com, industry watch, low).
- High-value automotive: Hagerty Insurance market index (hagerty.com/media/market-trends, market_news, medium); FBHVC (fbhvc.co.uk, industry watch, low); FIVA (fiva.org, industry watch, low).
- Humanitarian cargo: UN OCHA Logistics Cluster (logcluster.org, regulatory + operational, high); ALNAP (alnap.org, research, medium); WFP Logistics (wfp.org/logistics, operational, medium); ICRC logistics (icrc.org, operational, medium); Humanitarian Logistics Association (humanitarianlogistics.org, industry watch, low).

**Cross-vertical air freight (operator's primary mode)**: TIACA (tiaca.org, industry watch, medium); IATA Cargo iQ (cargoiq.org, industry standards, medium); EUROCONTROL Sustainability (eurocontrol.int/sustainability, regulatory + research, high).

The list is illustrative, not exhaustive. Pattern across cells: every operator vertical has zero registry presence; most jurisdiction-level sustainability-reporting cells outside `EU regulatory` and `GLOBAL regulatory` are zero or single-digit.

## Phase 3: Architectural primitives

### 3.1 Source health monitoring (heartbeat, last-seen, silence-alert): PARTIAL

**Last-seen**: `sources.last_checked` non-null on **182 of 783** (23%). `sources.last_scanned` non-null on **182 of 783** (same 23%, identical to last_checked). `sources.last_intelligence_item_at` (set on item INSERT keyed to source, added in 054) is **non-null on 0 of 783**. **0 of 718 active sources have ever produced an intelligence_item per this column**. Either the trigger is not firing or the cold-start INSERT path does not exercise it. (Cross-check from primitives audit: cold-start does not write `intelligence_item_id` on the corresponding `agent_runs` UPDATE; same root-cause shape likely.)

**Heartbeat**: PARTIAL. `sources.consecutive_accessible`, `total_checks`, `successful_checks`, `accessibility_rate` exist and are auto-recomputed by trigger when accessibility events fire. `agent_runs` records per-run `status`; snapshot shows 905 total with 582 success and 322 error. No materialised heartbeat table exists. No "200 with no items" telemetry distinct from "200 with items"; both register as `agent_runs.status='success'`.

**Silence-alert**: ABSENT. No logic flags a source idle for N days. The 30-day idle check via `last_intelligence_item_at < cutoff` returns 0 because the column is universally null. The 718-active-never-produced-item count is a stronger signal but no code path consumes it as an alert.

**`source_health_summary` VIEW**: present, queryable, returns 12 aggregate rows by `(tier, status)` with counts of `(source_count, avg_trust_score, active_count, stale_count, inaccessible_count, overdue_count)`. Dashboard-backing rollup, not a per-source health row. `overdue_count` is the closest aggregate-level silence-alert signal: 29 of 338 tier-1-active flagged overdue. Does not surface which specific sources are overdue and does not differentiate "overdue but never fetched" (the EFRAG / ESG Today case) from "overdue after a long history of producing".

Verdict: **PARTIAL**. Schema mostly present, data partially populated, silence-alert logic absent.

### 3.2 Primary-source intercept telemetry (time-from-primary-publication-to-surfaced-item): ABSENT

`intelligence_items` has 8 date-like columns plus the regulation-lifecycle dates `entry_into_force` and `compliance_deadline`. **None captures the original publication timestamp at the source.** `created_at` is the ingest timestamp. `added_date` is set to the same date by cold-start (verified on the four arc rows, where cold-start rows have `added_date == created_at` to the day; on seed-data rows, `added_date` sometimes carries an editorial estimate of the source-publish date but inconsistently). `entry_into_force` is the regulation effective date, not the source publish date.

**`raw_fetches.fetched_at`** captures fetch time (ingest time). RSS items carry `pubDate` in the source XML; nothing on `raw_fetches` or `intelligence_items` stores that. Even when fetching via RSS (where original publication time is in the feed), the value is dropped.

Time-from-primary-publication-to-surfacing cannot be computed for any item: the denominator (source publish time) is not stored anywhere. Even if a row had been created for the 2026-05-06 ESRS draft, the schema has no field to store "source published 2026-05-06T09:15Z".

Verdict: **ABSENT**. No column on `intelligence_items` or `raw_fetches` or `agent_runs` captures the original publication timestamp at the source.

### 3.3 Regulatory-arc entity (groups items in development chains): PARTIAL

**`item_supersessions`** schema: `(id, old_item_id UUID FK, new_item_id UUID FK, supersession_date DATE, severity TEXT IN ('major','minor'), note TEXT, created_at)`. 5 rows. Each row is a single replace-relationship, not a multi-stage development chain. The Omnibus row (`fcfc4401-...`) carries the substantive change in `note`; the annotation is on the supersession row, not on either item. **No "version number within an arc" field, no "stage-of-development" field, no `arc_id` foreign key linking multiple items into the same evolutionary chain.**

To represent `draft → consultation → adopted → effective`, today's options are (a) chain N supersession rows, or (b) use `intelligence_items.replaced_by` (single-direction self-FK, null on all four arc rows). Both options model the chain as a linked list, not as an arc entity with stages.

**`item_cross_references`** schema: `(id, source_item_id UUID FK, target_item_id UUID FK, relationship TEXT IN ('related','supersedes','implements','conflicts','amends','depends_on'))`. 49 rows. Six relationship types, including `supersedes` and `amends` which could express arc edges. The 4 arc-touching cross-references are all `related`; no `supersedes` / `amends` rows for the Omnibus arc.

**Separate "arc" entity**: ABSENT. No `regulatory_arcs`, `development_chains`, or `item_arc_membership` table in migrations 001-061. Closest in code: `intersection_summary` field on `intelligence_items`, but that captures cross-cutting topical intersections, not chronological development chains.

Verdict: **PARTIAL**. Supersessions + cross-references can express a chain as a graph of edges, but neither is shaped as an arc-with-stages, and neither is consistently populated (5 supersessions for 644 items, 49 cross-references for 644 items, both effectively manual).

### 3.4 Editorial framing layer (analyzer output includes notable context beyond summary): PARTIAL

**`intelligence_items.full_brief`** present on **164 of 644 items (25%)**. Per SKILL.md emission contract, the brief is markdown-structured with sections `What Is It`, `Why It Matters`, `Operational Impact`, `Open Questions`, `Reasoning`, `Severity Label`, plus YAML metadata frontmatter. Sibling columns `what_is_it`, `why_matters`, `key_data`, `operational_impact`, `open_questions`, `reasoning`, `intersection_summary` are co-extracted from the brief. So `full_brief` carries analyst-style framing where it exists; the 480-row gap (75%) is items where the brief has not been generated.

**Notable context beyond basic summary** (operator framing: editorial commentary, op-ed-style framing, contradictory perspectives, "here is why this matters in the context of the broader arc," "competitor narrative versus regulator signal"): none of those concepts is shaped in the schema. No `editorial_commentary`, `contradictory_perspectives`, or `competitor_narrative` column. `intersection_summary` is the closest, but it is shaped to describe cross-item topical overlap (CSRD x EU ETS), not editorial framing. `intelligence_summaries` (legacy 2,310-row table, shelved) carries `(id, item_id, sector, summary, urgency_score, generated_at, model_version)`: per-sector summary text and a model-version stamp, no editorial-commentary field. `agent_integrity_flag` plus `agent_integrity_phrase` exist (migration 035) but are quality-control flags, not framing.

Verdict: **PARTIAL**. The brief structure (full_brief, why_matters, open_questions, intersection_summary) carries analyst-style framing for items that have a brief (164 of 644). Editorial commentary, contradictory perspectives, op-ed-style framing as distinct concepts are absent from the schema. `intelligence_summaries` is a partial framing layer along the sector axis but is shelved.

## Methodology + caveats

**Snapshot strategy**. Captured `SNAPSHOT_AT` at the start of the diagnostic run. All counts are point-in-time at `2026-05-10T03:18:35.452Z`. Cold-start is writing concurrently; counts will move. Distributions are approximate to the snapshot moment.

**Data accessed (read-only)**: `sources` (full table for matrix; targeted URL+name substring search for the four named probes), `intelligence_items` (date+keyword targeted searches; full counts; spot reads of arc rows), `agent_runs` (status distribution by matched IDs; full count), `raw_fetches` (count; targeted query for matched IDs), `item_supersessions` (full table), `item_cross_references` (count plus arc-touching query), `intelligence_summaries` (count, single-row column shape), `source_health_summary` view. Three throwaway scripts at `fsi-app/scripts/_coverage-temp{,2,3}.mjs`, all deleted.

**Heuristics**: role inference uses permissive `intelligence_types` keyword buckets (REG/STD/GUIDE etc to regulatory_or_guidance; RES to research; MKT/NEWS to market_news; INN/IND/SUP to industry_or_innovation). The four-page survey's URL+name regex classifier is stricter. Topic-coverage probe for "sustainability reporting" matches `topic_tags` plus `intelligence_types` against `/report|sustainab|csrd|esrs|efrag|disclosure|esg|cdp|gri/`; ESG Today's empty topic_tags excluded it from the 111-source result. Top-jurisdictions extended to top 15 to surface `GB` separately from `UK`; the matrix probed `UK` literally and reads zero, while the GB row (25 sources) was not separately broken out by inferred role. May-2026 ESRS query used 2026-05-01 to 2026-05-09 `created_at` window plus a fallback all-time `ESRS` query (returned the same 2 backfill-seed CSRD rows).

**Discrepancies and notes**:
- `EU CSDDD` source URL is a stale Growth-DG path (current canonical is on `commission.europa.eu`). Registry-data-quality issue separate from the ESRS miss.
- Whether `provisional` status excludes rows from cold-start sweep is a question for the in-flight classification-rules audit.
- `last_intelligence_item_at` null on all 783 sources is the strongest single signal in this audit. Indicates a trigger or write-path gap in cold-start INSERT. Primitives audit traced parallel issue with `agent_runs.intelligence_item_id` null on 791 of 791; likely same root cause.
- 718 active-sources-never-produced-an-item is a starting-state snapshot during cold-start, not a steady-state pattern.
- Mode-A determination for `finance.ec.europa.eu` is robust (zero URL matches). Mode-B for EFRAG and ESG Today is robust (direct row reads confirm all timestamp fields null, zero agent_runs and raw_fetches).
- Phase 2.3 candidate list is illustrative; highest-leverage gaps (EU sustainability-reporting + the six operator verticals) prioritised.

## Final result for caller

Doc location: `C:/Users/jason/dotfiles/docs/source-coverage-diagnostic-2026-05-09.md`.

**Failure-mode determination**: B (ingestion silently failing) dominant; A (not in registry) for finance.ec.europa.eu specifically; E (wrong channel monitored) as a structural co-factor across the seven `ec.europa.eu` press-corner-aggregate-feed sources; C (selection logic excluded) as a contributing factor for EFRAG (provisional). D does not apply. A sixth mode is named in the analysis: registry-to-ingestion handoff gap (newly-added sources have no scheduled first-fetch and remain dormant until next cold-start sweep).

**Zero-coverage matrix cells**: 24 in the vertical slice (all 6 operator verticals × 4 inferred roles), plus ~25 in the jurisdiction slice (UK/AE/BR x all roles, plus DE/FR/JP/CN/SG/CA x non-regulatory roles). Total: ~49 zero cells. Plus ~6 single-digit-low cells (`EU x research = 1`, `EU x market_news = 1`, `US x research = 2`).

**Architectural primitives count**: 0 PRESENT, 3 PARTIAL, 1 ABSENT across the four named primitives. Source health monitoring: PARTIAL. Primary-source intercept telemetry: ABSENT. Regulatory-arc entity: PARTIAL. Editorial framing layer: PARTIAL.

**Methodology audit verdict**: written source-curation methodology is effectively absent. Closest artifacts are SKILL.md priority registry (flat ~30-source list, no coverage matrix, no cell-level targets, no last-reviewed metadata) and SKILL.md source-type hierarchy (6-tier weighting for conflict resolution, not a registration rule).

## Related

- [[primitives-audit-2026-05-09]] — Parallel same-day audit that cross-references this one and confirms the identical last_intelligence_item_at / agent_runs FK write-path gap
- [[registry-to-ingestion-handoff-design-2026-05-10]] — Names the 'registry-to-ingestion handoff gap' (dormant new sources, no scheduled first-fetch) that design doc addresses
- [[source-map-existence-check-2026-05-10]] — That check verifies this diagnostic's four EU-ESRS source verdicts against a next-day snapshot (ESG Today flipped to healthy)
- [[source-map-from-esgtoday-2026-05-09]] — This diagnostic (ESG Today as canary) directly seeds that source-registry-expansion map covering the missing EU-ESRS + vertical bodies
- [[REGIONAL-DATA-COLLECTION-AUDIT]] — Both diagnose jurisdictional source-coverage gaps against the tier taxonomy
