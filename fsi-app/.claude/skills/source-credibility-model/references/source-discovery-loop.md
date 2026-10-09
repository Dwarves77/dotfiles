## Section 5: Source Discovery Loop

### Citation extraction at ingest

The agent at brief generation emits a "New Sources Identified" markdown table per the system prompt contract at `src/lib/agent/system-prompt.ts:358-368`. Extraction logic at `src/app/api/agent/run/route.ts:479-580` parses the table and routes each citation:

- If the URL matches an existing `sources` row: write a row to `source_citations` (source-to-source edge); also write to `intelligence_item_citations` once Q1 lands.
- If the URL doesn't match: write to `provisional_sources` with the agent's tier estimate, incrementing `citation_count` and updating `citing_source_ids` on repeated citations.

### URL canonicalization at resolution

Per Q10 (migration 087, helper at `src/lib/sources/url-canonicalize.ts`), all URL-based source resolution goes through `canonicalizeUrl()`. This lowercases scheme and host, strips www prefix, trims trailing slash, sorts query params, strips fragments. Resolution sites are documented in the Q10 dispatch report; future resolution code MUST use the helper.

### Candidate surfacing threshold

Per Q7: candidates with classifier confidence > 0.65 surface to the operator review queue (`canonical_source_candidates` table; admin UI at `src/components/sources/CanonicalSourceReview.tsx`). Below-threshold candidates accumulate in `provisional_sources` without surfacing.

### Citation-frequency promotion threshold

Per Q7: a candidate with 3+ citations and weighted sum >= 2.5 promotes to operator review regardless of classifier confidence. This catches sources the platform learns about through repeated citation even when individual classification confidence is moderate.

### Tier-opinion preservation

Per Q3: when the agent's brief generation cites an EXISTING source AND has a tier estimate for it that differs from the source's current `base_tier`, record the opinion as evidence. Schema TBD: either a new `tier_opinions` table (citing_source_id, target_source_id, opined_tier, opinion_date, opinion_source) or an extension to `source_citations` (add opined_tier column).

Aggregated disagreement flag: when 5+ opinions disagree with the database tier on the same source within a 90-day window, surface to operator review as a tier reconsideration prompt.

This makes the discovery loop self-improving on existing sources, not just on new ones.

### Expected operator review queue size

Per Q7: 5-15 new candidates per week. Thresholds are tunable starting points; adjust based on observed queue size and review experience.
