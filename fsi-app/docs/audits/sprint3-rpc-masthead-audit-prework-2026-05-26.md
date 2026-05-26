# RPC-MASTHEAD AUDIT (Sprint 3, HIGH priority)

**Date:** 2026-05-26
**Status:** READ-ONLY audit. Implementation BLOCKED on operator green-light of proposed fixes.
**Author:** RPC-MASTHEAD AUDIT dispatch
**Upstream:** `docs/audits/sprint3-a1-masthead-verification-2026-05-26.md` (A1 verification at commit d5d4b30/3794139)

---

## Customer-visible accuracy gap

A paying customer logged into the Dietl/Rockit workspace currently sees the following masthead totals across Caro's Ledge customer surfaces, when the underlying corpus has materially more active intelligence:

| Surface | Masthead displays | Corpus has (active) | Customer-visible undercount | Gap shape |
| --- | --- | --- | --- | --- |
| `/regulations` | 319 | D1 active = 319 | None | Control — correct |
| `/market` | 46 | D4 active = 70; D2 tech/innovation also routes to market_news | ≥34% undercount vs D4 alone; larger if D2 included | Category-routing narrows below domain |
| `/operations` | 30 | D3 + D6 active = 113 combined | ≥74% undercount vs domain union | Category-routing narrows below domain |
| `/research` | 13 | D7 active = 90 (plus cross-domain Research-bound items via category routing — total allow-list = 137) | ~86% undercount vs D7 active; ~91% vs category allow-list | LIMIT 100 ∩ allow-list collision |

Per the H1 trajectory + Coverage Gaps precedent: every one of these gaps is an honesty issue, not just a technical one. A paying customer who lands on `/research` and sees "13 active findings this week" walks away believing the platform tracks 13 horizon items. The reality is 90 (or 137, depending on the routing surface) live in the corpus. The customer's perception of platform thinness is built on data the platform already has but does not surface.

The `/regulations` surface is the existence proof that a corpus-honest masthead is reachable: D1=319 and masthead=319, exact match. That is the contract every customer surface should meet.

### Discrepancy note (must surface before implementation)

The audit's measured "13/46/30" totals come from the A1 verification script (`scripts/sprint3-a1-masthead-verify.mjs`) which measures **category-routed RPC row counts**. The current page-level component code on `/research`, `/market`, and `/operations` actually reads `aggregates?.totalItems ?? <fallback>` in the masthead JSX (see file-line refs below). For `/market` and `/operations`, the `getScopedWorkspaceAggregates` scope filters are wider than the category-RPC filter (item_types OR domains), so the aggregates RPC should return a higher number than the category RPC row count.

Two paths to reconcile:

- **Path P (probable, must verify):** the `aggregates.totalItems` value is materially higher than 30/46 in production, but the verification script and operator both report the category RPC row count as the operative "masthead" measurement. Either the masthead is rendering one number and verification is reading another, OR a runtime path is making `aggregates` fall back so the masthead actually displays 30/46.
- **Path Q (need confirmation):** there's a code path where `aggregates` returns 0 or undefined and the masthead falls through to `initialResources.length` (the category RPC row count). In `MarketPage.tsx:222` and `OperationsPage.tsx:330`, `aggregates?.totalItems ?? initialResources.length` is exactly the fallback.

**Resolution before implementation:** run a live check at the org_id used in verification (a0000000-0000-0000-0000-000000000001) and capture both `aggregates.totalItems` AND `initialResources.length` for /market and /operations. If they diverge, the audit's "fix" must address whichever one the customer actually sees in the rendered masthead. The fix proposals below assume the operator-stated values are what customers see (i.e. the category-routed counts are operative).

---

## Surface-by-surface analysis

### `/research`

**Fetcher chain.** Page entry point `src/app/research/page.tsx:45-54`:

```ts
const [pipeline, research, aggregates, sourceCoverage] = await Promise.all([
  getResearchPipeline(),     // pipeline rows, capped at 100
  getResearchItems(),         // category-routed allow-list
  getScopedWorkspaceAggregates(RESEARCH_SCOPE),  // RESEARCH_SCOPE = {} → workspace-wide
  getResearchSourceCoverage(),
]);
```

**Pipeline fetcher.** `src/lib/data.ts:488` defines `RESEARCH_PAGE_CAP = 100`; `src/lib/supabase-server.ts:736-866` (`fetchResearchPipelineRows`) queries `intelligence_items WHERE is_archived=false ORDER BY added_date DESC LIMIT 100`. NO domain or category filter on the SQL. Just date-sorted, archive-filtered, capped at 100.

