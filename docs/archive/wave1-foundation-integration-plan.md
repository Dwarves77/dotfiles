# Wave 1a Foundation Integration Plan

Generated 2026-05-09 by general-purpose subagent during walk-away dispatch v2.
Input for Phase 2 implementation.

## Pre-flight corrections to brief

- Verification file path: `src/lib/sources/verification.ts` (not `src/lib/llm/verification.ts`). Line 266 is the `HAIKU_MODEL` constant; the actual Haiku call is `classifyWithHaiku` at lines 560-614 with the `client.messages.create` invocation at line 578.
- `.github/` does not exist in the repo. Workflow file is greenfield.
- `access_method` enum already exists at `supabase/migrations/004_source_trust_framework.sql:54-55` with values `('api', 'rss', 'scrape', 'gazette', 'manual')`. Migration 056 is an extension (add `html_scrape`, deprecate `scrape` or keep as alias) plus the api_* columns, not a new column.

## 1. Raw persistence hook in agent/run/route.ts

Insertion point: between line 111 (post-FETCH OK log) and line 113 (Step 4 comment). Browserless render returns r.html (full uncapped HTML) per browserless.ts:38, currently discarded; only r.text is captured into sourceContent. Add capture of r.html at line 99-103 destructure, then INSERT raw_fetches row + upload gzipped HTML to Supabase Storage bucket `raw_fetches` at path `${source_id}/${YYYY-MM-DD}/${content_hash}.html.gz`.

Guard with `if (sourceRecord?.id)`. Skip raw persist when null; agent_runs telemetry will still record source_id IS NULL.

## 2. Dual-write to intelligence_item_versions

The route has one UPDATE to intelligence_items at lines 355-373, zero INSERTs. Recommend a Postgres trigger on intelligence_items UPDATE that fires the version write atomically. Migration 053 creates both the table and the trigger. Trigger covers all other writers (staged-updates/route.ts, intelligence-items/[id]/metadata/route.ts, etc.) for free.

## 3. agent_runs telemetry lifecycle

Wrap the entire route body. Convert outer try/catch to try/catch/finally. INSERT at start (after line 33 jobStart capture, before source lookup at line 44). UPDATE in finally with ended_at, duration_ms, status, cost_usd_estimated, errors, fetch_status, fetch_html_bytes, fetch_text_bytes, fetch_render_ms, raw_fetch_id, intelligence_item_id, intelligence_item_version_id.

All early returns (lines 57, 70, 79, 109, 125, 188, 341, 376) must be replaced with throws of typed errors that the catch block translates to NextResponse, so the finally fires uniformly. Status mapping: 403/409/429 → "skipped"; 500/502 → "error"; 200 → "success".

cost_usd_estimated computed from claudeData.usage.input_tokens and output_tokens (Sonnet 4.6 pricing constants). For Haiku-classify call, add to the same accumulator before the finally update.

## 4. access_method routing switch

Insert between lines 84 (cooldown check end) and 86 (Step 3 fetch start). The lookup at line 44 must add access_method, api_endpoint_url, api_auth_method, api_response_format to the select list. Then switch on sourceRecord?.access_method with cases for "api", "rss", "html_scrape" (and "scrape" as legacy alias).

New helpers src/lib/sources/api-fetch.ts and src/lib/sources/rss-fetch.ts. Both must return the same BrowserlessResult shape so downstream code is unchanged. The fetch_method field on agent_runs is set from sourceRecord?.access_method ?? "html_scrape".

## 5. Haiku classify extraction → lib/llm/haiku-classify.ts

Source: src/lib/sources/verification.ts lines 560-614 (classifyWithHaiku), with model constant at line 266 (HAIKU_MODEL = "claude-haiku-4-5-20251001") and system prompt at lines 204-240 (VERIFICATION_HAIKU_SYSTEM_PROMPT).

The existing function classifies new candidate sources (relevance/freight/trust). Wave 1a needs a different classifier, per-fetch content classification (intelligence item type, severity, priority, topic_tags) on each successful raw_fetch. So the extraction is not a pure move; it is a refactor into a shared module with two exports:

```ts
export interface ClassifyInput { html, source_id, source_url, source_tier, source_jurisdictions, source_topic_tags }
export interface ClassifyOutput { item_type, severity, priority, urgency_tier, topic_tags, jurisdictions, title_candidate, summary, content_hash, cost_usd_estimated, rationale }
export async function haikuClassify(input: ClassifyInput): Promise<ClassifyOutput>;
```

The shared module also exports the existing classifyWithHaiku (rename to haikuVerifyCandidate) so verification.ts continues to work. Both share the Anthropic client, model constant, JSON-extraction regex (line 588), score clamping (line 601), and error envelope.

## 6. Migrations 052-059

