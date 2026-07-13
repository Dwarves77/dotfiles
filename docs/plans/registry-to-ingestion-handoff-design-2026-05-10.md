# Registry-to-ingestion handoff design surface, 2026-05-10

Wave 1b foundation. Read-only design surface, no code changes. Operator review required before any implementation ticket.

## Why this exists

The 2026-05-09 EU ESRS coverage diagnostic (`source-coverage-diagnostic-2026-05-09.md`) named a sixth failure mode beyond A through E: a **registry-to-ingestion handoff gap**. When a row lands in `sources` (via `provisional_sources` promotion, the W2.F verification pipeline, bulk-import, or a direct admin add), nothing schedules an immediate first content fetch. The cron-driven worker is the only sweep, and as currently coded it does not perform an agent run; it only pings the URL with HEAD for an accessibility check. EFRAG is the canonical proof: provisional row registered four weeks before the snapshot, `last_checked` null, `last_scanned` null, `last_intelligence_item_at` null, zero `agent_runs`, zero `raw_fetches`. Until this gap closes, every newly-added source repeats the EFRAG silent-failure pattern. The Wave 1a operational work is complete; this is the Wave 1b ingestion-foundation precursor.

## Current architecture, summarised

The pipeline is currently three loosely-coupled subsystems with no INSERT-time bridge.

1. **Source insert paths** (no first-fetch hook on any of them):
   - `src/app/api/admin/sources/promote/route.ts` lines 113 to 117. Promote-from-provisional INSERTs into `sources` with `status='active'`, then writes the audit row. No call to the agent route.
   - `src/app/api/admin/sources/bulk-import/route.ts` lines 575 to 590. Bulk-import paths INSERT directly into `provisional_sources` (safe default) or, when the W2.F verification pipeline returns tier H, into `sources`.
   - `src/lib/sources/verification.ts` (referenced but not opened here). Auto-verify pipeline that the bulk-import and `/api/admin/sources/verify` routes call. Tier H goes to `sources`.
   - Direct service-role inserts from cold-start scripts and ad-hoc maintenance scripts under `fsi-app/scripts/tier1-*-execute.mjs`. These bypass any application-layer hook entirely.

2. **Schedule + dispatch**:
   - `.github/workflows/source-monitoring.yml` (located at `dotfiles/.github/workflows/`, not inside `fsi-app/`). Hourly cron, calls `/api/worker/check-sources` with `x-worker-secret`.
   - `src/app/api/worker/check-sources/route.ts` lines 45 to 53. Filters `status=active`, `processing_paused=false`, `auto_run_enabled=true`, `next_scheduled_check IS NULL OR <= now`, ordered by tier ascending, limit 10. **Critical**: the only thing this route does on success is HEAD-check the URL, update `last_checked`, log a `source_trust_events` row with `event_type='accessibility_check'`, and queue a `monitoring_queue` row. It does NOT call `/api/agent/run`. So even when a fresh source IS picked up by the cron, the first content fetch never happens unless something else triggers it.

3. **Per-source ingestion entry point**:
   - `src/app/api/agent/run/route.ts`. Requires auth, looks up source by URL, enforces a 1-hour `SCAN_COOLDOWN_MS`, runs the access-method-specific fetch, persists raw HTML, calls Claude, parses YAML frontmatter, updates an `intelligence_items` row.
   - **Critical pre-condition (line 400 to 405)**: the route THROWS 404 if no `intelligence_items` row matches `source_url=<url>`. A brand-new source has no stub item, so calling `/api/agent/run` against a freshly-inserted URL fails with `No intelligence_items row matches source_url=...`. Any first-fetch design must either seed a stub item at INSERT or evolve the agent route to create-or-update.
   - Known callers: `src/app/api/admin/sources/[id]/regenerate-brief/route.ts`, `src/app/api/admin/integrity-flags/[id]/regenerate/route.ts`, the cold-start seeding script at `scripts/tier1-eu-2-clean-inserts-execute.mjs`. No automated trigger.

