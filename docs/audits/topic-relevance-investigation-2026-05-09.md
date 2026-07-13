> **Historical:** 2026-05-09 to 2026-05-11 wave decision-snapshot. Kept for cross-reference. Not a current-architecture spec.

# Topic relevance investigation, 2026-05-09

## TL;DR

A snapshot at 2026-05-10T02:43:53Z shows 419 items live on `/regulations` (domain=1, is_archived=false). Only one item is a true topic-relevance failure in the strict sense the operator described, the NYC ICE / Rikers / Executive Order 50 lawsuit (id `eb08d16c-f51c-44bd-8f50-0fada86c67d4`). However, 37 additional items are "garbage extraction" pollution where the agent produced a Sonnet card describing a Cloudflare block, a CAPTCHA gate, a 403 page, or a "scheduled maintenance" notice as if it were a regulation. Combined polluted total is 39 of 419, about 9.3 percent of the surface. The cost waste is small in absolute terms, $0.07 of $0.90 in MTD agent_runs spend (about 7.8 percent), because no full Sonnet briefs (`intelligence_summaries`) have been generated for the polluted set yet. The waste is reputational, not financial. The single most notable source for the topic-failure case is `New York City Council` (council.nyc.gov, tier 1, RSS access_method, empty topic_tags). The garbage-extraction failures are spread across roughly 37 different sources, mostly tier 1 parliamentary scrapes blocked by Cloudflare, with no source contributing more than 1 polluted item.

## Snapshot context

- Snapshot timestamp: `2026-05-10T02:43:53.070Z` (UTC).
- `intelligence_items` total at snapshot: 488 rows.
- `/regulations` candidate set (domain=1, is_archived=false, snapshotted with `created_at <= SNAPSHOT_AT`): 419 rows.
- Cold-start (`fsi-app/scripts/wave1-cold-start.mjs`) is running concurrently, writing new rows to `intelligence_items` and `agent_runs`. Snapshot timestamp filter ensures concurrent inserts do not perturb counts.
- `agent_runs` total at snapshot: 642 rows. Zero of those rows have `intelligence_item_id` populated, the FK exists in the schema (migration 057) but is not yet being written by the agent. This means item-level cost attribution must be inferred via `source_id` joins, not the FK.
- `intelligence_summaries` total: 2310 rows, populated via legacy backfills with sector-keyed Sonnet briefs. Zero of the polluted items in this investigation have an entry, the Sonnet brief generation has not run for any of them.
- Read-only investigation: no inserts, updates, deletes, or schema changes were issued.

## Problem 1: Cleanup scope

Heuristic results for the 419 candidate items:

| Verdict | Count |
| --- | ---: |
| on-topic | 335 |
| off-topic (definite, multiple off-keywords + zero on-keywords) | 0 |
| likely off-topic (one off-keyword, zero on-keywords) | 2 |
| garbage-extraction (Cloudflare block, CAPTCHA, 404, maintenance, etc.) | 37 |
| unclear (no anchors either way) | 45 |

Polluted total (off + likely-off + garbage): **39 of 419, 9.3 percent**.

The two truly off-topic items by topical content:

| id | title | source |
| --- | --- | --- |
| `eb08d16c-f51c-44bd-8f50-0fada86c67d4` | NYC Council Files Lawsuit Against Mayor's Executive Order 50 Allowing ICE Office on Rikers Island | New York City Council |
| `0554d47e-3e90-40cb-aced-fcfb42ff793d` | Latvian Saeima Official Homepage - Parliamentary Information and Legislative Portal | Saeima of the Republic of Latvia |

The Latvian Saeima item triggered the off-topic classifier because its summary mentions Ukraine policy work but has no freight, transport, emissions, or supply-chain anchor. It is a borderline case, the source is a national parliament whose plenary covers freight-relevant statutes but happens not to in this snapshot's homepage scrape. The NYC Council item is the unambiguous failure: topic_tags are `immigration_enforcement, executive_authority, sanctuary_policy, law_enforcement_cooperation, government_conflict_of_interest, municipal_compliance`, transport_modes is empty, category is null, the entire content is a sanctuary-city lawsuit unrelated to freight in any way.

The 37 garbage-extraction items are titles like:

