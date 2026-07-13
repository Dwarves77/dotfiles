# Ingest Pipeline Investigation: Staleness + Domain Classification Leakage

Date: 2026-05-22
Dispatcher: Read-only investigation agent (no code changes; single docs commit)
Trigger findings (from /regulations hotfix today):
- 4-day data staleness: most recent `intelligence_items.added_date` = 2026-05-19 (3 days silent at investigation time)
- Domain classification bug: `item_type='market_signal'` items being inserted with `domain=1` (regulations surface)

Tip at dispatch: `db3a8b0`
Tip at investigation: `db3a8b0` (no commits added during investigation)

Skills loaded:
- `caros-ledge-platform-intent` (five-surface model, dual-posture, customer-facing value-delivery rule)
- `source-credibility-model` Section 4 (citation-network tier weighting) and Section 6 (bias)
- `environmental-policy-and-innovation` (Section 3 / `item_type` to `format_type` derivation, source taxonomy)
- `sprint-followups-discipline` (loop closure, DP-compliance discipline)

Scope of this investigation: READ-ONLY. No code changes, no migrations, no data writes, no manual ingest runs.

---

## 1. Staleness root cause

### Headline

The ingest pipeline has NO scheduled ingestion of fresh content. The hourly GHA cron is firing successfully, but the only workers it calls (`check-sources` + `drain-first-fetch`) cannot produce new `intelligence_items` rows on their own. New rows arrive only when:

1. An operator registers a new source or flips `auto_run_enabled=true` on an existing source (triggers the `pending_first_fetch` queue via the migration 065 trigger), OR
2. An operator clicks "scan" on the admin UI (calls `/api/admin/scan`, which writes to `staged_updates` only, not to `intelligence_items` directly), then approves the staged updates, OR
3. A user promotes a Community post to intelligence via `/api/community/posts/[id]/promote`.

None of these are time-driven. The "freight sustainability intelligence" the customer is paying for is operator-attention-driven, not pipeline-driven. The 4-day silence is therefore the expected behavior of the current architecture: zero new sources registered + zero admin scans + zero community promotions over 3 days = zero new items.

### Evidence

GHA cron (`source-monitoring.yml`) hourly schedule IS firing:
- 10/10 most recent runs succeeded (2026-05-22 01:58 through 23:55 UTC, hourly)
- Each run hit both `/api/worker/check-sources` (HTTP 200) and `/api/worker/drain-first-fetch` (HTTP 200)
- Drain returns `{"message":"No pending first-fetch rows","drained":0,"succeeded":0,"failed":0,"retried":0,"skipped":0,"results":[]}` on every run since 2026-05-19

`pending_first_fetch` queue state (snapshot at investigation):
- queued: 0
- fetching: 0
- done: 7
- error: 1
- skipped: 5

Most recent queue activity: 2026-05-19 (one error: `agent 412: fetch_quality_failed`), one done. Before that, all activity is 2026-05-11.

`intelligence_items.added_date` distribution (last 30 days):
- 2026-05-19: 2 items (the two market_signal/d=1 leakages the operator cited)
- 2026-05-11: 7 items
- 2026-05-10: 453 items (the Wave 1b cold-start backfill)
- 2026-05-07: 2
- 2026-05-06: 7
- 2026-05-05: 23
- 2026-04-28: 5
- All other days in the 30-day window: 0

Sources table state:
- 796 total sources
- 10 with `status='active' AND auto_run_enabled=true`
- 3 with `processing_paused=true`

So even when `check-sources` runs hourly, it has at most 10 source URLs to ping for accessibility. It updates `sources.last_accessible`/`last_checked` columns. It does NOT create or update `intelligence_items` rows. That is by design (lines 49-65 of `src/app/api/worker/check-sources/route.ts`): the worker is a source-health monitor, not an ingest worker.