**Allow-list fetcher.** `getResearchItems` → `fetchResearchItems` → `runCategoryRpc(orgId, 'get_research_items')` → migration 084's `get_research_items` RPC. That RPC filters on `s.category = 'research'` PLUS item-status-conditional overrides (standards_body items NOT in_force/adopted, primary_legal_authority items proposed). Live result: 137 rows in the allow-list.

**Page-level filter.** Lines 62-68 build a Set of IDs from the allow-list then intersect with pipeline rows:

```ts
const allow = new Set(research.resources.map((r) => r.id));
const filteredRows = allow.size
  ? pipeline.rows.filter((r) => allow.has(r.id))
  : pipeline.rows;
```

`total={allow.size ? filteredRows.length : pipeline.total}` (line 98).

**Masthead derivation.** `src/components/research/ResearchView.tsx:456` does `const totalDisplay = aggregates?.totalItems ?? total ?? items.length;`. With `RESEARCH_SCOPE = {}` the scoped aggregates RPC degrades to workspace-wide and returns 641. **If `aggregates.totalItems` is truthy (641), the masthead should display 641, not 13.** The fact that the operator reports 13 implies either `aggregates` is failing at runtime (falling through to `total = filteredRows.length = 13`) or the masthead the operator is reading is a different code path than ResearchView.tsx:456.

**Where the underrepresentation gap comes from.**

- **Primary cause:** `RESEARCH_PAGE_CAP = 100` LIMIT on the pipeline query intersected with a 137-row category allow-list. The pipeline's `ORDER BY added_date DESC` returns the 100 most recent items across the WHOLE workspace (all 641 active items). Only 13 of those 100 most recent are in the research category allow-list. The other 124 allow-list items are older and never make it into the page-1 payload.
- **Secondary cause (if aggregates is failing):** the masthead's fallback chain `aggregates.totalItems ?? total ?? items.length` lands on `total = filteredRows.length = 13`. If aggregates were working, the masthead would read 641 — which would be wrong in the opposite direction (workspace-wide is not the right scope for /research either).
- **Neither value is correct.** The customer-honest count for /research is the research category allow-list size (137) or the D7-active count (90), depending on operator intent.

**Proposed fix.** See Fix 1 below.

---

### `/market`

**Fetcher chain.** `src/app/market/page.tsx:36-40`:

```ts
const [marketIntel, fallback, aggregates] = await Promise.all([
  getMarketIntelItems(),                    // category-routed
  getResourcesOnly(),                       // workspace-wide slim, used only for seed fallback
  getScopedWorkspaceAggregates(MARKET_SCOPE),  // {item_types:["technology","innovation","market_signal"], domains:[2,4]}
]);
```

**Category fetcher.** `getMarketIntelItems` → `fetchMarketIntelItems` → migration 084's `get_market_intel_items` RPC, which filters strictly on `s.category = 'market_news'`. Trade-press outlets routed to Research are excluded via the `sources.category` canonical column. Live result: 46 rows.

**Scoped aggregates.** `MARKET_SCOPE = {item_types: ["technology","innovation","market_signal"], domains: [2, 4]}`. The 069 RPC OR-combines: items match if `item_type IN (...)` OR `domain IN (...)`. D2 active = 38, D4 active = 70 → union ≥ 70, plus any technology/innovation/market_signal items outside those domains. Estimated `aggregates.totalItems` ≈ 70-110.

**Masthead derivation.** `src/components/pages/MarketPage.tsx:222`: `const totalSignals = aggregates?.totalItems ?? initialResources.length;`. The masthead JSX (line 233) renders `<b>{totalSignals}</b> active signals`. If `aggregates.totalItems` is truthy and ~70-110, that's the rendered value. If `aggregates` is failing or 0, the fallback is `initialResources.length` = 46 (category RPC row count).

**Where the underrepresentation gap comes from.**

- The `sources.category = 'market_news'` filter in `get_market_intel_items` is strictly narrower than the page-level scope intent. D2 items whose source has `category != 'market_news'` (e.g. an IEA technology rollout item where IEA is sourced as `statistical_data_agency` → `category = 'operational_data'`) get excluded from the row payload, even though MARKET_SCOPE says they should be in the page's scope.
- This is the same shape as /research: the RPC filter is "source.category = X" but the operator-intended scope is "item is in D2 ∪ D4 ∪ {technology, innovation, market_signal}". Source-category does not map 1:1 to item-domain.