- "Cloudflare Security Verification - Danish Parliament Website"
- "ym.fi Website Security Verification Page"
- "La Chambre des Représentants - Access Blocked by CAPTCHA"
- "SSO AGC Singapore Service Availability - CloudFront 403 Error"
- "AAA.lrv.lt Security Verification Page"
- "Newfoundland and Labrador House of Assembly - Scheduled Maintenance"
- "Wisconsin Legislature RSS Feed Unavailable - Feed Change Notice"
- "IRENA Website Access Issue - 403 Forbidden Error"
- "Federal Register Implements Programmatic Access Restrictions and CAPTCHA Requirements"
- "Smart Freight Centre Website Access Error - CloudFront 403 Blocking"
- "IEA Global Supply Chains of EV Batteries Report" (the title was scrape-extracted from a blocked landing page, the content of the item itself is an access-error placeholder, not the report)

These are not topic-relevance failures in the immigration-content sense. They are extraction-quality failures: the agent's Haiku summarizer dutifully produced a "regulation" record from a 403 page or a Cloudflare interstitial. They pollute the same surface and burn the same cost slots, but the right disposition is different (they should be re-fetched after fixing the access-method, not gated by a topic filter).

The 45 "unclear" items have neither strong on-topic nor strong off-topic anchors. Most are short, generic agency homepage scrapes ("Latvian Ministry of Environment Homepage") that the heuristic cannot confidently classify without reading more text. A spot-check of 10 random unclear rows showed all 10 were on-topic in spirit (environmental ministries, transport agencies, port authorities), just with thin extracted summaries. They are not a cleanup target.

The full polluted list (id, title, source) is captured in the analysis script's JSON output and the leading sample appears under Problem 2 below.

Heuristic confidence: high for the NYC ICE case and the garbage-extraction set (they self-identify by title), moderate for the Latvian Saeima case (single off-topic anchor with no on-topic balance), low for the unclear set (would need an LLM judge or full-text ingest to classify reliably). False-positive risk on the garbage-extraction set is very low, the title patterns are unambiguous. False-negative risk on actual immigration / police / election / abortion content is moderate, the heuristic only flags 21 strong patterns and would miss a creatively-titled criminal-justice item.

## Problem 2: Source attribution

### The source that produced the NYC ICE item

| Field | Value |
| --- | --- |
| name | New York City Council |
| id | `1c31ece5-3a0d-4b21-bfdf-86eaa9647687` |
| url | https://council.nyc.gov/ |
| tier | 1 |
| access_method | rss |
| topic_tags | `[]` (empty) |
| total items in DB | 1 |
| polluted items | 1 |

The source has shipped exactly one item, the NYC ICE one, for a 100 percent off-topic ratio. The empty `topic_tags` array on the source row is the registry-side smoking gun, the source was added to the registry without a topical scoping declaration, so anything that appears in council.nyc.gov's RSS feed gets passed downstream. NYC City Council does occasionally legislate freight-relevant items (commercial waste zones, congestion pricing, last-mile delivery rules), so the source is not categorically wrong for FSI; the failure is that there is no per-item topic gate between the RSS feed and the Sonnet pipeline.

### Per-source disposition options for the NYC City Council source

Three options, not for execution, just for the operator to weigh:

1. **Keep with downstream topic filter** (recommended). The source is legitimately on-list for freight, waste, congestion, and last-mile rulemaking. The fix belongs at the per-item gate, not the per-source gate. Leave the source registered, populate its `topic_tags` (e.g., `freight`, `waste_management`, `last_mile`, `congestion_pricing`), and add a Haiku-pre-gate that drops items whose extracted topic_tags do not intersect the source's declared topic_tags. Tradeoff: requires the cheap-classify gate (Wave 2), so off-topic items continue to slip through until that gate ships.
2. **Narrow source scope by URL or category**. NYC Council exposes feeds at category-level (`/legislation/`, `/budget/`, `/transportation-committee/`). Re-register the source pointed at the Transportation Committee feed only. Tradeoff: durable, no Wave 2 dependency, but loses signal from the Sanitation Committee and Land Use Committee, both of which carry freight-adjacent items. Also fragile if the Council restructures its feed URLs.
3. **Remove the source entirely**. Eliminates the failure mode at the cost of zero NYC Council coverage. Tradeoff: simplest, but NYC is a Tier 1 jurisdiction and the city is a major freight node, removing the feed creates a coverage gap that future operators or coverage_gaps reports will flag.