The `drain-first-fetch` worker would create new items, but only consumes the `pending_first_fetch` queue (populated by the migration-065 trigger on `sources` INSERT or `auto_run_enabled` flip). Since no sources are being registered or re-enabled, the queue is empty, and the drain returns "No pending first-fetch rows" on every cron tick.

### Why the architecture looks like this

Looking at the surrounding code and skill context, the ingest pipeline appears to have been built around a Wave 1a cold-start + Wave 1b drain pattern: load ~700 sources at once, classify them via Haiku, then process newly-registered ones one-by-one. The recurring-cadence layer (re-fetch existing sources on a schedule and produce new items per source per cycle) was either not built or was decoupled from the cron. The `vercel.json` cron is one entry: `/api/admin/q7-daily-recompute` at 02:00 UTC daily, which recomputes credibility tier weights but does not ingest content.

### Files cited

- `fsi-app/vercel.json` (line 6-9: one cron, q7-daily-recompute only)
- `.github/workflows/source-monitoring.yml` (hourly cron, calls check-sources + drain-first-fetch)
- `fsi-app/src/app/api/worker/check-sources/route.ts` lines 38-65 (queues active+auto_run_enabled sources for accessibility ping; no item insert)
- `fsi-app/src/app/api/worker/drain-first-fetch/route.ts` lines 306-355 (pulls from pending_first_fetch queue; returns early if empty)
- `fsi-app/supabase/migrations/065_pending_first_fetch_queue.sql` lines 90-122 (enqueue trigger fires on sources INSERT / UPDATE OF auto_run_enabled; no time-driven enqueue)
- `fsi-app/src/app/api/admin/scan/route.ts` (admin-only POST, 4-hour cooldown, writes to staged_updates not intelligence_items, no cron caller)

---

## 2. Domain classification root cause

### Headline

`domain` is hardcoded to `1` in three insert sites. The Haiku classifier (`first-fetch-classify.ts`) produces `item_type` (e.g. `market_signal`, `regulation`, `research_finding`) but does NOT emit a `domain` value. The ingest seed code then sets `domain: 1` for every row regardless of what the Haiku classifier decided about `item_type`.

`domain` and `item_type` are two unrelated vocabularies:
- `domain` is INT 1-7 per migration 004 line 135 with CHECK (1..7). Intended to be a coarse topic taxonomy (the regulations surface filters `domain=1`).
- `item_type` is TEXT, classified by Haiku, drives `format_type` derivation per `environmental-policy-and-innovation` (regulation/directive/standard/guidance/framework -> Regulatory Fact Document; market_signal/initiative -> Market Signal Brief; research_finding -> Research Summary; regional_data -> Operations Profile; technology/innovation/tool -> Technology Profile).

The /regulations page filters `domain === 1`. Anything with `domain=1` leaks into the regulations surface, even when `item_type` says it belongs in Market Intel, Research, or Operations.

### Three hardcoded `domain: 1` sites

1. `fsi-app/src/app/api/worker/drain-first-fetch/route.ts` line 276:
   ```
   const seedRow: Record<string, unknown> = {
     source_id: source.id,
     source_url: source.url,
     domain: 1,           // HARDCODED
     status: "monitoring",
     pipeline_stage: "draft",
   };
   ```
   This is the primary ingest path. Every item the Wave 1b drain produces gets `domain=1` regardless of Haiku's `item_type` output. The classifier output is folded into `item_type`, `topic_tags`, `severity`, etc., but `domain` is set independently.

2. `fsi-app/src/app/api/community/posts/[id]/promote/route.ts` line 370:
   ```
   .insert({
     ...
     jurisdictions: itemPayload.jurisdictions ?? [],
     domain: 1,           // HARDCODED with comment: "safe default for community-sourced promotions"
   })
   ```
   The comment at lines 353-356 acknowledges this: "domain=1 (Regulatory & Legislative) is the safe default for community-sourced promotions; the admin can re-classify after the fact via the admin surface."