**Proposed fix.** See Fix 2 below.

---

### `/operations`

**Fetcher chain.** `src/app/operations/page.tsx:47-51`:

```ts
const [opsItems, fallback, aggregates] = await Promise.all([
  getOperationsItems(),                       // category-routed
  getResourcesOnly(),                         // workspace-wide slim, used for regulation cross-refs
  getScopedWorkspaceAggregates(OPERATIONS_SCOPE),  // {item_types:["regional_data"], domains:[3, 6]}
]);
```

**Category fetcher.** `getOperationsItems` → `fetchOperationsItems` → migration 084's `get_operations_items` RPC, filtering strictly on `s.category = 'operational_data'`. Live result: 30 rows.

**Scoped aggregates.** `OPERATIONS_SCOPE = {item_types: ["regional_data"], domains: [3, 6]}`. D3=111, D6=2 → union ≥113. Plus any `regional_data` item_type outside D3/D6. Estimated `aggregates.totalItems` ≈ 113-130.

**Masthead derivation.** `src/components/pages/OperationsPage.tsx:330`: `const totalItems = aggregates?.totalItems ?? initialResources.length;`. Masthead JSX (line 372) renders `<b>{totalItems}</b> active items`. Same shape as Market.

**Where the underrepresentation gap comes from.**

- Same root cause as /market: the RPC's `s.category = 'operational_data'` filter is much narrower than the page-level intent. D3 (Regional Ops) holds 111 items; most have sources whose `category` is NOT `operational_data` (e.g. trade press analyzing a region routes to market_news or research). Only 30 items have a source whose canonical category is `operational_data`.
- The 111-30 = 81 D3 items routed out of /operations end up either (a) on /market if their source.category = 'market_news', (b) on /research if their source.category = 'research', or (c) nowhere visible to the customer if their source.category is NULL.

**Proposed fix.** See Fix 3 below.

---

### `/regulations` (control — no gap)

**Fetcher chain.** `src/app/regulations/page.tsx:52-56`:

```ts
const [data, aggregates] = await Promise.all([
  getListingsOnly(),
  getScopedWorkspaceAggregates(REGULATIONS_SCOPE),  // {domains: [REGULATIONS_DOMAIN]} = {domains:[1]}
]);
```

**Masthead derivation.** Line 96-97: `const activeRegulationsCount = aggregates.totalItems || regulationResources.length;` then `meta = \`...${activeRegulationsCount} active regulations...\``. Live: 319.

**Why this surface is correct.** The masthead reads from the SCOPED AGGREGATES RPC (domain=1), not from a category-routed RPC. The aggregates RPC operates over the whole `intelligence_items` table filtered by domain, not joined through the sources table. There's no `sources.category` narrowing — every D1 item counts regardless of its source's category. 319/319 exact match.

**Lift the other surfaces need.** Switch the masthead's authoritative count from the category-RPC row count to the scoped aggregates RPC, AND extend the scoped aggregates RPC scope to capture the operator-intended union (currently the SCOPE constants are correct; the issue is whether the masthead reads them or falls back to the row count).

---

## Proposed fixes

### Fix 1: `/research` — change the source of the masthead total and lift the LIMIT 100 cap on the rendered payload

**Two-part fix.**

**Part 1A — masthead reads category-routed total directly, not pipeline-intersection.** Change `src/app/research/page.tsx` to pass `total={research.total}` (the full 137-row category allow-list size) instead of `filteredRows.length` (the 13-row pipeline intersection). The masthead's job is corpus honesty; the in-view payload is a separate concern.

```diff
-  total={allow.size ? filteredRows.length : pipeline.total}
+  total={research.total}
   shown={items.length}
   cap={pipeline.cap}
```

ResearchView.tsx:456 already has the right fallback chain — `aggregates?.totalItems ?? total ?? items.length`. With aggregates returning workspace-wide 641 (because RESEARCH_SCOPE is empty `{}`), the masthead would still show 641 if aggregates is operative. To fix that AND ensure the right number renders:

**Part 1B — scope RESEARCH_SCOPE properly so aggregates returns the research-category count.** Change `RESEARCH_SCOPE` from `{}` to `{domains: [7]}` (or a category-aware scope when one exists). Then `aggregates.totalItems` = 90 (D7 active). That's closer to the operator-intended "corpus of research" but still doesn't capture the 47 cross-domain Research-bound items (Carbon Trust, Project Drawdown, analytical trade press) that get routed to Research via `sources.category = 'research'` but live in other domains.

