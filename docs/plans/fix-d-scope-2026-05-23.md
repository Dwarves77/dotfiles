# Fix D scope (2026-05-23)

Architectural cleanup queued after the leakage-fix dispatch lands. Captures decisions surfaced during the /regulations hotfix + backfill investigation that are too big for the leakage-fix dispatch's scope.

## Anchor: NREL Warehouse Solar ROI

Item `b88753be-8ed4-4392-9cee-9f472c208513` ("Warehouse Solar & BESS ROI Analysis", source: NREL, item_type=`research_finding`) is the canonical case showing why **item_type-only routing is incomplete for facility content**.

By item_type: `research_finding` → d=7 (Research). The backfill rule does this.

By content fit for Caro's Ledge use cases (solar self-generation permissions, HVAC operational costs, cost-saving operational decisions): the item belongs in Operations Facility (d=6). A logistics operator deciding whether to install solar on a warehouse will look on the Operations Facility tab, not Research.

The rule treats it as research; the customer's mental model treats it as operational. Both are correct under different framings. The rule can't resolve this without a content-classification axis the current schema doesn't expose.

## Operations Facility sub-tab: open architectural question

Post-backfill, d=6 = 0 items. The Operations Facility sub-tab on `/operations` becomes empty. Two paths Fix D needs to choose between:

### Option A: Keep the sub-tab; refactor routing to handle facility content from research / standards sources

- Add a `facility_data` or `facility_application` item_type to the classifier vocabulary
- Augment the routing rule so items like NREL solar ROI (research_finding from research source, BUT operationally facility-applicable) get routed to d=6
- Disambiguation could use a new `applicability_tag` on intelligence_items (`['facility', 'regional', 'corporate']`) populated by the classifier
- Pros: preserves customer mental model; surfaces operationally-actionable research where customers expect it
- Cons: new vocabulary; classifier needs updating; ingest cost grows

### Option B: Remove the Facility sub-tab; treat Operations as Regional-primary

- Per operator: "Operations Regional is the live workhorse for stated use cases (regional wages, electricity tariffs, labor benchmarks)"
- Facility-applicable content surfaces on Research (NREL items) or Regulations (LEED standards)
- Pros: simpler architecture; no new vocabulary; no classifier change
- Cons: customer must cross-surface-search to assemble facility decisions; "what should I install in my warehouse" answer is distributed across Research + Regulations + Operations Regional

## Other Fix D items (cross-referenced from earlier docs)

- **`/research` surface limitation** (from `docs/plans/classification-backfill-plan-2026-05-22.md`): /research filters by `item_type === 'research_finding'`, not `r.domain === 7`. After backfill, framework + initiative items moved to d=7 are correctly classified but invisible on /research until application code adds d=7 to the filter OR REC-OBS-G wires category-aware RPCs end-to-end. JOLT was specifically unblocked via the source.category='research' override in migration 101; the broader pattern remains a Fix D concern.

- **Domain INT-to-label constants file** (from leakage fix queue): document the canonical 1-7 mapping at `fsi-app/src/lib/domains.ts` referenced by both classifier and surface filters. Today the mapping is implicit, scattered across `MarketPage.tsx`, `OperationsPage.tsx`, `RegulationsSurface.tsx`, `surface-coverage.ts`. Lands with leakage fix, but Fix D should ensure all surface filters consume the constants instead of literal integers.

- **REC-OBS-G full wiring** (named in `caros-ledge-platform-intent` skill): category-aware RPCs (`get_market_intel_items`, `get_research_items`, `get_operations_items`) currently consumed only by `/market` page. Wire end-to-end so /research and /operations route by source.category instead of by item_type / domain heuristics. Closes the surface-routing inconsistency that JOLT exposed.

## Decision dependencies

Fix D should not start until:
- Migration 101 is applied (backfill complete)
- Leakage fix dispatch lands (classifier emits domain; insert sites stop hardcoding)
- Backfill + leakage verified together on a test item

After those: Fix D as a single dispatch covering Operations Facility decision + /research surface wiring + domain constants + REC-OBS-G full implementation.

## Out of scope for Fix D

- Ingest cadence + restart planning (separate dispatch, separate authorization)
- Cost gating for classifier API spend (ingest-restart territory)
- Customer-facing posture during gaps (resolved by backfill + leakage fix)
- Sector matcher diagnostic (F, even later)

## Related

- [[classification-backfill-ambiguous-2026-05-22]] — Project JOLT (row 5) is the canonical item both docs use to argue content-fit vs item_type routing
- [[ingest-restart-sequencing-2026-05-22]] — Fix D's decision dependencies (backfill+leakage verified together) are that doc's sequence; both name REC-OBS-G / domain-constants follow-ons
- [[ingest-pipeline-investigation-2026-05-22]] — REC-OBS-G and the category-aware RPCs Fix D wires end-to-end are diagnosed there (migration 070 orphan RPCs)
- [[classification-backfill-plan-2026-05-22]] — Explicitly cross-references it; Fix D inherits the /research surface limitation and gates on migration 101 being applied
- [[spec-audit-synthesis-2026-05-23]] — Synthesis explicitly declares Fix D partially superseded by the rebuilds (Facility + /research limitations absorbed)