3. `fsi-app/src/app/api/admin/scan/route.ts` line 252:
   ```
   proposed_changes: {
     ...
     domain: 1,           // HARDCODED in staged_updates payload
     item_type: "regulation",
     ...
   }
   ```
   This one is internally consistent (item_type is also hardcoded to "regulation" because the scan prompt asks for regulations), so the scan path does not produce mismatches. The other two do.

### What Haiku actually returns

`fsi-app/src/lib/llm/first-fetch-classify.ts` lines 23-31 (system prompt) and 147-179 (output parsing):
- Returns `item_type` from this vocabulary: `regulation|directive|standard|guidance|technology|market_signal|regional_data|research_finding|innovation|framework|tool|initiative`
- Returns `topic_tags`, `jurisdictions`, `severity`, `priority`, `urgency_tier`, `title_candidate`, `summary`
- Does NOT return `domain`
- Fallback when classification fails (line 147): `item_type = "regulation"` (defaults to regulation)

The drain worker (`drain-first-fetch/route.ts` lines 281-289) propagates `item_type`, `topic_tags`, `jurisdictions`, etc. from Haiku into the seed row but sets `domain: 1` independently before the enrichment fold-in.

### The agent run path does not fix domain

`fsi-app/src/app/api/agent/run/route.ts` reads `domain` from the existing row (line 388, line 402, line 422, line 432) and passes it to the Sonnet brief generator as context, but does NOT update `domain` on the resulting brief. The agent's YAML frontmatter contract per `environmental-policy-and-innovation` does not include a `domain` field. So once an item is seeded with `domain=1`, it stays `domain=1` for life.

### Cross-reference to the skill taxonomy

Per `environmental-policy-and-innovation` Section 3 (the canonical taxonomy `caros-ledge-platform-intent` cites), `item_type` maps directly to the customer-facing surface via format_type:
- regulation/directive/standard/guidance/framework -> Regulations surface
- market_signal/initiative -> Market Intel surface
- research_finding -> Research surface
- regional_data -> Operations surface
- technology/innovation/tool -> Technology Profile (can route to Market Intel or Research depending on substance)

The platform has BOTH:
- A category-aware routing layer at the RPC level (migration 070 `get_market_intel_items`, `get_research_items`, `get_operations_items`) that filters by `item_type` and other criteria
- A `domain` integer column the legacy /regulations page filters on with `eq(domain, 1)`

Per `caros-ledge-platform-intent` "Customer-Facing Value Gap" item 1, REC-OBS-G remediation is to wire the category-aware RPCs into application code. That work is open (Sprint 2 scope). Until then, /regulations uses `domain=1` filtering, and the hardcoded `domain: 1` in the ingest seed routes every item to that surface regardless of `item_type`.

---

## 3. Scope of the classification gap

### (item_type, domain) cross-tab from production data

Snapshot at investigation (total items = 657):

| item_type | domain | count |
|---|---|---|
| regulation | 1 | 158 |
| framework | 1 | 126 |
| guidance | 1 | 92 |
| regional_data | 1 | 54 |
| initiative | 1 | 51 |
| market_signal | 1 | 40 |
| research_finding | 1 | 24 |
| directive | 1 | 19 |
| tool | 1 | 19 |
| market_signal | 4 | 17 |
| regional_data | 3 | 10 |
| standard | 1 | 10 |
| research_finding | 7 | 10 |
| technology | 2 | 6 |
| tool | 5 | 5 |
| technology | 1 | 5 |
| framework | 5 | 2 |
| regional_data | 6 | 2 |
| regulation | 2 | 1 |
| regulation | 5 | 1 |
| initiative | 2 | 1 |
| standard | 6 | 1 |
| research_finding | 6 | 1 |
| tool | 2 | 1 |
| innovation | 2 | 1 |

### Mismatches leaking INTO /regulations (item_type belongs elsewhere but `domain=1`)

Items with `item_type` whose canonical surface is NOT Regulations but `domain=1`:

- market_signal + d=1: 40 items (should be Market Intel)
- regional_data + d=1: 54 items (should be Operations)
- research_finding + d=1: 24 items (should be Research)
- technology + d=1: 5 items (should be Technology Profile -> Market Intel or Research)
- tool + d=1: 19 items (Technology Profile)
- initiative + d=1: 51 items (per skill: Market Signal Brief -> Market Intel)
- innovation + d=1: 0 (no leaks; the one innovation row has d=2)

Subtotal of items leaking INTO Regulations: 193 of 657 items (~29%).

Note: per the skill, `regulation`, `directive`, `standard`, `guidance`, `framework` ARE Regulations content, so those (158+19+10+92+126 = 405 items) are correctly classified with `domain=1`.

### Mismatches leaking OUT OF /regulations (item_type is Regulations but `domain != 1`)

Items with `item_type` in {regulation, directive, standard, guidance, framework} but `domain != 1`: 5 items total:

- World Bank Carbon Pricing Dashboard (framework, d=5)
- California Advanced Clean Fleets Rule / CARB (regulation, d=2)
- EU MRV Regulation (regulation, d=5)
- Green Building Certification Standards for Logistics (standard, d=6)
- Alternative Fuels Insight / IRENA-IMO (framework, d=5)

These are all from 2026-02-28 / 2026-04-11 / 2026-05-06, predating the cold-start backfill. They were classified by an older path with a different domain-assignment rule (not the current hardcoded `domain: 1`). These items do NOT appear on the /regulations surface despite being regulations content.

### Overall domain distribution

- domain=1: 598 items (91%)
- domain=2: 10 items
- domain=3: 10 items
- domain=4: 17 items
- domain=5: 8 items
- domain=6: 4 items
- domain=7: 10 items
- Total: 657

Of 657 items, 598 are `domain=1`. The hardcoded-seed path has dominated the corpus.

### Surfaces affected

Per the five-surface model:

- Regulations (filters domain=1): receives ~193 items that belong elsewhere (29% leakage rate INTO regulations)
- Market Intel: missing the 40 market_signal + 51 initiative items currently rendering on /regulations
- Research: missing the 24 research_finding items currently rendering on /regulations
- Operations: missing the 54 regional_data items currently rendering on /regulations
- Community: not affected by this bug (separate model per skill Section 6)
- Map: derived from Regulations content, so it inherits Regulations leakage proportionally
- Intelligence Assistant: grounded in platform records, so it answers questions over a corpus where 29% of items rendering as "regulations" are not regulations

### Pipeline stage distribution (additional context)

- pipeline_stage='draft': 10 items
- pipeline_stage='review': 0
- pipeline_stage='published': 185
- pipeline_stage='archived': 3
- pipeline_stage IS NULL: 459

459 of 657 items have NULL pipeline_stage (from the pre-Wave-1b backfill). Combined with `domain=1`, they all surface on /regulations regardless of stage gating.

---

## 4. Remediation options (no recommendations; operator decides per `feedback_site_code_deletes_need_operator_signoff.md`)

### Issue A: Staleness (no scheduled ingest of fresh content)

**Option A1: Schedule the admin scan**
- Approach: add a GHA cron (or new vercel.json cron) that POSTs to a new `/api/worker/scan` route (auth via WORKER_SECRET, mirrors check-sources pattern). The route does what `/api/admin/scan` does (Sonnet + web_search to surface new regulations into `staged_updates`).
- Scope: one new route + workflow file + scan logic refactor to extract the worker entry point. Existing 4-hour cooldown logic preserved.
- Risk: web_search at cron cadence incurs Anthropic spend regardless of whether the operator reads the staged updates. Cost is the bottleneck, not technical complexity. Per `feedback_cost_discipline_manual_controls.md`, the cron needs an explicit manual gate (toggle + kill switch) alongside the schedule, not just budget alerts.
- Reversibility: high. Disable the workflow file; the manual scan path keeps working.
- Customer-facing value: still operator-mediated (staged_updates -> approval -> intelligence_items). Operator has to approve to make items visible. Does NOT close the loop to "customer sees fresh items without operator action."