### Top sources by polluted-item concentration

The pollution is **highly distributed**. Across the 39 polluted items, no source contributed more than 1 polluted item. The "top 12" list is essentially flat at 1 polluted of 1 total per source. A representative slice:

| source | tier | access | total | off | garbage | polluted % |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Folketinget (Danish Parliament) | 1 | scrape | 1 | 0 | 1 | 100 |
| Ympäristöministeriö (Finland MoE) | 1 | scrape | 1 | 0 | 1 | 100 |
| La Chambre des représentants de Belgique | 1 | scrape | 1 | 0 | 1 | 100 |
| Singapore Statutes Online | 1 | scrape | 1 | 0 | 1 | 100 |
| Aplinkos apsaugos agentūra (Lithuania EPA) | 1 | scrape | 1 | 0 | 1 | 100 |
| Saeima of the Republic of Latvia | 1 | scrape | 1 | 1 | 0 | 100 |
| Országgyűlés (Hungary National Assembly) | 1 | scrape | 1 | 0 | 1 | 100 |
| Senatsverwaltung Berlin (Mobility / Climate) | 1 | scrape | 1 | 0 | 1 | 100 |
| Inter-American Development Bank (Publications) | 3 | scrape | 1 | 0 | 1 | 100 |
| Nunavut Department of Environment | 1 | scrape | 1 | 0 | 1 | 100 |
| Newfoundland and Labrador House of Assembly | 1 | scrape | 1 | 0 | 1 | 100 |
| New York City Council | 1 | rss | 1 | 1 | 0 | 100 |

The concentration finding is "no concentration." Two distinct patterns:

- **Single-item topic failures** (NYC Council, Latvian Saeima): one item each. The pattern is a missing per-item topic gate, not a misregistered source.
- **Single-item garbage-extraction failures** (everyone else on the table): one item each. The pattern is unprotected scraping against Cloudflare-defended, JavaScript-rendered, or CAPTCHA-walled portals. Cloudflare returned a 403 / interstitial, the agent's HTML-to-text path converted it to "Cloudflare Security Verification - X Website", and Haiku obediently summarized that as the regulation.

The implication is that **no single source is responsible**, and per-source disposition (cull this one source) cannot meaningfully reduce the pollution rate. The fixes are systemic: a per-item topic gate (for the topic-failure subset) and a fetch-quality gate / access-method upgrade (for the garbage-extraction subset).

## Problem 3: Cost waste so far

`agent_runs.cost_usd_estimated` is the only cost field populated by the pipeline. `intelligence_summaries` and `intelligence_items` carry no cost columns. `agent_runs.intelligence_item_id` is FK-defined but never written (0 of 642 rows linked), so item-level cost attribution must be approximated via `source_id` joins.

| Measurement | Rows | Dollars |
| --- | ---: | ---: |
| agent_runs FK-linked to polluted items | 0 | $0.0000 |
| agent_runs joined by polluted source_id (broader, includes adjacent runs) | 54 | $0.0702 |
| MTD agent_runs total (denominator, May 2026) | 639 | $0.9046 |
| intelligence_summaries (Sonnet briefs) for polluted items | 0 | $0.0000 |

Polluted-source agent_runs cost is **$0.07 of $0.90 MTD, about 7.8 percent**. The NYC City Council item alone cost $0.0035 to produce (one successful agent_run, Haiku-classify-only).

Critically, **no full Sonnet briefs have been generated for any polluted item**. `intelligence_summaries` for the 39 polluted items returned zero rows. The expensive part of the pipeline (Sonnet sector-brief generation) has not yet been triggered for these items, the cost waste so far is bounded to the cheap Haiku classify + summarize step.

Context against budget:
- $200 cold-start hard halt: total polluted cost is 0.035 percent of that ceiling.
- $335/month Lean tier ceiling: total polluted cost is 0.021 percent of that.
- Average per-polluted-item cost: ~$0.0018.
- If Sonnet briefs were generated for all 39 polluted items at typical per-item Sonnet cost (~$0.03 to $0.10 depending on context size), the wasted spend would compound to $1.20 to $3.90, still small in absolute terms but a meaningful fraction of MTD.