**Part 1C — extend the scoped aggregates RPC to accept a category filter.** Migration 069 currently scopes by `item_types` and `domains`. Add a third optional key `source_categories` (text[]) that joins on `sources.category`. Then `RESEARCH_SCOPE = {source_categories: ['research']}` and the masthead shows the true research-routed count (137).

**Tradeoffs.**

- Part 1A alone gets the masthead to the 137 number IF aggregates is failing or RESEARCH_SCOPE doesn't change. Cheapest fix.
- Parts 1A + 1B together get the masthead to 90 (D7) — semantically aligned with the dispatch's "D7 active = 90" framing.
- Parts 1A + 1B + 1C together get the masthead to 137 — semantically aligned with what /research actually shows after the LIMIT/intersection is dropped.
- **Perf:** the pipeline LIMIT 100 was the ISR-burn mitigation (see /research page comment lines 9-14). Lifting it to "the full allow-list size, paginated" requires pagination work on the ResearchView client (currently there is no Page 2). For Sprint 3, retaining the LIMIT 100 but expanding it to operate on the ALREADY-FILTERED allow-list (137 rows) instead of the unfiltered intelligence_items table is the minimum-risk option. Concretely: change `fetchResearchPipelineRows` to accept an `allowIds: string[]` argument and filter `WHERE id = ANY(allowIds)` before the LIMIT. Then the page-1 payload is the 100 most-recent OF THE ALLOW-LIST, not the 100 most-recent of everything. With allow-list size 137, page 1 shows the most recent 100 of 137, masthead truthfully reads 137.

**Recommended scope.** Parts 1A + 1B + 1C in a single dispatch, plus the allow-list-aware LIMIT inside `fetchResearchPipelineRows`. ~3 commits: (1) migration to add `source_categories` to 069 RPC; (2) `fetchResearchPipelineRows` accepts allow-list and filters before LIMIT; (3) `/research/page.tsx` switches `RESEARCH_SCOPE` and passes `research.total` to ResearchView.

---

### Fix 2: `/market` — extend scoped aggregates to OR over source_categories

**Single-part fix, parallel to Fix 1C.**

After migration 069 is extended with the optional `source_categories` key (see Fix 1C), update `MARKET_SCOPE`:

```diff
 const MARKET_SCOPE = {
   item_types: ["technology", "innovation", "market_signal"],
   domains: [2, 4],
+  source_categories: ["market_news"],
 };
```

The 069 RPC already OR-combines `item_types` and `domains`. Add `source_categories` to the OR chain so an item matches if ANY of the three predicates fires. Then `aggregates.totalItems` for /market = `|D2 ∪ D4 ∪ market_news-sourced items|` ≈ 70-110. Masthead reads aggregates.totalItems via line 222.

**Additional concern: payload still filtered by RPC.** The masthead total becomes corpus-honest, but `initialResources` still comes from `get_market_intel_items` which is strictly `s.category = 'market_news'`. So the customer sees a masthead saying "108 active signals" but only 46 cards rendered. That's the same surface-shape problem /research has.

**Two options for the payload.**

- **Option A (looser RPC):** rewrite `get_market_intel_items` to query items where `s.category = 'market_news'` OR `domain IN (2, 4)` OR `item_type IN ('technology', 'innovation', 'market_signal')`. Same OR chain as the scoped aggregates. Payload grows from 46 to ~108. Customer sees a consistent masthead and card list.
- **Option B (masthead-only fix):** keep the RPC narrow but render a "Showing N of M" disclosure under the masthead (same pattern /research already uses via the `cap`/`shown` props). Customer sees "108 active in scope · 46 currently displayed under market_news routing" — honest about both the corpus AND the routing.

**Recommended scope.** Migration 069 extension (shared with Fix 1) + MARKET_SCOPE update + Option A rewrite of `get_market_intel_items` RPC. ~2 commits on top of Fix 1's migration: (1) `/market/page.tsx` SCOPE update; (2) `get_market_intel_items` RPC widening (with note that source_role-routed exception lists from migration 084 must be preserved).

---

### Fix 3: `/operations` — same shape as Fix 2

After migration 069 extension, update `OPERATIONS_SCOPE`:

```diff
 const OPERATIONS_SCOPE = {
   item_types: ["regional_data"],
   domains: [3, 6],
+  source_categories: ["operational_data"],
 };
```

Then `aggregates.totalItems` ≈ 113-130 (D3+D6 plus regional_data items elsewhere plus operational_data-sourced items elsewhere).

