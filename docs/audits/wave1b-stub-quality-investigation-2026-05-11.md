# Wave 1b stub quality investigation, 2026-05-11

## 1. Question

Does the Wave 1b drain worker leave a permanent NULL-summary `intelligence_items` stub when seeding a first-fetch for a new source, or does the stub get overwritten by the first real ingestion cycle?

## 2. Method

### Files read

- [`src/app/api/worker/drain-first-fetch/route.ts`](../fsi-app/src/app/api/worker/drain-first-fetch/route.ts) — the Wave 1b drain worker.
- [`src/app/api/agent/run/route.ts`](../fsi-app/src/app/api/agent/run/route.ts) — the ingestion route the worker forwards to.
- [`scripts/wave1-cold-start.mjs`](../fsi-app/scripts/wave1-cold-start.mjs) — Wave 1a backfill, for INSERT-pattern comparison.
- [`supabase/migrations/065_pending_first_fetch_queue.sql`](../fsi-app/supabase/migrations/065_pending_first_fetch_queue.sql) — queue table + enqueue trigger.
- [`supabase/migrations/004_source_trust_framework.sql`](../fsi-app/supabase/migrations/004_source_trust_framework.sql) line 126 — `summary TEXT NOT NULL DEFAULT ''` column constraint.
- [`src/app/research/page.tsx`](../fsi-app/src/app/research/page.tsx) and [`src/components/research/ResearchView.tsx`](../fsi-app/src/components/research/ResearchView.tsx) — downstream renderers that read `summary` and `pipeline_stage`.

### Queries run (live DB via service role, `.env.local`)

- `sources WHERE url ilike '%finance.ec.europa.eu%'`
- `intelligence_items WHERE source_id = '1d0265c2-…'`
- `intelligence_items WHERE summary IS NULL OR title IS NULL` (latest 20)
- `intelligence_items WHERE pipeline_stage = 'draft'` (latest 30)
- `agent_runs WHERE source_id = '1d0265c2-…'` and `agent_runs WHERE source_url ilike '%finance.ec.europa.eu%'`
- `pending_first_fetch WHERE source_id = '1d0265c2-…'`
- `intelligence_item_versions WHERE intelligence_item_id = '53c3fcd5-…'`
- `pipeline_stage` histogram across `intelligence_items`
- `sources WHERE auto_run_enabled = true AND status = 'active'`

## 3. Findings

### 3.1 Stub permanence — overwrite vs orphan

**The drain worker does NOT leave an orphan row. The stub is overwritten in place by the first agent run.** Mechanism:

- The drain worker [seeds the stub](../fsi-app/src/app/api/worker/drain-first-fetch/route.ts#L130-L164) with `INSERT … (source_id, source_url, title=source.name, domain=1, status='monitoring', pipeline_stage='draft')`. It does NOT set `summary` (so the column defaults to empty string per migration 004) and it captures the inserted `id`.
- The drain worker then forwards to `/api/agent/run` with `{ sourceUrl: source.url }`.
- `/api/agent/run` [Step 4](../fsi-app/src/app/api/agent/run/route.ts#L374-L406) does a `SELECT … FROM intelligence_items WHERE source_url = $1` and picks the matching row by `source_url`. Because the stub already has that `source_url`, the route locks onto the stub's `id` (no new INSERT path).
- [Step 10](../fsi-app/src/app/api/agent/run/route.ts#L622-L647) does an `UPDATE … WHERE id = targetItem.id`. Same row. No new row is created. No orphan.

**Live evidence.** Smoke-test source `1d0265c2-38ce-463e-befb-f623146ee517` (`finance.ec.europa.eu`):

- `intelligence_items` rows for this `source_id`: **exactly 1** (`id=53c3fcd5-a234-4e97-a294-908dacb01c04`).
- `created_at = 2026-05-10T21:58:54.893Z`, `updated_at = 2026-05-10T22:00:13.115Z` → row was overwritten ~78 seconds after the stub insert.
- `full_brief` length: **12,086 chars** (a full Regulatory Fact Document brief, populated by the agent run).
- `agent_runs` row `bcc18df2-…` shows `status=success`, `intelligence_item_id=53c3fcd5-…` (the same stub id), `fetch_status=200`, completed at `2026-05-10T22:00:13.272Z`.
- `pending_first_fetch` row: `status=done`, `attempt_count=1`, `last_error_text=null`. Queue lifecycle worked.

### 3.2 Fields the agent UPDATE does NOT touch (the real defect)

The original "NULL summary" claim in the prior conversation was technically wrong (`summary` is `NOT NULL DEFAULT ''`, so it was empty string, not NULL), but the underlying observation is correct in spirit: **three columns set by the seed are never overwritten by the agent route's UPDATE**.

`/api/agent/run` Step 10 [updates this set only](../fsi-app/src/app/api/agent/run/route.ts#L623-L641): `full_brief, severity, priority, urgency_tier, format_type, topic_tags, operational_scenario_tags, compliance_object_tags, related_items, intersection_summary, sources_used, last_regenerated_at, regeneration_skill_version, updated_at`.

The seed-only fields that persist forever are:

| Column | Seed value (drain) | After 1st agent run |
|---|---|---|
| `title` | `source.name` (e.g. `"European Commission DG FISMA (finance)"`) | unchanged — institution name, not document title |
| `summary` | `''` (column default) | unchanged — empty string |
| `pipeline_stage` | `'draft'` | unchanged — stays in Draft column of Research view |
| `status` | `'monitoring'` | unchanged |

**Cold-start script comparison.** [`wave1-cold-start.mjs` line 453-471](../fsi-app/scripts/wave1-cold-start.mjs#L453-L471) does a single richer INSERT that calls Haiku first and writes `title` (LLM `title_candidate`), `summary` (LLM `summary`), `severity`, `priority`, `urgency_tier`, `item_type`, `topic_tags`, `jurisdictions` upfront — so cold-start rows do not have this defect. Only drain-worker rows do.

### 3.3 Enrichment trigger — automated or manual?

**Enrichment is automatic but partial, in a single hop.** The drain worker `await`s the `/api/agent/run` POST inline (`agentResp = await fetch(…)` then checks `agentResp.ok`). So within a single drain invocation:

1. Trigger fires on `auto_run_enabled` flip → `pending_first_fetch` row inserted.
2. Hourly GHA cron hits `/api/worker/drain-first-fetch` (limit 5, serial loop).
3. Drain seeds the stub, calls `/api/agent/run`, awaits the brief.
4. Agent route updates `full_brief` + metadata on the same row.

There is **no second pass** that re-fetches `summary` / `title` / `pipeline_stage`. To fix those a stub keeps forever, an operator must edit the row by hand in admin tooling, or a separate code path needs to update them.

### 3.4 Schema state — referential safety

- `intelligence_items.id` is referenced by `intelligence_item_versions.intelligence_item_id` (migration 053) and `agent_runs.intelligence_item_id` (migration 057). The stub's `id` stays stable through the UPDATE — no orphan FKs.
- `intelligence_item_versions` for the smoke-test row: **null** (no rows). Either the version trigger from migration 053 is not deployed on remote, or `full_brief`-only updates do not generate a version. Worth a separate check, but tangential to this question.
- `summary` column: `TEXT NOT NULL DEFAULT ''` — the schema cannot hold a true NULL, so any RPC reading `summary` will always get a string.

### 3.5 Downstream visibility of the seed-default state

- [`research/page.tsx` line 46-72](../fsi-app/src/app/research/page.tsx#L46-L72) selects `title, summary, pipeline_stage` and treats empty `summary` as `""`. The empty-summary row will render in the Research/Pipeline view's **Draft** column (because `pipeline_stage='draft'`), with the institution name as the card title and a blank summary line.
- `pipeline_stage` histogram across the table today: `draft=1, active_review=0, published=185, archived=3, NULL=459`. The single `draft` row IS the smoke-test stub. Nothing else in the table has been routed to draft, so it visibly stands out.
- Migration 064 header notes `summary` is "RETAINED, mapped to Resource.note, used by WeeklyBriefing + WhatChanged". So this row will also surface in the homepage WeeklyBriefing / WhatChanged with a blank note.

### 3.6 Risk to Task 6 flips

If the 10 remaining Task 6 sources are flipped to `auto_run_enabled=true` today:

- Each will enqueue → drain in serial (limit 5/hour) → one agent run each → one `intelligence_items` row each.
- Each row will have a fully populated `full_brief` (so the brief content is fine).
- Each row will have **`title=source.name`, `summary=''`, `pipeline_stage='draft'`** forever, until a separate code path or manual edit fixes them.
- Each row will appear in Research → Draft column with a blank summary, and in WeeklyBriefing / WhatChanged with a blank note. That is 11 visible degraded rows (1 existing + 10 new), versus 185 published rows — visually noticeable on the dashboard.

This is a **quality regression**, not a data-corruption regression. There are no orphan rows and no broken FKs. The brief itself is correct.

## 4. Risk to Task 6 flips, go/no-go

**Recommendation: NO-GO until the seed-vs-update mismatch is reconciled.** The blocker is small and well-scoped — see proposed fix below — but flipping 10 more sources without it will create 10 cards that show up in Draft with the institution name as a title and no summary, persisting until a follow-up cleanup pass. Operator-facing degradation is non-trivial.

If the operator wants to ship Task 6 today anyway, the acceptable middle path is to flip 1-2 sources and immediately backfill `title`, `summary`, `pipeline_stage` on those rows manually (admin SQL update), document the exact pattern, then ship the fix below before flipping the remaining 8.

## 5. Proposed fix path (no code shipped here)

The minimal, contained fix is to harmonize the agent route's UPDATE with what the cold-start script's INSERT provides. Two equivalent options:

**Option A — Drain worker stops setting `pipeline_stage`, agent route fills it.**
Change the seed insert to omit `pipeline_stage` (let it default to NULL), then in `/api/agent/run` Step 10 set `pipeline_stage='active_review'` (or whatever stage is correct for a freshly briefed item) on the UPDATE. Also have the agent route derive a `summary` from the first 1-2 paragraphs of `parsedBody`, or from a YAML frontmatter `summary` field if the agent emits one (currently it does not — would require a small system-prompt addition). Title likewise derived from the brief's first H1.

**Option B — Drain worker calls Haiku for a Wave-1a-style classify before forwarding.**
Mirror cold-start's pattern: drain worker calls Haiku to get `title_candidate`, `summary`, `priority`, `severity`, `urgency_tier`, then INSERTs the stub with those values, then forwards to `/api/agent/run` for the full brief. Agent route already updates the heavy metadata and `full_brief`. This eliminates the seed-vs-update gap entirely. Cost overhead: ~$0.001 per source per first fetch (Haiku is cheap at 6KB excerpts).

Option B is preferred because (a) it reuses an already-validated code path, (b) it does not require adding a `summary` field to the agent's YAML contract, and (c) it leaves `pipeline_stage` decisions to whatever editorial workflow operators settle on, instead of hardcoding a stage in the agent route.

Either option includes a one-shot backfill SQL for the existing finance.ec.europa.eu row to bring it out of Draft.

## 6. One unexpected note

The "NULL summary" framing from the prior conversation was wrong on a technicality: the column is `TEXT NOT NULL DEFAULT ''`, so the value is `""` (empty string), not `NULL`. My initial query for `summary IS NULL OR title IS NULL` returned 0 rows and almost masked the actual defect. The bug is real but the failure mode is "empty string + Draft stage that never advances", not "NULL row that breaks readers". Worth correcting in any follow-up tickets.

## Resolution

Patch shipped 2026-05-11 on branch `fix/wave1b-drain-worker-haiku-enrichment` (Option B from Section 5).

The drain worker now mirrors the Wave 1a cold-start pattern. Before forwarding to `/api/agent/run`, it pre-fetches the source via the same `access_method` routing the agent route uses (Browserless for `html_scrape`/`scrape`, plain fetch for `api`/`rss`), passes the stripped text to the new shared helper [`src/lib/llm/first-fetch-classify.ts`](../fsi-app/src/lib/llm/first-fetch-classify.ts), and INSERTs the stub with `title_candidate`, `summary`, `priority`, `severity`, `urgency_tier`, `item_type`, `topic_tags`, and `jurisdictions` populated. The Sonnet brief still runs in `/api/agent/run` as the second hop and overwrites `full_brief` plus the heavy metadata. Pre-fetch falls back to the legacy bare-stub shape on any Browserless or Haiku error so the queue lifecycle still progresses on degraded paths.

The shared classifier helper duplicates the Haiku prompt + JSON shape used by [`scripts/wave1-cold-start.mjs`](../fsi-app/scripts/wave1-cold-start.mjs) (TypeScript module cannot be imported from .mjs); both paths must produce the same field set for the same input. Cost overhead: ~$0.001 per first fetch.

**Failure mode terminology, for follow-up quality checks.** The defect is "empty-string summary + stuck Draft pipeline_stage", NOT "NULL summary". The `summary` column is `TEXT NOT NULL DEFAULT ''` per migration 004 — it can never hold a true NULL. Any future quality check that wants to detect under-enriched stubs should test for BOTH `summary = ''` AND `pipeline_stage = 'draft'`, not `summary IS NULL`. The original `summary IS NULL OR title IS NULL` query in this investigation returned 0 rows and nearly masked the bug.

The 2026-05-09 smoke-test row (`finance.ec.europa.eu`, `id=53c3fcd5-…`) was backfilled in place via `scripts/tmp/backfill-finance-ec-europa.mjs` using the same Haiku call the patched drain worker now uses. After backfill the row carries a populated `title`, `summary`, `priority`, `severity`, `urgency_tier`, `item_type`, `topic_tags`, and `jurisdictions`.