The financial waste is negligible. The credibility waste is not. A single immigration-enforcement card on a freight-sustainability dashboard costs more in operator-credibility than $0.0035 of compute, and the 37 "Cloudflare verification page" cards each carry the same signal, "this product publishes nonsense."

## Decisions to surface

These three decisions are the operator's, not the investigator's. Each lists options, a recommendation, and the rationale. None have been executed.

### Decision 1: Per-item disposition

**Options**:

a. **Hard-delete the 39 polluted items**. Removes the surface pollution immediately. Loses the agent_run cost (~$0.07) and forfeits the evidence trail for "what went wrong."

b. **Flag-and-hide via the workspace_item_overrides table** (set `is_archived=true` with `archive_reason='off_topic'` or `'garbage_extraction'`). Removes from `/regulations` (which filters `is_archived=false`), preserves the row for forensic review and for downstream "what was rejected and why" reporting. Reversible.

c. **Keep visible with a warning chip**. Worst option, signals to viewers that the product knows the item is off-topic but ships it anyway.

d. **Do nothing pending Wave 2**. Accepts ongoing pollution growth at roughly 9 percent of new items until the cheap-classify gate ships.

**Recommendation**: option **b (flag-and-hide)** for the 2 topical off-topic items and option **a (hard-delete)** for the 37 garbage-extraction items. The topical items deserve preservation because they will inform the Wave 2 gate's threshold-tuning; a flagged dataset of "items the human said were off-topic" is the cheapest training signal for that gate. The garbage-extraction items deserve deletion because they are not "off-topic regulation extractions," they are "fetch failures masquerading as regulations," and the right correction is to re-fetch the underlying URL with a corrected access_method, not to preserve the failed extraction. Tradeoff: hard-delete is irreversible and forfeits the agent_run cost trace; mitigate by exporting the 37 rows to a one-shot JSON dump before deletion.

### Decision 2: Per-source disposition (NYC City Council)

**Options**:

a. **Keep with downstream topic filter** (Wave 2 cheap-classify gate). Source remains registered, items are filtered per-item at ingest.

b. **Narrow source scope to a category feed** (e.g., Transportation Committee or Sanitation Committee). Limits surface area, no Wave 2 dependency.

c. **Remove the source from the registry**. Closes the failure mode entirely.

**Recommendation**: option **a (keep with downstream filter)**, contingent on the Wave-2 gate landing. NYC Council does carry freight-relevant content; pre-emptively narrowing or removing the source over a single bad item is overcorrection. The right place for this fix is the per-item gate, which will simultaneously fix every other source with the same misregistration. Tradeoff: this option is a no-op until the gate ships; if the operator wants zero further immigration-content cards from NYC Council in the interim, option (b) is the bridge.

### Decision 3: Wave-sequencing of the cheap-classify gate

**Options**:

a. **Pull the Haiku-pre-gate forward into Wave 1a**. Costs roughly 1 to 2 days of engineering and adds a Haiku call (~$0.0001 per item) on every fetch. Eliminates the topic-failure class going forward.

b. **Keep the gate in Wave 2 as planned**. Saves the engineering cost now, accepts ~9 percent ongoing pollution rate against the dashboard. Pollution rate will likely fall as cold-start moves past the parliamentary-scrape phase, but the topic-failure subclass (NYC Council, Latvian Saeima style) will not.

**Recommendation**: option **a (pull into Wave 1a)** if the operator's North Star is product credibility for early demos / pilots. The credibility delta of "this product never shows immigration cards on a freight dashboard" is large; the engineering cost is small; the per-item Haiku spend is rounding-error against the $200 ceiling. Option (b) is correct if the operator's North Star is shipping-velocity-to-revenue and the early-pilot surface area is small enough that 9 percent pollution is tolerable. Tradeoff: Wave 1a is already in flight (cold-start is writing as we speak), so pulling work forward means pausing or sequencing around the active cold-start, which the operator should weigh against not pulling forward.

A complementary recommendation: independent of the topic gate, the garbage-extraction failure mode wants a separate fetch-quality gate (drop items whose source HTML is < 1KB after text-extract, or whose title matches `/cloudflare|captcha|verification|maintenance|service unavailable|403|404/i`). That is a 30-line filter with no LLM dependency and no Wave-2 coupling, and would resolve 37 of the 39 polluted items in this investigation today.

