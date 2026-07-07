> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Caro's Ledge ingestion primitives audit, 2026-05-09

## Snapshot context

- Snapshot timestamp: `2026-05-10T03:04:35.288Z` (UTC).
- `intelligence_items` row count at snapshot: 584. Cold-start (`fsi-app/scripts/wave1-cold-start.mjs`) is writing concurrently; counts will continue to climb.
- `agent_runs` row count at snapshot: 791. Of those, 0 carry an `intelligence_item_id` FK link, 474 carry a `raw_fetch_id` link, 0 carry an `intelligence_item_version_id`.
- `raw_fetches` row count: 478. `intelligence_item_versions` row count: 0 (table exists, trigger never fired in production yet because no UPDATE has touched any of the seven distinct-clause columns; the cold-start path is INSERT-only).
- `ingestion_control_log` row count at snapshot: 0. The cold-start kill switch path that writes `auto_run_disabled` rows runs at end of cold-start, not yet reached.
- `taxonomy_nodes` row count: 38 (defined in migration 007; see Primitive 1 (c) for category-membership note).
- A fetch-quality filter is in flight at `src/lib/sources/fetch-quality.ts`. The TypeScript file is not yet present in the working tree at this audit; only the .mjs port at `scripts/lib/fetch-quality.mjs` consumed by `wave1-cold-start.mjs`. Treated as in-flight noise per dispatch.
- This audit cites and extends `dotfiles/docs/four-page-architecture-survey-2026-05-09.md` and `dotfiles/docs/topic-relevance-investigation-2026-05-09.md`. It does not duplicate their findings on schema-shape gaps or 9.3 percent topic-relevance pollution.

## TL;DR

| Primitive | Verdict |
|---|---|
| 1. Rule-based exhaustive item classification | ABSENT |
| 2. Provenance to fetch-level on every item | PARTIAL |
| 3. Source registry declares expected scope | ABSENT |
| 4. Item lifecycle states with auditable transitions | PARTIAL |
| 5. Schema supports content shapes beyond text-summary | ABSENT |
| 6. Item-level cost and classifier telemetry | PARTIAL |
| 7. Classifier and gate versioning | ABSENT |
| 8. Source health monitoring (heartbeat, drift, scope-change) | PARTIAL |
| 9. Reversibility / auditability of curation actions | PARTIAL |

Roll-up: 0 PRESENT, 5 PARTIAL, 4 ABSENT.

The highest-leverage gap is Primitive 1. Today the only category axis on `intelligence_items` is the 12-value `item_type` CHECK constraint plus the seven-value `domain` integer, neither of which encodes the operator's four operator-facing pages (Regulations, Research, Market Intel, Operations) plus `Out of Scope` plus optional `Industry Watch`. The four pages are reconstructed from `item_type IN (...)` and `domain IN (...)` filters in TypeScript route handlers, with no exhaustive partition: an item can be unambiguously a `regulation` and unambiguously `domain=1` and still not deterministically belong to any one of the operator's four pages, and there is no `Out of Scope` value any code path can write. Every other primitive can be retrofitted (FK links written by the cold-start patch, classifier-version columns added, ingestion_control_log widened) without rewriting items. Primitive 1's gap forces a one-time relabeling of the 584 existing rows because today's category axes do not partition them into the operator's six categories.

## Per-primitive findings

### 1. Rule-based exhaustive item classification

#### (a) Inclusion rules per category: ABSENT

There is no formal category enum or CHECK constraint on `intelligence_items` that names the six operator categories (`Regulations`, `Research`, `Market Intel`, `Operations`, `Out of Scope`, `Industry Watch`). The closest things in the schema are:

- `intelligence_items.item_type` CHECK constraint (`004_source_trust_framework.sql:138-143`) with 12 values: `regulation`, `directive`, `standard`, `guidance`, `technology`, `market_signal`, `regional_data`, `research_finding`, `innovation`, `framework`, `tool`, `initiative`. None of the 12 values is named `out_of_scope` or `industry_watch`. None of them is named `regulations`, `research`, `market_intel`, or `operations` either; the operator's page names are not category labels in the schema.
- `intelligence_items.domain` CHECK constraint (`004_source_trust_framework.sql:135`) with values 1..7: `regulations and policy`, `technology and innovation`, `operations and infrastructure`, `markets and economics`, `humanitarian and resilience`, `energy and facilities`, `other / horizon`. The seven domains overlap the four operator pages but do not partition them: `domain=1` is loaded onto `/regulations` only, while `/operations` reads `domain=3` plus `domain=6` plus `item_type='regional_data'`, and `/market` reads `domain=2` plus `domain=4` plus `item_type IN ('technology', 'innovation', 'market_signal')`. Per-page filtering rules are listed in the four-page survey, sections 4.3 and 4.4.
- The Haiku classifier prompt (`src/lib/llm/haiku-classify.ts:79-121`) emits a value for `item_type` from the same 12-value vocabulary plus a `severity`, `priority`, `urgency_tier` triple. The prompt never asks the model to assign one of `Regulations / Research / Market Intel / Operations / Out of Scope / Industry Watch`; those concepts do not appear in the prompt at all.
- The verification prompt (`src/lib/llm/haiku-classify.ts:37-73`, mirrored at `src/lib/sources/verification.ts:204-240`) emits `ai_relevance_score`, `ai_freight_score`, `ai_trust_tier`. These are source-level eligibility scores, not item-level category assignments.
- The route-level filters that reconstruct the four pages live in `src/components/pages/MarketPage.tsx` and `OperationsPage.tsx` (per the four-page survey, section 4) as TypeScript predicates. These predicates are inclusion rules in the procedural sense but are not visible in the schema, are not exhaustive (an item with `item_type='guidance'` and `domain=5` matches none of the four pages and does not get an explicit `Out of Scope` placement), and overlap each other in places (e.g., `regional_data` is read by both `/operations` and the legacy "regional" tab).