The handoff gap is structural: there is no edge in the dependency graph from `INSERT INTO sources` to `POST /api/agent/run`. Wave 1a's `auto_run_enabled` kill switch closed an earlier overrun risk but, by defaulting `auto_run_enabled=true` on new INSERTs (migration 055), it also masked the handoff gap from the cron-side. The cron honors the flag, but the cron does not invoke the ingestion pipeline anyway.

## Patterns considered

Three patterns sit on the table. Each is evaluated against the current architecture.

### Pattern P1: Postgres trigger with HTTP webhook via `pg_net`

A trigger on `sources` AFTER INSERT (and AFTER UPDATE WHEN OLD.auto_run_enabled = false AND NEW.auto_run_enabled = true) calls `pg_net.http_post` to a new internal route, e.g. `/api/worker/first-fetch`, with the new row's id and a worker secret. The route writes a row to a `pending_first_fetch` queue (or directly to `monitoring_queue` with `priority='high'`) and returns 202. The cron worker, or a dedicated drain route, processes the queue.

Pros: catches every INSERT path uniformly, including service-role inserts from maintenance scripts that bypass the API. Idempotent at the trigger layer because the queue table can have a unique constraint on `source_id`. Extension already used elsewhere in Supabase ecosystem.

Cons: requires `pg_net` extension to be enabled (currently unverified in this codebase). Adds operational dependency on an outbound HTTP call from the database, which is not a pattern used anywhere else in the migrations to date (047 through 062). Failures are observable only via `net._http_response` table, which adds a second monitoring surface. If the worker route is down at the moment of INSERT, the call is lost unless the trigger writes the queue row directly and uses HTTP only as a wakeup.

### Pattern P2: Application-layer hook on insert paths

Each insert path (`promote`, `bulk-import` apply branch, `verification.ts` H-tier branch) explicitly POSTs to `/api/agent/run` after a successful INSERT. The cold-start scripts also gain a fan-out call.

Pros: no new infrastructure. Stays within Next.js. Easy to add per-call concurrency caps and rate-limit interplay. Visible in the request-response trace.

Cons: every direct database insert path that bypasses the API also bypasses this hook. The cold-start backfill scripts, every `tier1-*-execute.mjs`, every ad-hoc reclassification script, and any future Supabase Studio manual insert all need to remember to call the hook. The handoff gap re-opens silently the first time a script forgets. The `/api/agent/run` route also currently throws 404 against a brand-new source URL because no `intelligence_items` stub exists yet, so each insert path also has to seed a stub. This pushes a second responsibility onto each caller.

### Pattern P3: Queue table plus dedicated drain worker route

Add a `pending_first_fetch` queue table (FK to `sources.id`, `enqueued_at`, `attempts`, `last_attempt_at`, `last_error`, `state`). Insert an entry from EITHER a Postgres trigger (P1-style minus the HTTP call) OR each application-layer insert path (P2-style), or both. Add a new route `/api/worker/drain-first-fetch` that the existing GHA cron also calls (or that runs on its own cron at higher frequency). The drain claims rows with `SELECT FOR UPDATE SKIP LOCKED`, calls `/api/agent/run` per row, updates state, retries with backoff, dead-letters after N attempts.

Pros: catches every INSERT path with one trigger, plus survives a worker outage at INSERT time because the queue is the durable record. SKIP LOCKED gives natural concurrency control. Bulk-add fairness emerges from FIFO over the queue. Failure handling is visible in one table that can drive a dashboard tile. The dead-letter tail is observable. The existing `monitoring_queue` table already has a precedent for the pattern; this is the same shape but for the inverse direction (first-fetch, not periodic check).

Cons: adds a table and a worker route. Slightly more migration work than P1 or P2 alone. Two cron tickers (the existing accessibility worker and the new drain worker) to monitor, unless they share a single cron dispatch.