## Methodology

**Snapshot strategy**: Captured `SNAPSHOT_AT` at the start of the run and constrained every `intelligence_items` query with `created_at <= SNAPSHOT_AT`. Concurrent cold-start writes after the snapshot are excluded from counts.

**Data accessed**:
- `intelligence_items` (488 rows total, 419 candidate for `/regulations`)
- `sources` (joined for top-source name, tier, access_method, topic_tags)
- `agent_runs` (642 rows total, joined by source_id since intelligence_item_id is unwritten)
- `intelligence_summaries` (2310 rows total, joined by item_id for polluted set)

**Page filter mirror**: Read `fsi-app/src/app/regulations/page.tsx` and `fsi-app/src/lib/supabase-server.ts:fetchWorkspaceResources`. The page calls the `get_workspace_intelligence_slim` RPC, which selects items by domain=1 and excludes `is_archived=true` rows. Investigation queries replicate that filter directly against the base table.

**Heuristic design**: Word-boundary regex matching (not substring) against `title + summary + topic_tags + transport_modes + category + item_type`. Two keyword lists: ON_TOPIC (about 100 freight/sustainability anchors) and OFF_TOPIC (about 21 strong off-topic patterns: immigration, sanctuary, abortion, ballot, gun, school district, police shooting, etc.). Special-case rule for ICE the agency: case-sensitive `\bICE\b` standalone or "immigration and customs enforcement" phrase, weighted +2. Special-case rule for garbage-extraction: regex pattern set against title for Cloudflare, CAPTCHA, 403, 404, security verification, scheduled maintenance, etc.

**Verdict logic**:
- garbage-extraction if title matches a garbage pattern (overrides everything else)
- off-topic if 2+ off-keywords and 0 on-keywords
- likely off-topic if 1 off-keyword and 0 on-keywords, OR if off-score > on-score + 1
- unclear if 0 on-keywords and 0 off-keywords
- on-topic otherwise

**False-positive risk**: Low. Word-boundary matching eliminated the original false-positive on substring "ice" inside "service" / "office" / "notice". The garbage-extraction pattern set is title-based and the titles are unambiguous. The Latvian Saeima case is a known borderline (one off-keyword, no on-keyword), the operator should review individually.

**False-negative risk**: Moderate. The 21-pattern OFF_TOPIC list is not exhaustive; an immigration item titled "ICE Cooperation Memo" without other off-keywords could be flagged via the ICE-agency rule, but a creatively-titled abortion or election item with one off-keyword and one on-keyword would currently land in "on-topic" or "unclear". This investigation's polluted count of 39 is therefore a **lower bound**; an LLM-judge pass over the 45 "unclear" items would likely surface 2 to 5 additional topic failures. The operator should treat 9.3 percent as a floor.

**What the investigation did not do**: did not execute any deletes, updates, or schema changes. Did not modify the cold-start script. Did not modify the handoff doc. Did not propose code changes to fix the gate. The two temporary investigation scripts at `fsi-app/scripts/_relevance-temp{,2,3,4}.mjs` were created and deleted within the same session, no artifacts remain.

## Related

- [primitives-audit-2026-05-09](./primitives-audit-2026-05-09.md) — Co-dated; both independently report agent_runs.intelligence_item_id null (0-of-642 / 0-of-791) as the same unwritten-FK root cause
- [sources-content-verification-2026-05-11](./sources-content-verification-2026-05-11.md) — The two archived rows verified here (NYC ICE + Latvian Saeima) are the off-topic items that investigation recommended flag-and-hide
- [classification-rules-audit-2026-05-09](./classification-rules-audit-2026-05-09.md) — Explicitly extends it; the garbage-extraction bucket grew from that audit's 37 to 49 here, same Cloudflare/CAPTCHA interstitial pattern
- [four-page-architecture-survey-2026-05-09](./four-page-architecture-survey-2026-05-09.md) — Both mirror the /regulations page filter (domain=1 AND is_archived=false) defining the candidate surface
- [source-coverage-diagnostic-2026-05-09](./source-coverage-diagnostic-2026-05-09.md) — Co-extended companion; both trace the empty-source-topic_tags scoping gap and the registry-to-ingestion silent-failure pattern