**Payload.** Same Option A / Option B framing as Market:

- **Option A:** rewrite `get_operations_items` to widen to `s.category = 'operational_data'` OR `domain IN (3, 6)` OR `item_type = 'regional_data'`. Payload grows from 30 to ~113.
- **Option B:** keep narrow + render "Showing N of M" disclosure.

**Recommended scope.** Migration 069 extension (shared) + OPERATIONS_SCOPE update + Option A rewrite of `get_operations_items` RPC. ~2 commits: (1) `/operations/page.tsx` SCOPE update; (2) `get_operations_items` RPC widening.

---

## Shared architectural pattern

**Yes — there is a single architectural pattern.** All three gaps are the same shape: the customer-facing surface filters by `sources.category` (a routing taxonomy) but the corpus that customers care about is filtered by `item.domain` and `item.item_type` (semantic taxonomies). Source-category and item-domain are orthogonal — a single item can have a source whose category is "research" but the item itself lives in D3 Regional Ops. The customer surface that mounts that item is determined by the source's category, NOT the item's domain.

This is by design (per environmental-policy-and-innovation SKILL Section 3 + migration 084), but the masthead total has been letting the SOURCE-routing taxonomy define corpus honesty. That conflation is the bug.

**The single fix shape.** Extend migration 069 (`get_workspace_intelligence_aggregates_scoped`) with a third optional key `source_categories` that OR-combines with `item_types` and `domains`. Then every customer surface can express its scope as a union of all three taxonomies, and the masthead always reads from the aggregates RPC (never from the category-routing RPC row count).

The page-level payload (the cards rendered, NOT the masthead) is a separate question: do we widen the category RPCs to match the scope union (Option A), or do we keep them narrow and render a "Showing N of M" disclosure (Option B)? That decision is per-surface and per-operator-intent. /research already uses cap/shown for the disclosure pattern, so Option B is precedented there. /market and /operations have no such disclosure today — Option A is cleaner UX (consistent masthead and card list), Option B is honest about the routing taxonomy.

---

## Implementation plan

Per the operator's 4-6 commit estimate, the recommended atomic-commit plan is:

| # | Commit | Scope | Verification |
| --- | --- | --- | --- |
| 1 | Migration 069 v2 (e.g. `108_scoped_aggregates_source_categories.sql`) | Add optional `source_categories` text[] key to `get_workspace_intelligence_aggregates_scoped` (OR-combines with existing item_types and domains). Idempotent CREATE OR REPLACE. | Direct RPC call with `{source_categories:['research']}` returns count > 0 (~137 expected). |
| 2 | `fetchResearchPipelineRows` accepts `allowIds` and filters before LIMIT 100 | `src/lib/supabase-server.ts:736` adds optional `allowIds: string[]` arg; SQL adds `.in('id', allowIds)` before `.order().limit()`. | Spot-check that with allowIds = 137-row research set, pipeline returns 100 rows (the most-recent 100 of the 137), not 100 from the workspace. |
| 3 | `/research/page.tsx` scope + masthead fix | `RESEARCH_SCOPE` → `{source_categories: ['research']}`. Pipeline call passes `allow` as `allowIds`. Masthead `total={research.total}` (137). | A1 verification script re-run shows /research masthead = 137 (was 13). Shown count = min(137, 100) = 100. |
| 4 | `/market/page.tsx` MARKET_SCOPE + RPC widening | `MARKET_SCOPE` adds `source_categories: ['market_news']`. `get_market_intel_items` RPC widened to OR over source.category + domain + item_type (Option A); preserve the source_role exception lists from migration 084 inside the WHERE. | A1 verification re-run shows /market masthead matches aggregates ≈ 70-110 and payload row count matches. |
| 5 | `/operations/page.tsx` OPERATIONS_SCOPE + RPC widening | Same shape as commit 4. `OPERATIONS_SCOPE` adds `source_categories: ['operational_data']`. `get_operations_items` RPC widened (Option A). | A1 verification re-run shows /operations masthead ≈ 113-130 and payload row count matches. |
| 6 | Audit re-run + Sprint 3 followups OBS update | Re-run `scripts/sprint3-a1-masthead-verify.mjs`. Add expected post-fix numbers to verification report. Close OBS entries on /research, /market, /operations underrepresentation. | All four surfaces show masthead = corpus-honest count within ±5%. |

Total: 6 commits, 1 migration, 3 surface changes, 2 RPC widenings, 1 helper-fetcher extension.