Per-category breakdown:

- `Regulations`: PARTIAL informal rule. The `/regulations` page filter is `domain=1 AND is_archived=false` (`src/app/regulations/page.tsx:33-59`). Cardinality at snapshot: 525 of 584 items are domain=1. No CHECK constraint, no enum, no comment in the schema asserting that domain=1 IS Regulations.
- `Research`: PARTIAL informal rule. The `/research` page filter is `is_archived=false`, then a client-side `pipeline_stage` filter via `ResearchView.normalizeStage` treating null as published (per four-page survey section 4.2). There is no source-role gate or item-type gate distinguishing research-finding items from regulations; the page draws from the same domain-1 dominant pool. The 24 `item_type='research_finding'` rows at snapshot are not the basis for the Research page selection.
- `Market Intel`: ABSENT formal rule. The `/market` page filter is `r.type IN ('technology', 'innovation', 'market_signal') OR r.domain IN (2, 4)` in `MarketPage.tsx`. This is a TypeScript OR-predicate against a free-form bag of values, not a category membership rule. It overlaps `Operations` (a `domain=4` regional_data row could match both pages on first-match-wins client logic) and excludes other items that operators might call market intel (e.g., `framework` items about carbon pricing).
- `Operations`: ABSENT formal rule. The `/operations` page filter is `r.type === 'regional_data' OR r.domain IN (3, 6)` (per four-page survey section 4.4). Same shape and same overlap concern as Market Intel. The page already self-discloses that the data is sparse via "Coming soon Phase D" copy.
- `Out of Scope`: ABSENT. There is no enum value, no CHECK constraint constant, no `item_type='out_of_scope'`, no `domain=0`, no `taxonomy_nodes` row labelled out-of-scope (the 38 taxonomy_nodes rows from migration 007 are the regulation-hierarchy / technology-category / region-code taxonomy used by `vendor_technologies`, not item-category taxonomy). The `intelligence_items.is_archived` boolean plus `archive_reason TEXT` (free-text) is the closest thing today. The topic-relevance investigation (problem 1, decision 1) recommended that 37 garbage-extraction items be hard-deleted and 2 truly off-topic items be flag-and-hidden via `is_archived=true` with `archive_reason='off_topic'`. Cardinality at snapshot: 11 rows have `is_archived=true`, with `archive_reason` values `Superseded` (3), `Repealed` (1), `duplicate` (1), `source_url_unverifiable_no_replacement_found` (1), and 5 rows where `archive_reason` is null. None of those 5 archive_reason values matches an `out_of_scope` semantic; the closest is `duplicate`.
- `Industry Watch`: ABSENT. No enum value, no CHECK constraint, no comment in any migration mentioning the term. Did not appear in any of the four .ts files reviewed nor in `.claude/CLAUDE.md` nor in `SKILL.md`.

Verdict (a): ABSENT. Six operator categories, zero schema artifacts naming five of them and one (`Regulations`) only inferred from a single-column filter without any constraint or comment asserting the relationship.

#### (b) Re-classification determinism on existing 584 items: ABSENT

Reasoned estimate against a sample of 20 items spanning the live distribution (sampled via `select id, item_type, domain, pipeline_stage, status, topic_tags, archive_reason, regeneration_skill_version from intelligence_items limit 2000` with the first 20 inspected in the throwaway audit script):

- 12 of 20 are `item_type='regulation' AND domain=1`. By the `/regulations` page filter, all 12 land in `Regulations`. Unambiguous in the page-filter sense. But: the four-page survey notes 388 of 446 (now 525 of 584) items are domain=1, and the `/regulations` page does no item_type narrowing, so a `framework` or `directive` item with `domain=1` (and there are 117 framework rows and 13 directive rows total) would also be on `/regulations`, yet the operator may consider some of those Industry Watch (e.g., a national-assembly homepage scrape with `topic_tags=['parliamentary_activity', 'legislative_processes']`, observed at id `851a8e5a-...` in the sample). Determinism check: the procedural filter is deterministic; the operator's category intent is not encoded.
- 1 of 20 is `item_type='market_signal' AND domain=4` (id `262ac5f2-...`). Lands deterministically in `Market Intel` per `MarketPage.tsx`. Unambiguous.
- 2 of 20 are `item_type='technology' AND domain=2`. Land deterministically in `Market Intel` (Tech tab). Unambiguous.
- 2 of 20 are `item_type='regional_data' AND domain=3`. Land deterministically in `Operations`. Unambiguous.
- 1 of 20 is `item_type='regional_data' AND domain=1` (id `95549473-...` with `topic_tags=['system_status', 'website_availability', 'technical_issue']`). Ambiguous: matches `/operations` filter on `r.type === 'regional_data'` AND matches `/regulations` filter on `domain=1`. The page filters are first-match-wins per route, not partitioned, so this row appears on both pages. Per the operator framing, it should land in `Out of Scope` (it is a Cloudflare-block garbage-extraction sibling per the topic-relevance investigation), but no such category exists.
- 1 of 20 is `item_type='framework' AND domain=5` (id `0c03b4bd-...`). Lands on no operator page. The `/regulations` filter rejects it (not domain=1). The `/research`, `/market`, `/operations` filters all reject it. It appears in no surface today. By the operator's exhaustive partition, it should land in `Out of Scope` or `Industry Watch`. Today it is invisible.
- 1 of 20 is `item_type='tool' AND domain=5` (id `72be8dd3-...`). Same as above: no page picks it up.

Extrapolating to 584 rows:

- Items with `domain=1`: 525 (90 percent). Land on `/regulations` deterministically by the current filter. Operator-intended assignment within those 525 is ambiguous between `Regulations`, `Industry Watch`, and `Out of Scope` because the topic-relevance investigation showed that a measurable subset (39 of 419 surveyed = 9.3 percent of domain=1 items) are pollution and not Regulations.
- Items with `domain` in 2 or 4 (technology / markets): 27 rows. Deterministic to `Market Intel`.
- Items with `domain` in 3 or 6 (operations / energy-facilities): 14 rows. Deterministic to `Operations`.
- Items with `domain=5` (humanitarian) or `domain=7` (other / horizon): 18 rows. Match no page filter. Today invisible. Operator-intended assignment: unknown.
- Items with `item_type='regional_data'` whose `domain=1`: not separately counted in the snapshot dump but the four-page survey notes 47 regional_data items across the table; the topic-relevance investigation notes that some of those are misextracted Cloudflare blocks. Ambiguous between `Operations` and `Out of Scope`.

Reasoned ballpark: of 584 items, roughly 525 land on `/regulations` (90 percent) but only because the filter is permissive. Roughly 27 land deterministically on `/market`, 14 on `/operations`, 0 deterministically on `/research` (`/research` filters by pipeline_stage which 398 rows have null on, so the 186 published-stage rows are the candidate pool but none of the operator's research-source-role declarations exist). Roughly 18 land on no page at all. None land in `Out of Scope` because the value does not exist. Plus an estimated 30 to 60 items (extrapolating the 9.3 percent pollution rate from the topic-relevance investigation) currently sit in `Regulations` that the operator would re-assign to `Out of Scope` or to a fetch-failure-disposition bucket on a re-classification pass.

Verdict (b): ABSENT. The current schema cannot produce a deterministic six-bucket partition over 584 rows even procedurally; one of the six buckets has no representation, two more are under-defined or invisible, and an estimated 5 to 10 percent of items would need a category that does not yet exist.

#### (c) `Out of Scope` and `Industry Watch` as schema-real: ABSENT

`Out of Scope`: no `item_type` enum value, no `domain` integer, no taxonomy_nodes slug. The closest schema artifact is the pair `is_archived BOOLEAN` plus `archive_reason TEXT` (free-text, no CHECK constraint). At snapshot, 11 rows are archived, and the five archive_reason values seen are `Superseded`, `Repealed`, `duplicate`, `source_url_unverifiable_no_replacement_found`, and null. None semantically maps to `Out of Scope`. The topic-relevance investigation explicitly recommended adding `archive_reason='off_topic'` and `archive_reason='garbage_extraction'`, which would be net-new free-text values rather than constrained enum members. Effectively NULL / absence today.

`Industry Watch`: no schema artifact. No enum value, no taxonomy node, no comment in any migration. Effectively NULL / absence.

Verdict (c): ABSENT for both. To make either real in schema, options visible in the codebase pattern would be (1) a new enum CHECK constraint on `item_type` adding the values, (2) a new column `category TEXT` (the column already exists per `004_source_trust_framework.sql:136` with no CHECK constraint and is currently unused per the audit script's `confidence_dist` and `category` column being absent from the read-back; needs verification), or (3) a `taxonomy_nodes` row keyed to a new `node_type='item_category'`. None are in place.

#### (d) Per-item classification metadata (version, confidence, source-scope-snapshot): PARTIAL

Three sub-checks:

- Classifier version on item: PARTIAL. Column `regeneration_skill_version TEXT` exists on `intelligence_items` (introduced in a migration not in the 001..061 sequence I read end-to-end but visible in the column list, populated by the legacy backfill skill). At snapshot, 155 of 584 rows (27 percent) have a non-null value, all set to `2026-04-29`. The 429 rows where the value is null include all cold-start-inserted rows (the cold-start INSERT in `wave1-cold-start.mjs:454-469` does not write this column). There is no `haiku_classify_version` column distinct from `regeneration_skill_version`; the cold-start Haiku output is not versioned at the row level.
- Confidence score on item: PARTIAL. Column `confidence TEXT` exists on `intelligence_items` (`004_source_trust_framework.sql:162-163`) with CHECK constraint `('confirmed', 'unconfirmed')`. Two-value enum, not a numeric score. At snapshot, 579 rows are `confirmed`, 5 are `unconfirmed`. The Haiku classifier emits a `rationale` (text) but no numeric confidence; the verification pipeline's `ai_relevance_score` and `ai_freight_score` (0..100) are stored on `source_verifications` keyed to the candidate URL, not on the item that the source later produces. There is no per-item numeric `relevance_score` or `topic_match_score`.
- Source-scope-snapshot at ingestion (a snapshot of `sources.topic_tags` / `vertical_tags` captured into the item row so future scope-drift detection has a baseline): ABSENT. The cold-start INSERT writes `topic_tags` from the Haiku classifier output (item-level tags inferred from content) into `intelligence_items.topic_tags`, not from `sources.topic_tags`. There is no `source_topic_tags_at_ingestion` column on `intelligence_items` and no JSONB snapshot field. Future scope-drift detection has no baseline.

Verdict (d): PARTIAL. Version and confidence each have a partial implementation (version sparsely populated and only on legacy rows; confidence is a coarse two-value enum). Source-scope-snapshot is absent.

#### Gap-closing summary for Primitive 1

To close (a)+(b)+(c)+(d) without proposing implementation: the operator's six-category partition must be expressible in schema (CHECK constraint on a new column or extension of `item_type`), the classifier prompt must emit the category assignment as a structured field (not inferred procedurally in route handlers), and a snapshot of the source's declared scope at ingest must be persisted so source-scope-drift can be detected against a frozen baseline. None of these are present today.

### 2. Provenance to fetch-level on every item: PARTIAL

`raw_fetches` exists (`052_raw_fetches.sql`) with one row per successful fetch, keyed `(source_id, content_hash)` UNIQUE. `intelligence_items` has no `raw_fetch_id` FK column; the column list confirms this. `intelligence_item_versions` has no `raw_fetch_id` FK either; it carries `created_by_run_id UUID` (`053_intelligence_item_versions.sql:19`).

The provenance chain is: `agent_runs.raw_fetch_id` → `raw_fetches.id`, and `agent_runs.intelligence_item_id` → `intelligence_items.id` (`057_agent_runs.sql:30-32`). Both FKs exist on `agent_runs`. The cold-start script populates both at the end of a successful run (`wave1-cold-start.mjs:473-487`): `raw_fetch_id` = `persisted.raw_fetch_id`, `intelligence_item_id` = `insertedItemId`. So new (cold-start-produced) items can be traced through `agent_runs` to the producing `raw_fetches` row.

At snapshot, 474 of 791 `agent_runs` rows have `raw_fetch_id` populated (60 percent), but **0 of 791 have `intelligence_item_id` populated**. This contradicts what the cold-start script's update path appears to write at line 484 (the field is set on the same `agent_runs` UPDATE as `raw_fetch_id`). Two possibilities: (1) the cold-start script as currently deployed runs only the agent_runs INSERT (line 399-401, no intelligence_item_id) and the UPDATE in the success path (line 473-487) is reached but the field named `intelligence_item_id` is being silently dropped by Supabase due to a column-name issue; or (2) a sub-shape of the cold-start runs (the `backfill_only` branch at 446-449 plus the `fetch_quality_failed` branch at 414-441) does not write `intelligence_item_id` and they account for all 791 rows so far. The topic-relevance investigation at the `agent_runs FK-linked to polluted items` row reported the same 0 of 642 finding two days ago with note "the FK exists in the schema (migration 057) but is not yet being written by the agent." A fix is in flight per dispatch.

Pre-Wave-1a items: items inserted before migration 052 (raw_fetches) have no raw_fetches row to link to, by definition. The `intelligence_items` row carries `source_id` and `source_url` but no `raw_fetch_id`. Tracing a pre-Wave-1a item back to the HTML byte-stream that produced it is not possible.

Verdict: PARTIAL. The schema supports the trace via `agent_runs` as the bridge table. The data does not yet populate `intelligence_item_id` on `agent_runs`, so the trace is one-directional today (item → no link → agent_runs; agent_runs → maybe linked → raw_fetches). And there is no direct `intelligence_items.raw_fetch_id` FK; even with the in-flight fix, the item-to-fetch trace requires a join through `agent_runs` rather than a direct lookup.

Gap-closing summary: either the in-flight fix (write `intelligence_item_id` on the cold-start `agent_runs` UPDATE so the existing FK is used) or a denormalised `intelligence_items.raw_fetch_id` FK column would close the trace. The denormalised option is cheaper at query time but requires a backfill for the 309 rows produced by cold-start so far where the link was lost.

### 3. Source registry declares expected scope: ABSENT

The `sources` table has 63 columns (per the four-page survey, section 1; confirmed in the audit-script readback). Columns that touch "scope":

- `intelligence_types TEXT[]` (free taxonomy bag, mixed-case mixed-grain values per four-page survey section 2)
- `domains INT[]` (1..7 per migration 004)
- `transport_modes TEXT[]`
- `topic_tags TEXT[]` (60 percent empty per four-page survey section 2; sample of 783 sources per audit-script confirms emptiness)
- `vertical_tags TEXT[]` (99 percent empty per four-page survey section 2)
- `jurisdictions TEXT[]` and `jurisdiction_iso TEXT[]`

There is no column named `source_role`, `expected_topics`, `scope_assertion`, `expected_item_types`, or `source_scope`. There is no comment in any migration (001..061 inspected) asserting that one of the existing columns plays that role. The verification prompt asks the model to score the candidate, not to declare what the candidate publishes; the resulting `source_verifications` row carries `ai_relevance_score`, `ai_freight_score`, `ai_trust_tier`, `language`, `verification_tier`, `action_taken`, but no scope declaration.

When a source is added (manual_add via admin form, citation_detection via discovery pipeline, worker_search via verification.ts), the operator does not declare "this source publishes X" in any structured field; the closest input is `intelligence_types` (mixed-case bag) and `topic_tags` (rarely populated). Per the topic-relevance investigation problem 2, the NYC City Council source has `topic_tags=[]` (empty) and `intelligence_types` was not reported, and the investigation called the empty topic_tags "the registry-side smoking gun, the source was added to the registry without a topical scoping declaration."

Verdict: ABSENT. The schema is shaped to hold scope (the columns exist), but they are not used as a declaration point; no operator workflow forces them to be set, and the data shows >60 percent emptiness on `topic_tags`, >99 percent on `vertical_tags`. There is also no provision to compare the source's declared scope against the items it produces over time, which is what scope-drift detection would need.

Gap-closing summary: any of three patterns would work, none are present: (1) a new `source_scope JSONB` column with structured `{topics: [], item_types: [], jurisdictions: []}` declared at registration time, (2) a CHECK or NOT NULL constraint on `topic_tags` to force a declaration, (3) a `source_role TEXT` enum column with values matching the operator categories (`Regulations`, `Research`, `Market Intel`, `Operations`, `Industry Watch`).

### 4. Item lifecycle states with auditable transitions: PARTIAL

Two distinct state machines coexist on `intelligence_items`:

- `status TEXT` CHECK (`004_source_trust_framework.sql:155-159`): 7 values `proposed, adopted, in_force, monitoring, superseded, repealed, expired`. This is the regulation-lifecycle state (where in its own legal life-cycle the regulation sits). At snapshot: 550 monitoring, 20 in_force, 7 adopted, 5 superseded, 2 proposed.
- `pipeline_stage TEXT` CHECK (`026_research_pipeline_stage.sql:21-22`): 4 values `draft, active_review, published, archived` plus null. This is the editorial-pipeline state (where in the operator's curation flow the item sits). At snapshot: 186 published, 398 null. The migration's comment treats null as "unstaged, typically published for read paths, draft for editor write paths."

Plus a third axis: `is_archived BOOLEAN` + `archive_reason TEXT` + `archive_note TEXT` + `archived_date DATE` + `replaced_by UUID` (FK to `intelligence_items`). 11 rows archived at snapshot.

Plus the `staged_updates` table (migration 004, recreated from migration 001) with its own state machine `pending → approved | rejected`, 24 rows currently. Staged updates target items but are external to the item row.

Plus a fourth set: `agent_integrity_flag BOOLEAN` + `agent_integrity_phrase`/`flagged_at`/`resolved_at`/`resolved_by` (`035_agent_integrity_flags.sql`). This is a binary integrity-failure state, recomputed by trigger.

Audit of state transitions:

- `item_changelog` (migration 004, 9 rows at snapshot) captures field-level changes with `change_type IN ('NEW', 'UPDATED', 'STATUS_CHANGE', 'SEVERITY_CHANGE', 'ARCHIVED')` and `(field, previous_value, new_value)`. This is the closest thing to a transition log. 9 rows is far below the 584 items, suggesting it is not consistently written.
- `intelligence_item_versions` (migration 053, 0 rows at snapshot) captures full snapshots on UPDATE of seven specific fields (`full_brief`, `severity`, `priority`, `urgency_tier`, `format_type`, `topic_tags`, `intersection_summary`). The trigger fires only when at least one of those columns changes. Since no UPDATE has touched any of them yet (cold-start INSERTs only), the table is empty.
- `item_supersessions` (5 rows) captures explicit replace-relationships. `item_disputes` (7 rows) captures source-disagreement events.
- The two pipeline_stage transitions (draft → active_review → published → archived) and the seven status transitions (proposed → adopted → in_force, etc.) are not enforced anywhere in the schema. Either column can be updated to any allowed value at any time. The trigger captures the new state but does not validate that the transition is legal.

Verdict: PARTIAL. State columns exist, multiple of them, but the state machines are not integrated (a single item carries `status` and `pipeline_stage` and `is_archived` and `agent_integrity_flag` independently with no defined interaction), legal transitions are not enforced, and the audit trail is split across `item_changelog` (sparse), `intelligence_item_versions` (empty), `staged_updates` (external), and `item_supersessions` (5 rows). The four-page survey treated `pipeline_stage` as the operator-facing pipeline; the Research surface uses it as a four-stage filter. But for the other three pages there is no equivalent.

Gap-closing summary: state-machine consolidation (one canonical `lifecycle_status` per item with enforced transitions) plus a single transition log (either populating `item_changelog` consistently from triggers or moving the trigger logic into `intelligence_item_versions` and treating that table as the authoritative log).

### 5. Schema supports content shapes beyond text-summary: ABSENT

Confirmed ABSENT in the four-page survey (section 6). Re-stating for completeness, then extending:

- Time-series: no table. `intelligence_items.key_data TEXT[]` is the only home for numeric facts; free-form strings, not query-able.
- Structured jurisdictional facts (tariff per region per year, wage per region per year, permit-timeline per jurisdiction): no table. Per four-page survey section 7 enumerated gaps for `/operations` and `/market`.
- Geo-coded shapes (lat/lng): no column on any inspected table. `jurisdictions` and `jurisdiction_iso` are the only spatial fields and they are jurisdiction-code arrays, not coordinates.
- Document attachments (PDF blobs): no table. The Supabase Storage bucket `raw_fetches` (migration 052) stores gzipped raw HTML keyed by source-id and content-hash, not user-attached PDFs. There is no `documents` or `attachments` table in the inspected schema.
- Structured penalty schedules (CO2 fee EUR per ton effective from date): no table. Could in principle live in `intelligence_items.key_data` as free-form strings but unqueryable.
- Citation graphs (regulation X cited by regulation Y): PARTIAL. `item_cross_references` (migration 004, 49 rows at snapshot) stores `(source_item_id, target_item_id, relationship)` with `relationship IN ('related', 'supersedes', 'implements', 'conflicts', 'amends', 'depends_on')`. This is a bidirectional cross-reference graph between items and supports six relationship types. However, citations between items are not auto-detected from text; they must be manually inserted. 49 rows across 584 items is sparse. `source_citations` (migration 004) provides the equivalent at source-to-source level; `intelligence_summaries` may carry source-citation extraction from the legacy backfill but is shelved per CLAUDE.md.

Verdict: ABSENT for time-series, structured jurisdictional facts, geo-coded shapes, document attachments, structured penalty schedules. PARTIAL for citation graphs (schema exists, sparse and manual). Net: ABSENT.

Gap-closing summary: per-content-shape table additions (a `market_data_points` for time-series, a `tariff_schedules` for structured tariffs, a `documents` for attachments), each keyed to an `intelligence_items.id` parent.

### 6. Item-level cost and classifier telemetry: PARTIAL

`agent_runs` exists (migration 057) with `cost_usd_estimated NUMERIC(10,6)`, `intelligence_item_id` FK, `intelligence_item_version_id` FK, `raw_fetch_id` FK, plus timing fields (`started_at`, `ended_at`, `duration_ms`) and fetch-shape fields (`fetch_status`, `fetch_html_bytes`, `fetch_text_bytes`, `fetch_render_ms`). The cost is populated by the cold-start path from `haikuClassify`'s `estimateCostUsd` (`src/lib/llm/haiku-classify.ts:212-216`). At snapshot, 791 agent_runs rows total $X (per topic-relevance investigation, $0.90 MTD across 639 May rows).

`intelligence_item_versions.created_by_run_id UUID` exists (`053_intelligence_item_versions.sql:19`) but has no FK constraint to `agent_runs` (the column is just a UUID; a comment says it identifies the producing agent_run). At snapshot, 0 rows so the link is theoretical.

`intelligence_summaries` (legacy Sonnet brief table, 2310 rows per topic-relevance investigation) carries no cost column.

Per-item cost computation today:

- "Total cost spent on item X" requires `SELECT SUM(cost_usd_estimated) FROM agent_runs WHERE intelligence_item_id = X`. As of snapshot, this returns 0 for every item because `intelligence_item_id` is null on all 791 rows. After the in-flight fix, it would return the cost of the single agent_run that produced the item, but it would not include the cost of the `intelligence_summaries` Sonnet brief that may be attached to it (separate table, no cost field).
- Per-classifier ("how much have we spent on Haiku-classify"): possible by joining `agent_runs.fetch_method` or by a new column. Today, `fetch_method` carries `html_scrape` / `rss` / `api`, not classifier identity. There is no `classifier_name` column.
- Per-skill-version ("how much spent on regeneration_skill_version=2026-04-29"): not possible from agent_runs because skill version is not stored there. It is stored on `intelligence_items.regeneration_skill_version` per row, but cost is on `agent_runs` per run, and the join key is `intelligence_item_id` which is null today.

Verdict: PARTIAL. Schema supports the question via `agent_runs` and the FK columns, but the FK is unwritten, no per-classifier breakdown exists, no per-skill-version breakdown exists (and the skill-version field itself is sparse).

Gap-closing summary: write `intelligence_item_id` on every cold-start `agent_runs` UPDATE (in-flight fix), add `classifier TEXT` and `classifier_version TEXT` columns to `agent_runs`, and either backfill or accept that pre-fix runs are uncountable for per-item attribution.

### 7. Classifier and gate versioning: ABSENT

`intelligence_items.regeneration_skill_version TEXT` exists. At snapshot, 155 of 584 rows (27 percent) have a value, all `2026-04-29`, all are legacy backfill rows. The 429 rows produced by cold-start have null. The Haiku classify prompt has a constant `HAIKU_MODEL = "claude-haiku-4-5-20251001"` (`src/lib/llm/haiku-classify.ts:23`) but the model identifier is not stored anywhere on the produced item. The prompt itself (`CONTENT_HAIKU_SYSTEM_PROMPT` at lines 79-121) has no version identifier in the code; future prompt edits will silently change behaviour without a version column to bind output rows to prompt revisions.

Other classifiers and gates:

- `haikuVerifyCandidate` prompt (`src/lib/llm/haiku-classify.ts:37-73`): emits to `source_verifications`. The row carries no prompt-version field. `THRESHOLDS` are inline constants (`src/lib/sources/verification.ts:255-260`) and the verification.ts comment notes "Tightened 2026-05-06 from 70/50 to 75/55 after Gap 1 spot-check audit." The threshold change is recorded in source code comments and in the SPOT-CHECK-RESULTS doc, not in any column on `source_verifications`. Pre-2026-05-06 verification rows used 70/50; post-2026-05-06 rows use 75/55; nothing on the row distinguishes them.
- Fetch-quality filter (in flight at `src/lib/sources/fetch-quality.ts`, .mjs port at `scripts/lib/fetch-quality.mjs`): no version column. The .mjs is consumed by cold-start and called inline; the result is logged as `errors=[{kind: 'fetch_quality_failed', reason: ...}]` on the agent_runs row but the filter version that made the decision is not recorded.
- Integrity check (`recompute_agent_integrity_flag` trigger, `035_agent_integrity_flags.sql:35-77`): an inline regex list. No version column on `intelligence_items.agent_integrity_phrase`. If the regex list is widened to catch more phrases, items previously not flagged will be flagged, but there is no record of which version of the regex list flagged them.

Verdict: ABSENT. Only `regeneration_skill_version` exists as a versioning column, and it is sparsely populated and bound to the legacy-backfill skill, not the Haiku classify path.

Gap-closing summary: a single `classifier_metadata JSONB` column per item shaped `{name, version, prompt_hash, threshold_set}` populated at INSERT, plus matching columns on `source_verifications` for the verification path and on `agent_runs` for the gate-decision path.

### 8. Source health monitoring (heartbeat, drift, scope-change): PARTIAL

`source_health_summary` is a VIEW (`004_source_trust_framework.sql:575-587`), not a table. It aggregates `(tier, status)` -> `(source_count, avg_trust_score, active_count, stale_count, inaccessible_count, overdue_count)` from `sources`. It is a dashboard-backing rollup view, not a per-source health row.

Per the four sub-questions:

- (a) Recent fetch success rate per source: PARTIAL. `sources.consecutive_accessible`, `total_checks`, `successful_checks`, `accessibility_rate` exist (`004_source_trust_framework.sql:67-70`) and are auto-recomputed by the `recompute_source_accuracy()` trigger (`004_source_trust_framework.sql:544-563`). Plus `agent_runs` records per-run `status` (`success`/`error`/`skipped`/`running`), so per-source success rate over time is computable via `SELECT source_id, status, count(*) FROM agent_runs GROUP BY source_id, status`. Both data paths exist; no consolidated "recent N-day success rate" rollup is materialized.
- (b) Content-volume drift: ABSENT. There is no time-series of "items produced per source per week"; it can be computed ad-hoc but no view or column tracks the trend. `sources.last_intelligence_item_at TIMESTAMPTZ` (migration 054) gives the latest event but not the rate.
- (c) Topic drift (was publishing transport regs, now publishing immigration): ABSENT. This is exactly the failure mode the topic-relevance investigation surfaced (the NYC Council source published one immigration item; no schema artifact would have flagged the publication as a topic-drift event). With the `source_scope_snapshot` from primitive 1(d) absent, there is no baseline to compare against. Even with a baseline, no comparator code path exists.
- (d) URL drift: PARTIAL. `sources.last_checked` is the HEAD prober timestamp; `sources.consecutive_accessible` counts the streak. A URL that starts returning 404 will drop `consecutive_accessible` to 0 and the next monitoring queue run sets `last_inaccessible`. But "URL changed shape" (e.g., a redirect chain that lands somewhere new) is not tracked beyond the single `last_substantive_change` timestamp. The verification pipeline's redirect tracking (`src/lib/sources/verification.ts:280-360`) captures the chain at the candidate-evaluation moment but discards it after the verification row is written. The per-source URL drift is not separately modeled.

`source_trust_events` (migration 004) is the immutable trust ledger with 11 event_type values (`confirmation`, `conflict_opened`, `conflict_resolved`, `accessibility_check`, `citation_received`, `tier_promotion`, `tier_demotion`, `manual_review`, `stale_flag`, `paywall_change`, `self_citation`, `discovery`). 779 rows at snapshot. None of the 11 event types is `topic_drift` or `scope_change`; the ledger is shaped for trust events, not scope-change events.

`source_verifications` (migration 037, 1414 rows) is per-candidate, not per-existing-source-over-time.

Verdict: PARTIAL. Trust ledger and accessibility rate are well-modeled. Topic-drift and content-volume drift are ABSENT. URL drift is captured as a side-effect of accessibility tracking but not as a first-class signal.

Gap-closing summary: a per-source-per-period rollup table (`source_period_stats` with `(source_id, period_start, period_end, fetch_success_rate, items_produced, top_topic_tags_emitted)`) materialized weekly would give content-volume drift and topic drift. Plus a `source_trust_events.event_type='scope_change'` event type addition or a separate `source_scope_change_log`.

### 9. Reversibility / auditability of curation actions: PARTIAL

`ingestion_control_log` (migration 058) is append-only (REVOKE UPDATE, DELETE per lines 40-42). Schema fields: `(source_id, action, actor, reason, created_at)`. The migration's comment lists action examples: `auto_run_disabled`, `auto_run_enabled`, `processing_paused`, `processing_resumed`. The schema does not constrain `action` (no CHECK), so any free-text value is accepted. At snapshot, 0 rows: the cold-start kill switch path that writes `auto_run_disabled` rows runs after all sources are processed and has not yet executed. Manual operator toggles via the admin panel (per migration comment) write here too.

Curation actions in scope:

- Source removal: would be a `DELETE FROM sources WHERE id = X`. There is no trigger on `sources` that writes a deletion event to `ingestion_control_log` or anywhere else. An explicit operator workflow could write a row with `action='source_removed'` but no code path enforces it.
- Item deletion: would be a `DELETE FROM intelligence_items WHERE id = X`. The topic-relevance investigation recommended this for the 37 garbage-extraction items. The CASCADE relationships defined in migration 004 remove `item_timelines`, `item_changelog`, `item_disputes`, `item_supersessions`, `item_cross_references`, and `intelligence_item_versions` rows tied to the deleted item. There is no `item_deletion_log`. The CASCADE removes the audit trail along with the item.
- Item flag-and-hide: writes `intelligence_items.is_archived=true` plus `archive_reason` plus `archive_note` plus `archived_date` (the four columns are on the item itself). The `intelligence_item_versions` trigger does NOT fire on `is_archived` change because the trigger's `WHEN` clause only watches seven columns and `is_archived` is not one of them (`053_intelligence_item_versions.sql:128-138`). So the archive event is not captured in the version log.
- Source scope narrowing (e.g., changing `topic_tags`): an UPDATE on `sources`. There is no trigger writing to `source_trust_events` or `ingestion_control_log` on column changes other than the trust-metric recompute trigger (`004_source_trust_framework.sql:565-568`). Topic-tag changes are silent.
- Taxonomy reassignment (changing `intelligence_items.item_type` or `domain`): an UPDATE. The `intelligence_item_versions` trigger does not fire on `item_type` or `domain` change (not in the seven watched columns). `item_changelog` has `change_type='UPDATED'` and `field` text, so a reassignment could be recorded there if the calling code chooses, but no trigger forces it. At 9 rows for 584 items, item_changelog is not consistently written.

`ingestion_control_log` covers ingestion-side flag changes (auto_run_enabled, processing_paused). It does not cover curation actions (source removal, item deletion, item archive, taxonomy reassignment). There is no separate `curation_log` table.

Verdict: PARTIAL. One audit log exists (ingestion_control_log) and is correctly append-only, but it is scoped to two specific flags. Other curation actions either (a) silently mutate without a log, (b) cascade-delete their audit trail, or (c) are partially captured in item_changelog but not consistently.

Gap-closing summary: either a single `curation_log` append-only table covering all curation actions on items and sources, or extending `intelligence_item_versions` to fire on `is_archived` and `item_type` and `domain` changes, plus removing the cascade-delete on the audit-trail tables when the parent item is deleted (or replacing DELETE with a soft-delete via `is_archived`).

## Cross-cutting observations

1. The schema is rich enough to hold most of the primitives, but the data is sparse enough that the primitives are not in operational use. Three of the foundation Wave-1a tables (`intelligence_item_versions`, `ingestion_control_log`) are at zero rows because the producing code paths are either dormant (versions: cold-start INSERT only, never UPDATE) or queued (ingestion_control_log: cold-start kill switch fires at the end). Primitive verdicts therefore reflect both schema shape and effective use.

2. The primitive 6 gap (per-item cost attribution) and the primitive 2 gap (item-to-fetch trace) collapse to the same single root cause: `agent_runs.intelligence_item_id` is unwritten. One in-flight fix closes both partial verdicts.

3. The four-page survey's "no source-role taxonomy" finding (section 1, repeated in section 7 cross-cutting) is the same shape as primitive 3's ABSENT verdict and primitive 1(a)'s ABSENT verdict for the operator's six categories. Primitive 1(a) is the item-side; primitive 3 is the source-side; both axes are absent and the absences are mutually reinforcing, since a per-item category gate could draw on a per-source role declaration as a default if both existed.

4. The integrity-flag system (migration 035 per-item, migration 048 platform) is the most complete primitive on the list and does not match any of the nine primitives directly. It is closest to primitive 4 (lifecycle states) since it carries `flagged_at` / `resolved_at` / `resolved_by` and has its own lifecycle, but it is orthogonal to the four-state pipeline lifecycle and the seven-state regulation lifecycle. A future consolidation might fold it in.

5. `taxonomy_nodes` (38 rows, migration 007) is wired only to `vendor_technologies`. It is not used by `intelligence_items`. The hierarchical ltree taxonomy is in place but unconnected to the item categorization problem the operator framing of primitive 1 raises.

6. `category TEXT` exists as a column on `intelligence_items` (migration 004 line 136, no CHECK). Per the audit-script readback, the column is in the column list. Its current population is unknown from this audit (the `category` value was not included in the distribution dump). If empty, it is the cheapest place to store the operator's six-category assignment without a new ALTER TABLE.

## Methodology

What was queried (read-only, no writes):

- Migrations 001..061 in `fsi-app/supabase/migrations/`. Migrations 004, 026, 035, 037, 047, 048, 050, 052, 053, 054, 057, 058, 059, 061, plus 006 multi-tenant slice were read in full or in the relevant section. The remaining migrations were not read in full but their column additions were inferred from the audit script's column-list readback against the live tables.
- Live database via `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` from `fsi-app/.env.local`. Single throwaway script at `fsi-app/scripts/_audit-temp.mjs`, deleted after the run.
- `src/lib/llm/haiku-classify.ts` (full read), `src/lib/sources/verification.ts` (full read), `scripts/wave1-cold-start.mjs` (relevant slices), `.claude/CLAUDE.md` (grep for category / out-of-scope / industry-watch), `.claude/skills/environmental-policy-and-innovation/SKILL.md` (grep, same terms), `docs/four-page-architecture-survey-2026-05-09.md` and `docs/topic-relevance-investigation-2026-05-09.md` (full read).
- Cold-start INSERT path (`scripts/wave1-cold-start.mjs:430-510`) read to understand which `agent_runs` and `intelligence_items` columns are populated at row creation.
- 20-row sample for primitive 1(b) determinism reasoning was the first 20 rows returned by `select * from intelligence_items limit 2000` ordered by `id`. Not random; not stratified. Conclusions about determinism are reasoned from the spread plus the page-filter logic, not from a representative random sample.

Caveats:

- Cold-start is writing concurrently. `intelligence_items` count moved from 446 in the four-page survey (one day prior) to 584 at this snapshot. Distributions are point-in-time; primitive verdicts about row-count percentages are approximate and will continue to drift as cold-start completes.
- The fetch-quality filter (`src/lib/sources/fetch-quality.ts`) referenced by the dispatch was not present in the working tree at audit time (only the .mjs port). Statements about fetch-quality versioning are based on the .mjs.
- The `category` column on `intelligence_items` (migration 004 line 136) was not included in the distribution readback; verdict statements about it being "currently unused" are inferred from the column's absence in any read code path I inspected, not confirmed by a value distribution query.
- Primitive 1(a) verdict ABSENT is strict against the operator framing of "rule-based, deterministic, exhaustive, six-category." If the operator is willing to accept the existing `domain INT 1..7` as the partition (where one of the seven domains is treated as `Out of Scope`), the verdict for (a) shifts to PARTIAL. The audit took the operator framing literally.
- Primitive 4 verdict PARTIAL treats the multiple coexisting state machines as disqualifying for "with auditable transitions"; if the operator considers `pipeline_stage` alone sufficient and the other state columns as orthogonal axes, the verdict shifts to PRESENT for the editorial pipeline only.

What this audit did not do: did not modify any DB row, did not modify any schema, did not modify the cold-start script, did not modify the handoff doc, did not propose implementation. Did not hold the four-page-architecture or topic-relevance investigation findings to a recount; cited them where applicable.

## Related

- [[source-coverage-diagnostic-2026-05-09]] — Parallel same-day audit that cross-references this one and confirms the identical last_intelligence_item_at / agent_runs FK write-path gap
- [[registry-to-ingestion-handoff-design-2026-05-10]] — shares migration 058
- [[W1A-dual-write-audit]] — Wave 1a is the in-flight fix that writes the agent_runs FK this audit names as the collapsing root cause
- [[four-page-architecture-survey-2026-05-09]] — Explicitly cites and extends it; both find the source-role/six-category taxonomy absent and reconstruct pages from item_type/domain TypeScript filters
- [[caros-ledge-supabase-schema-audit-2026-05-15]] — shares migration 053