**Option A2: Re-ingest existing sources on a schedule (true content refresh)**
- Approach: build a new `/api/worker/refresh-sources` route. Walks sources with `auto_run_enabled=true`, refetches content, diffs against `intelligence_items.full_brief`, regenerates via `/api/agent/run` when source content has materially changed (using `last_content_hash` already tracked on `sources`).
- Scope: new route, new worker logic, new GHA workflow entry, plus a per-source refresh-cadence policy (daily vs weekly per source tier). Refetch + Sonnet brief regeneration is expensive.
- Risk: high cost surface (Sonnet calls per refresh). Per cost-discipline rule: needs manual gating (per-source toggle, global kill switch) AND visible cost projection in the dispatch proposal.
- Reversibility: moderate. Disabling the workflow stops new regenerations but rows accumulated in the meantime stay.
- Customer-facing value: direct. Customers see new briefs whenever source content materially changes.

**Option A3: Flip more sources to `auto_run_enabled=true`**
- Approach: keep the current architecture. Triage the 796 sources (currently 10 enabled) and flip the priority subset to `auto_run_enabled=true`. Each flip enqueues a row via the migration 065 trigger; the existing drain worker handles them.
- Scope: data-only operation (UPDATE on sources). No new code. No new infrastructure.
- Risk: low. Each new enabled source costs ~$0.001 (Haiku) + Sonnet brief cost (one-time). Bulk flips would burst the drain queue.
- Reversibility: trivial (flip back to false).
- Customer-facing value: indirect. Only delivers new items for newly-enabled sources, then goes dormant again until next manual triage. Does NOT solve the "no ongoing ingest" problem; it solves "no ingest at all this week" once.

### Issue B: Domain classification leakage

**Option B1: Stop writing `domain` at ingest; derive it from `item_type` at read time**
- Approach: remove `domain: 1` from the three insert sites. Add a derivation function `itemTypeToDomain(item_type)` matching the canonical taxonomy. Either compute on-read or backfill via migration.
- Scope: small code change at three sites + new derivation helper + a migration to backfill existing rows + change /regulations page filter from `domain=1` to `item_type IN ('regulation','directive','standard','guidance','framework')`.
- Risk: low if the derivation matches the existing surface-routing intent. Need to verify NO other surface or RPC reads `domain` as a primary filter beyond /regulations. Migration 070 RPCs already filter by `item_type`, so the routing is already there; `domain` is effectively the legacy filter on /regulations and dashboard hero tiles.
- Reversibility: moderate. Migration is reversible; code change is git-revertable.
- Customer-facing value: direct. /regulations stops showing 193 non-regulation items immediately.

**Option B2: Set `domain` at ingest from `item_type`**
- Approach: in `drain-first-fetch/route.ts` line 276, replace `domain: 1` with `domain: itemTypeToDomain(enrichment.item_type)`. Same in `/api/community/posts/[id]/promote/route.ts` line 370. Add a backfill migration for existing rows.
- Scope: same three sites + derivation helper + backfill migration. No /regulations page change required (it keeps filtering `domain=1`).
- Risk: requires a canonical domain vocabulary. The `domain` column is INT 1-7 with CHECK constraint but its labels are not codified in any skill or migration comment I found. Need operator decision on the int-to-label mapping. Migration 011 has a comment "confidence='unconfirmed', domain=1" suggesting domain=1 = regulations historically. The other 6 values are not documented.
- Reversibility: moderate.
- Customer-facing value: direct, same as B1.