- 052_raw_fetches: CREATE TABLE raw_fetches (id, source_id FK CASCADE, content_hash, fetched_at, file_path, http_status, html_bytes, created_at). Indexes (source_id, fetched_at DESC), UNIQUE (source_id, content_hash). Plus INSERT INTO storage.buckets and service-role-only RLS.
- 053_intelligence_item_versions: CREATE TABLE with id, intelligence_item_id FK CASCADE, version_number, created_at, created_by_run_id, previous_version_id, full_brief, severity, priority, urgency_tier, format_type, topic_tags jsonb, etc. UNIQUE (intelligence_item_id, version_number). REVOKE UPDATE,DELETE. AFTER UPDATE trigger on intelligence_items.
- 054_sources_scoreboard_columns: ADD COLUMN IF NOT EXISTS last_content_hash, last_content_fetched_at, last_intelligence_item_at. Index (last_content_fetched_at DESC NULLS LAST).
- 055_sources_auto_run_enabled: ADD COLUMN IF NOT EXISTS auto_run_enabled boolean NOT NULL DEFAULT TRUE. Partial index WHERE auto_run_enabled = TRUE.
- 056_sources_access_method_extension: drop existing CHECK, re-add with ('api','rss','html_scrape','scrape','gazette','manual'). Add api_endpoint_url, api_auth_method, api_response_format with CHECK constraints.
- 057_agent_runs: CREATE TABLE with id, source_id, source_url, fetch_method, started_at, ended_at, duration_ms, status, cost_usd_estimated numeric(10,6), errors jsonb, fetch_status, fetch_html_bytes, fetch_text_bytes, fetch_render_ms, raw_fetch_id, intelligence_item_id, intelligence_item_version_id, created_at. Indexes including partial WHERE created_at >= date_trunc('month', now()) for the MTD tile.
- 058_ingestion_control_log: CREATE TABLE id, source_id, action, actor, reason, created_at. REVOKE UPDATE,DELETE.
- 059_ingestion_state: CREATE TABLE source_id PK FK, auto_run_enabled, processing_paused, last_state_change_at, last_state_change_reason. Single-row-per-source. Backfill from sources on creation.

## 7. Cold-start script

```
load .env.local
sources = fetch all 718 (status='active', not deleted)
itemsBySourceId = SELECT source_id, COUNT(*) FROM intelligence_items GROUP BY source_id
                  → Set of 141 source_ids that already have items
for each source (concurrency = 5, p-limit):
  costSoFar = SELECT SUM(cost_usd_estimated) FROM agent_runs WHERE created_at >= cold_start_started_at
  if costSoFar > 200: HARD HALT
  insert agent_runs row
  try:
    html = await routeByAccessMethod(source)
    persistRaw(source, html)
    if (itemsBySourceId.has(source.id)):
      update agent_runs status='success', cost_usd_estimated=0, note='backfill_only'
    else:
      classification = await haikuClassify({html, source})
      INSERT intelligence_items
      update agent_runs status='success', cost_usd_estimated=classification.cost_usd_estimated
  catch: update agent_runs status='error'
finally:
  KILL SWITCH: set auto_run_enabled=false on all 718
  log to ingestion_control_log
print summary
```

HARD HALT check runs before each iteration. Run with --dry-run first.

## 8. GHA workflow

`.github/workflows/source-monitoring.yml` is greenfield. Calls /api/worker/check-sources (which does HEAD probing, not /api/agent/run). Add the filter inside that worker route (line 42 select adds auto_run_enabled; add .eq("auto_run_enabled", true) after line 44 .eq("processing_paused", false)). Workflow yaml: schedule: cron "0 */1 * * *" plus workflow_dispatch. Single job POSTs with x-worker-secret header.

## 9. MTD spend tile in /admin

Mount in AdminDashboard.tsx between the navy admin-view banner (ends line 322) and the tabs section (starts line 324). Add a 5th promise to the Promise.all at lines 35-64 in src/app/admin/page.tsx. Component: `<MtdSpendTile usd={initialMtdSpendUsd} />` styled to match the navy admin banner. Show: "$X.XX month-to-date · Y agent runs · Z errors". Read-only.

## Execution order for build agent

1. Migrations 052 → 059 (idempotent, can re-run; trigger in 053 must reference table from 052).
2. Storage bucket creation (in 052).
3. src/lib/llm/haiku-classify.ts (refactor verification.ts in same PR; keep tests green).
4. src/lib/sources/api-fetch.ts + rss-fetch.ts (BrowserlessResult-shaped returns).
5. src/app/api/agent/run/route.ts rewrite (try/finally restructure is the riskiest change; gate behind feature flag WAVE1A_TELEMETRY_ENABLED for one deploy cycle).
6. Worker filter at src/app/api/worker/check-sources/route.ts:44.
7. scripts/wave1-cold-start.mjs (dry-run first).
8. .github/workflows/source-monitoring.yml (last; cold-start must complete and auto_run_enabled=false must be set across all 718 BEFORE the workflow can safely run).
9. MTD tile in /admin (purely additive, safe to ship anytime after 057).