---

## Cross-surface count reconciliation post-fix

After the 6-commit plan ships, re-run `scripts/sprint3-a1-masthead-verify.mjs`. Expected output JSON:

```json
{
  "surfaces": {
    "regulations": { "masthead_total": 319 },           // unchanged (control)
    "research":    { "masthead_total": 137 },           // was 13 (×10.5)
    "market":      { "masthead_total": "70-110 band" }, // was 46 (≥1.5×, likely 2×+)
    "operations":  { "masthead_total": "113-130 band" } // was 30 (×3.7+)
  },
  "total_active_items": 641
}
```

**Honesty contract met:** every customer surface's masthead is within ±5% of the operator-intended scope union (item_types ∪ domains ∪ source_categories) for that surface. The "/regulations = D1 exact" precedent is matched on the other three surfaces.

The script does not need code changes (it currently measures category-routed RPC row count) — but a follow-up edit should change it to ALSO read the aggregates RPC with each scope filter, so the verification distinguishes "RPC row count" from "masthead total" cleanly. That edit is optional and can land in commit 6.

---

## Risks

**Top risk: widening `get_market_intel_items` and `get_operations_items` invalidates the customer-facing routing intent.** The current narrow filters exist because environmental-policy-and-innovation SKILL Section 3 says trade-press analytical content belongs on /research, not /market — and the source.category column was built to enforce that routing precisely. If Fix 2/Fix 3 Option A widens those RPCs to OR over domain and item_type, items routed away from /market by their source.category will reappear on /market via their domain match. That defeats the purpose of migration 084's source-category routing.

**Mitigation.** Prefer Option B (masthead-only fix + "Showing N of M" disclosure) over Option A on /market and /operations. Keep the category RPCs strictly source-routed; let the masthead honestly disclose the corpus-vs-shown gap. The customer sees:

> Market Intelligence · 108 active signals in workspace scope · 46 routed to market_news view

That's honest, doesn't pollute the customer-facing routing taxonomy, and surfaces the gap as data quality intelligence (operator can decide whether items that scope-match but route elsewhere should be cross-mounted).

**Secondary risks.**

- **Pagination on /research after LIMIT-100 is preserved on the allow-list:** if the allow-list ever exceeds 100, the customer sees only the most-recent 100. Sprint 3 should ship with allow-list size ≈ 137; only the most-recent 100 render. ResearchView's existing `cap`/`shown` disclosure handles this honestly (already in place). No new pagination work required for Sprint 3, BUT if allow-list grows past ~200 a real Page 2 becomes necessary.
- **069 RPC signature change risk:** adding `source_categories` to the JSONB scope is backward-compatible (optional key), but the same client-cached-overload risk that 069 itself was created to avoid is mitigated by keeping the same function name and only widening the JSONB shape. PostgREST + Supabase clients should pick up the change cleanly on redeploy.
- **The verification-vs-rendered discrepancy may surface unexpected current state:** before any code lands, run an investigation pass to confirm what /research, /market, /operations mastheads ACTUALLY display in production today (vs what the verification script measures). If the rendered masthead is already showing aggregates.totalItems (e.g. 641 on /research), the gap shape and fix priority changes. This pass is the same shape as CLAUDE.md's "Verification Before Authorization" rule and should be the first deliverable of the implementation dispatch.
- **Anonymous/no-auth users:** the category RPCs return empty for anon callers (no org membership), which is why ResearchView's allow.size fallback exists. The proposed Fix 1A's `total={research.total}` still works for anon (0), but the masthead would then show 0 active findings. Acceptable trade — anon callers don't have a workspace, so a 0 masthead is accurate.
- **Carbon Trust + Project Drawdown exception:** these statistical_data_agency sources are routed to research category in migration 084's CASE. Fix 2/Fix 3 Option B is unaffected. Fix 2/Fix 3 Option A would re-include them in /operations payload via domain match if they're in D3/D6, which is wrong. Argues further for Option B over Option A.

---

## OBS coverage (from Sprint 3 followups)

This dispatch is itself an authorized HIGH-priority new entry on the Sprint 3 followups tally (per operator framing). No OBS entries from prior Sprint 3 dispatches need to be covered here — the audit reports findings only, no writes ship. Implementation commits 1-6 above are where OBS coverage must be enumerated.

## DP compliance

This is a read-only audit producing a single new file. No surfaces, no migrations, no code paths shipped. DP compliance review applies at the implementation dispatch, not at the audit phase.