**Option B3: Add `domain` to the Haiku classifier output**
- Approach: extend `first-fetch-classify.ts` system prompt to ask Haiku for a `domain` value. Parse and propagate. Drop the hardcoded `domain: 1` at the three insert sites.
- Scope: classifier prompt + output parsing + three insert site changes. Requires operator decision on the domain vocabulary (same as B2).
- Risk: higher prompt complexity = lower Haiku output quality. The classifier already does item_type assignment; asking it to also do domain when item_type fully determines domain is redundant. Cost surface trivial.
- Reversibility: high.
- Customer-facing value: same as B1/B2.

**Option B4: Drop the `domain` column entirely**
- Approach: remove the `domain` column from `intelligence_items` (and downstream RPCs that select it). Route every surface filter through `item_type` + topic_tags. Per `caros-ledge-platform-intent` "Customer-Facing Value Gap" item 1, this is REC-OBS-G remediation.
- Scope: large. Touches migration 070 RPCs, migration 047/064/066/069/071/073 RPCs, the /regulations page, the dashboard hero tiles, and any other surface that reads `domain`.
- Risk: large refactor surface. Would need a dedicated sprint dispatch under sprint-followups-discipline + DP compliance check.
- Reversibility: low (data lost on column drop).
- Customer-facing value: this is the canonical fix per the platform-intent skill but is Sprint 2+ scope by the skill's own framing.

---

## 5. Operator follow-ups (decisions needed)

1. **Staleness fix path**: pick from A1 (scheduled admin scan), A2 (scheduled source refresh), A3 (flip more sources to auto_run_enabled), or "accept the architecture as-is and document the customer-experience implications." Per `caros-ledge-platform-intent`: this is customer-facing value-gap territory; silently absorbing the gap violates the rule.

2. **Domain leakage fix path**: pick from B1 (stop writing domain, derive from item_type at read), B2 (write domain from item_type at ingest), B3 (add domain to Haiku output), or B4 (drop domain column entirely as REC-OBS-G). B1 and B2 are tactical hotfixes; B4 is the strategic fix per the platform-intent skill.

3. **Domain vocabulary**: if B2 or B3 is chosen, operator must define the INT 1-7 to label mapping. Migration 011 implies 1 = regulations historically. The other 6 values are not codified anywhere I found. Required input to any fix.

4. **Cost discipline gating** (per `feedback_cost_discipline_manual_controls.md`): if A1 or A2 is chosen, operator must specify the manual gating mechanism (per-source toggle, global kill switch, daily spend cap with hard stop) alongside the schedule.

5. **Backfill of 193 mis-classified items**: any of B1/B2/B3 needs an accompanying migration to fix the existing 193 items. Decide: backfill (admin one-time) or leave-and-let-decay (new items correct, old items wrong until manually re-triaged).

6. **OBS capture**: this investigation surfaced 2 findings that should land as OBS entries in the current sprint followups doc (if one is open) so the loop-closure discipline picks them up on the next design or implementation dispatch. Per `sprint-followups-discipline`, investigation-only dispatches CAN capture new OBS but do not owe loop closure.

7. **Customer messaging while gap is open**: per `caros-ledge-platform-intent`, customers paying for "freight sustainability intelligence" are looking at stale data and a 29%-leaked regulations surface. Operator may want a customer-facing posture decision (transparency banner, status page, account-manager outreach).

---

## Value Delivery Check

This dispatch's work does NOT directly advance customer-facing value delivery.

This is a read-only investigation dispatch. The deliverable is this docs report. No customer-facing surface (Regulations, Market Intel, Research, Operations, Community, Map, Intelligence Assistant, Onboarding) changes as a result of this work.

That said, this investigation surfaces TWO customer-facing value gaps that are currently silent:
1. Customers see stale data on every intelligence surface (no ingest cadence beyond manual operator action).
2. Customers see ~193 misclassified items on /regulations (29% of the surface is non-regulation content).

Closure of both gaps requires operator decisions per Section 5 above. The Regulations leakage gap is also REC-OBS-G in the platform-intent skill's Customer-Facing Value Gap list (Sprint 2 scope, currently unscoped). The staleness gap is not enumerated in that list; this investigation surfaces it as a new customer-facing gap for operator awareness.