### Recommendation

**Pattern P3 with a Postgres trigger as the enqueue mechanism**, hybridised with the `auto_run_enabled` flip-on case. The trigger is the single edge-catcher that survives bypass paths. The queue is the durable record and the failure-mode surface. The dedicated drain worker isolates first-fetch traffic from the periodic-recheck traffic so first-fetch can have its own rate limit, its own concurrency cap, and its own dashboard tile. The agent-run pre-condition (no `intelligence_items` row matches source_url) is solved either inside the drain worker by seeding a stub item before forwarding to `/api/agent/run`, or by a small change to the agent route to create-or-update. The drain-worker side is preferred because it keeps the agent route's contract unchanged and concentrates the handoff logic in one place.

## Trigger hook attachment point

In the current architecture the trigger lives at the database layer:

- **New migration**, e.g. `063_first_fetch_queue.sql`. Defines the `pending_first_fetch` table and the trigger on `sources`. Sibling to migrations 057 (`agent_runs`), 058 (`ingestion_control_log`), 059 (`ingestion_state`), all Wave 1a foundation tables.
- **Trigger condition**: `AFTER INSERT OR UPDATE OF auto_run_enabled ON sources FOR EACH ROW WHEN (NEW.status = 'active' AND NEW.auto_run_enabled = TRUE AND NEW.processing_paused = FALSE)`. The UPDATE clause additionally requires `OLD.auto_run_enabled IS DISTINCT FROM NEW.auto_run_enabled` so re-saves of unrelated columns do not enqueue.
- **Application-layer redundant enqueue** is OPTIONAL. With the trigger in place, the `promote`, `bulk-import`, and `verify` routes do not need to explicitly call the queue. Service-role inserts from `scripts/tier1-*-execute.mjs` and any future maintenance scripts also benefit transparently. This is the structural argument for P3 over P2.
- **Drain worker route**: new file at `src/app/api/worker/drain-first-fetch/route.ts`. Uses the same `WORKER_SECRET` header pattern as `check-sources`. Service-role Supabase client. `SELECT ... FOR UPDATE SKIP LOCKED LIMIT N` against the queue. For each claimed row: seed a stub `intelligence_items` row if missing (title from `sources.name`, source_url from `sources.url`, item_type default, source_id set, all metadata empty), then issue a server-to-server POST to `/api/agent/run` with the source URL and a service-account auth header. On 2xx mark the queue row `done`. On 4xx classify and update `last_error`. On 5xx increment `attempts` for backoff.
- **Cron dispatch**: extend `.github/workflows/source-monitoring.yml` with a second job that calls `/api/worker/drain-first-fetch`, OR extend the existing job to call both endpoints sequentially. The hourly cadence is appropriate as the floor; see the next section.

## Bulk-add handling

The relevant scenario: an operator approves twelve provisional sources in one bulk-import apply, or the W2.F verification pipeline returns twelve tier-H decisions in one batch.