Dual-posture: both gaps affect current operational scope (art logistics, live events, etc.) AND expansion-time users equally. The hardcoded `domain=1` and the manual-only ingest cadence apply to all sources regardless of cohort, so neither fix path narrows scope.

---

## OBS coverage (deferred)

Per `sprint-followups-discipline`, investigation-only dispatches do not owe loop closure on existing OBS entries. The skill explicitly excludes investigation dispatches from the loop-closure obligation. This investigation captures two findings that the operator may choose to formalize as new OBS entries on the current sprint's followups doc.

---

## DP compliance (not applicable)

Per `sprint-followups-discipline`, this investigation produces no design surface. Each DP entry in `docs/design-principles.md` is not applicable to a read-only investigation report.

---

## Files cited (absolute paths)

- `C:/Users/jason/dotfiles/fsi-app/vercel.json`
- `C:/Users/jason/dotfiles/.github/workflows/source-monitoring.yml`
- `C:/Users/jason/dotfiles/.github/workflows/spot-check-monthly.yml`
- `C:/Users/jason/dotfiles/.github/workflows/trust-recompute.yml`
- `C:/Users/jason/dotfiles/fsi-app/src/app/api/worker/check-sources/route.ts`
- `C:/Users/jason/dotfiles/fsi-app/src/app/api/worker/drain-first-fetch/route.ts` (line 276 hardcoded domain=1)
- `C:/Users/jason/dotfiles/fsi-app/src/app/api/agent/run/route.ts`
- `C:/Users/jason/dotfiles/fsi-app/src/app/api/admin/scan/route.ts` (line 252 hardcoded domain=1)
- `C:/Users/jason/dotfiles/fsi-app/src/app/api/community/posts/[id]/promote/route.ts` (line 370 hardcoded domain=1)
- `C:/Users/jason/dotfiles/fsi-app/src/app/api/staged-updates/route.ts`
- `C:/Users/jason/dotfiles/fsi-app/src/lib/llm/first-fetch-classify.ts` (no domain in classifier output)
- `C:/Users/jason/dotfiles/fsi-app/src/app/regulations/page.tsx` (line 50 filters domain=1; line 101 client filter domain===1)
- `C:/Users/jason/dotfiles/fsi-app/supabase/migrations/004_source_trust_framework.sql` (line 135 domain INT NOT NULL CHECK (1..7))
- `C:/Users/jason/dotfiles/fsi-app/supabase/migrations/065_pending_first_fetch_queue.sql` (line 120 enqueue trigger; fires on sources INSERT or auto_run_enabled flip only)
- `C:/Users/jason/dotfiles/fsi-app/supabase/migrations/070_phase1_routing_rpcs.sql` (existing category-aware routing RPCs, orphans per REC-OBS-G)

## Related

- [ingest-restart-sequencing-2026-05-22](./ingest-restart-sequencing-2026-05-22.md) — That doc operationalizes this report's B4 option and answers its own verification question about the 3 insert sites on the restart path
- [classification-backfill-plan-2026-05-22](./classification-backfill-plan-2026-05-22.md) — Consumes Dispatch E's report as primary input; reconciles its 193-leak count against this plan's 212 moves
- [registry-to-ingestion-handoff-design-2026-05-10](./registry-to-ingestion-handoff-design-2026-05-10.md) — The pending_first_fetch queue + migration-065 trigger + drain-worker this report finds empty are that design's deliverables
- [fix-d-scope-2026-05-23](./fix-d-scope-2026-05-23.md) — REC-OBS-G and the category-aware RPCs Fix D wires end-to-end are diagnosed there (migration 070 orphan RPCs)
- [regulations-classification-mismatch-counts-2026-05-22](./regulations-classification-mismatch-counts-2026-05-22.md) — That doc's conservative 120-count feeds this investigation; both share the (item_type,domain) cross-tab