- **Trigger fires twelve times**, one per row, regardless of whether the inserts share a transaction. Each invocation does an INSERT into `pending_first_fetch`. With a unique constraint on `source_id`, twelve rows land safely.
- **Concurrency cap at the drain worker**, not at the trigger. Default the drain to limit 5 per invocation (compared to the existing `check-sources` worker's 10 for HEAD-only checks). First-fetches are far more expensive than HEAD checks: a Browserless render plus a Claude Sonnet 4.6 call costs roughly $0.05 per source per call (per `scripts/cost-projection.mjs` ratios), versus essentially zero for a HEAD probe. A bulk-add of 12 absorbs across 3 hourly cron cycles (12 over 5 plus 5 plus 2). Adjust the limit in environment if operators want faster drain.
- **Rate limiting**: the agent route is auth-gated. The drain worker uses a service-account JWT or a worker-secret bypass; either way it inherits the route's per-source 1-hour cooldown. Bulk first-fetches are guaranteed to hit the cooldown because `last_scanned` is null on a fresh source so the cooldown short-circuits, but parallelism above the Anthropic per-key concurrency limit is still possible. The drain worker should serialise within an invocation (existing pattern in `/api/admin/sources/verify` lines 116 to 123 for the same Anthropic-concurrency reason).
- **Fairness**: FIFO over `enqueued_at`. The queue table already orders by INSERT time. Ties broken by `id`. No tier-priority on first ingestion: a freshly added tier-1 source and a freshly added tier-7 source both wait their turn. The case for tier-priority is weak because first-fetch latency is operator-perceived, not user-perceived (end users do not see brand-new sources until they land in `intelligence_items`).
- **Backpressure**: if the queue grows faster than the drain can keep up (sustained 50-plus new sources per hour), the dashboard tile flags it and the operator either raises the per-invocation limit, raises the cron frequency, or both. The queue itself never overflows because it is a durable Postgres table.

## First-fetch window

Three options on the latency-cost-blast-radius axis.

- **Immediate, via `pg_net` on the trigger or a synchronous app-layer call**: latency under 30 seconds for a single source. Cost identical to scheduled. **Blast radius: high**. A bulk-add that inadvertently includes 50 misregistered URLs (typo in domain, wrong path, etc.) would burn $2.50 in Claude calls within the same minute, with no human in the loop. The fetch-quality pre-filter at `/api/agent/run` line 327 catches some of these (Cloudflare blocks, 4xx, content-too-short) before the LLM call, but not all.
- **Hourly, via the existing GHA cron picking up the queue**: latency 0 to 60 minutes. Cost identical to immediate but spread across hours so a runaway bulk-add is naturally rate-limited. **Blast radius: low to medium**. A 50-source bad bulk-add still runs eventually but the operator has up to an hour to notice the queue size, kill the bad rows, and limit damage.
- **Daily, via a once-per-day drain pass**: latency 0 to 24 hours. Cost identical, even more spread out. **Blast radius: very low**. But operator perception suffers: an operator adding EFRAG today and not seeing any ingestion until tomorrow degrades trust in the registry workflow.

**Recommendation: hourly**, matching the existing GHA cron cadence of `0 */1 * * *`. It dovetails with the `check-sources` cadence so no new schedule is needed. It is fast enough that an operator adding a source on a Tuesday afternoon sees an `agent_runs` row by the end of the next hour, slow enough that misregistration damage is bounded to one cron cycle of 5 first-fetches at most ($0.25 worst case). For high-priority manual adds the operator already has `/api/admin/sources/[id]/fetch-now` and `/api/admin/sources/[id]/regenerate-brief` for explicit on-demand override.

## Failure modes

The drain worker classifies and reacts. The agent route's existing `statusToTelemetry` map at `src/app/api/agent/run/route.ts` lines 66 to 78 informs the policy.

- **Auth failure** (401, 403): drain worker uses `WORKER_SECRET` plus a service account, so this should never fire from the drain. If it does, dead-letter immediately, alert via dashboard. Indicates secret rotation or a config drift.
- **Rate limit hit** (429 from `/api/agent/run` cooldown, or 429 from Anthropic upstream): retry once after 65 minutes (cooldown plus 5 minute jitter). If second attempt also 429, leave in queue with `attempts=2` and let the next cron cycle pick it up. After 5 attempts dead-letter.
- **Source returns 4xx** (404, 410, gone, restructured): the agent route surfaces this as `terminalStatus='skipped'` per the map. Drain marks the queue row `skipped_4xx` and DOES NOT retry. Surface in dashboard so operator can either fix the URL or remove the source.
- **Source returns 5xx**: the agent route surfaces as `terminalStatus='error'`. Drain marks `attempts++`, retries on next cron, dead-letters after N=5 with state `failed_5xx`. Visible in dashboard.
- **Fetch-quality filter rejects** (412, the agent route's contract for Cloudflare/CAPTCHA/short-content): the agent route returns 412 with `reason` in the body. Drain marks queue row `quality_failed` plus reason. Does NOT retry (the same source will fail the same filter the next time). Operator decides whether to remove, switch access_method to API, or tag as needing manual fetch.
- **Claude API error** (502 from the agent route wrapping a non-2xx Anthropic response): drain marks `attempts++`, retries on next cron. Likely transient.
- **YAML frontmatter parse failure** (502 with `error='Agent output failed contract validation'`): the source content was fetched but the LLM output was malformed. The agent route already logs this. Drain marks queue row `parse_failed`. Retry once; if it persists, dead-letter for human inspection because the prompt or the source is producing pathological output.
- **No `intelligence_items` stub** (the 404 path): only fires if the drain forgets to seed. The drain's seed step is the prevention. If observed, treat as a drain bug, not a source problem.
- **Dead-letter surface**: a `pending_first_fetch_dead_letter` view (or `state='dead_letter'` rows in the same table) that the admin dashboard reads, with a one-click "retry" and a one-click "give up, mark source provisional, review later" action.

## Detection scope

Three event classes for the trigger to react to:

- **INSERT**: required. The dominant case.
- **UPDATE OF auto_run_enabled** (false to true transition): required. Wave 1a flipped all 718 sources to `auto_run_enabled=false` post cold-start. When operators re-enable a source, the very next thing the system should do is a first-fetch (or, for sources that already have `agent_runs` history, a fresh fetch). Without this, re-enabling a source has the same dormancy risk as INSERTing one.
- **UPDATE on a generic `manually_request_first_fetch=true` admin action**: NOT recommended via the trigger. The operator already has `/api/admin/sources/[id]/fetch-now` and `/api/admin/sources/[id]/regenerate-brief`. Adding a third path through the queue creates ambiguity. Keep manual actions on the explicit admin routes.

The trigger condition synthesised:

```
AFTER INSERT OR UPDATE OF auto_run_enabled ON sources
FOR EACH ROW
WHEN (
  NEW.status = 'active'
  AND NEW.auto_run_enabled = TRUE
  AND NEW.processing_paused = FALSE
  AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.auto_run_enabled IS DISTINCT FROM NEW.auto_run_enabled))
)
```

Provisional sources do not enqueue (status filter). Paused sources do not enqueue. Re-saving an already-active source without changing the relevant flag does not enqueue.

## Telemetry

The operator must see the lifecycle: source added at T, first-fetch attempted at T+X, succeeded or failed.

- **Per-source columns** on `pending_first_fetch`: `source_id`, `enqueued_at`, `first_attempt_at`, `last_attempt_at`, `attempts`, `state`, `last_error`, `agent_run_id` (FK to `agent_runs.id` once the first attempt completes). `state` enum: `pending`, `in_progress`, `done`, `skipped_4xx`, `quality_failed`, `parse_failed`, `failed_5xx`, `dead_letter`.
- **Agent-runs linkage**: the existing `agent_runs` table at migration 057 already records every `/api/agent/run` invocation. The drain worker passes the `source_id` so the row can be joined back. A view `v_first_fetch_history` joining `pending_first_fetch` to `agent_runs` to `sources` gives the operator: "EFRAG, enqueued 2026-05-10T14:00, first attempt 2026-05-10T14:07, status success, intelligence_item_id `abc-123`, cost $0.04, fetch_html_bytes 187k."
- **Audit log**: write a row to the existing `ingestion_control_log` table at migration 058 with `action='first_fetch_enqueued'`, `actor='trigger'`, `reason=<TG_OP>`. This dovetails with the existing Wave 1a audit pattern and means no new audit table is needed.
- **Dashboard tile**: a new card on the admin Source Health Dashboard with three numbers (queued, in-flight, dead-letter) and a 14-day sparkline of first-fetch outcomes. Latency p50/p95 from `enqueued_at` to first `agent_runs.started_at` is the operator-meaningful SLI.
- **Coverage feedback**: the existing `coverage_gaps` table at migration 061 can mark a cell as "filled with caveat" when a source is added but first-fetch is still pending or failed. This closes the loop between the curation methodology (the coverage matrix in the EU ESRS diagnostic) and the ingestion handoff: the operator sees not just "EU x research has 1 source now" but "EU x research has 1 source, first-fetch pending."

## Hard-constraint reminder

The handoff doc `dotfiles/docs/walk-away-handoff-2026-05-09.md` was not modified. This is a design surface only; no code, no schema, no data changes. All recommendations require operator review before implementation. Style follows the project rule: no em-dashes or en-dashes, commas instead.

## Open questions for operator decision

In rough order of how load-bearing they are.

1. **Where does the stub `intelligence_items` row come from?** Three options: (a) seed inside the drain worker before forwarding to `/api/agent/run`, (b) change `/api/agent/run` to create-or-update, (c) seed at INSERT time in the same transaction as the source row. Option (a) is the recommendation because it keeps the agent route's contract unchanged.
2. **Do we enable `pg_net` for the trigger to do its own HTTP call**, or does the trigger only enqueue and a separate cron-driven drain worker pull from the queue? Recommendation: queue-only trigger, no `pg_net`.
3. **Per-invocation drain limit**: 5 (recommended), 10, or operator-configurable via env var?
4. **Retry budget**: N=5 attempts then dead-letter (recommended), or N=3?
5. **Cron schedule**: extend the existing hourly job, or add a new cron line at, say, 15-minute intervals for first-fetch only?
6. **Tier-priority on first-fetch**: FIFO (recommended) or tier-ascending like the existing `check-sources` worker?
7. **Bypass cooldown for first-fetch**: `last_scanned IS NULL` already short-circuits the cooldown so explicit bypass is unnecessary. Confirm.
8. **Service-account auth for drain-to-agent calls**: reuse `WORKER_SECRET` and add a worker-trust check to the agent route, or mint a dedicated service-account JWT? The first is simpler and consistent with `check-sources`.
9. **Backfill for the existing 718 dormant active sources** (and the EFRAG-class provisional rows once they transition to active): does Wave 1b's first run drain the entire backlog at one source per hour (29 days at hourly), or do we accept a faster drain rate as a one-time catch-up window? Recommendation: one-time catch-up at 25 per cron tick for the first 48 hours, then revert to 5.
10. **`processing_paused` interaction**: should the trigger still enqueue when `processing_paused=true` and let the drain skip? Or never enqueue while paused? Recommendation: never enqueue while paused, mirror the cron worker's filter.

## Related

- [ingest-pipeline-investigation-2026-05-22](./ingest-pipeline-investigation-2026-05-22.md) — The pending_first_fetch queue + migration-065 trigger + drain-worker this report finds empty are that design's deliverables
- [primitives-audit-2026-05-09](../audits/primitives-audit-2026-05-09.md) — shares migration 058
- [wave1b-stub-quality-investigation-2026-05-11](../audits/wave1b-stub-quality-investigation-2026-05-11.md) — The pending_first_fetch queue + auto_run_enabled-flip trigger this worker drains is the registry-to-ingestion handoff that design doc specifies
- [source-coverage-diagnostic-2026-05-09](../audits/source-coverage-diagnostic-2026-05-09.md) — Names the 'registry-to-ingestion handoff gap' (dormant new sources, no scheduled first-fetch) that design doc addresses
- [source-classification-framework-2026-05-10](./source-classification-framework-2026-05-10.md) — Same-day; EFRAG (this doc's proof) and W2.F verification pipeline tier-H routing are that framework's worked examples
