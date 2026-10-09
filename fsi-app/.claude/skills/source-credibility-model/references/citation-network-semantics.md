## Section 4: Citation Network Semantics

### Edge tables

Two edge tables hold citation relationships:

- **`source_citations`** (existing per migration 004): source-to-source edges. When source A cites source B, a row is inserted with `source_id` (citing), `cited_source_id`, `detected_at`, `context`. Used for tier-weighted credibility scoring.

- **`intelligence_item_citations`** (NEW per Q1, schema TBD): brief-to-source edges. When intelligence_item X cites source Y, a row is inserted. Backfilled from `intelligence_items.sources_used` (UUID[]) for INPUT-source associations at launch. Discovered-source associations (from agent "New Sources Identified" markdown tables) fill organically going forward. Historical markdown parsing is out of scope per decisions doc Flag 3.

### Tier-weighted citation sum

```
weighted_sum(source_id) = SUM(
  tier_weight(citing_source.effective_tier) * decay_factor(detected_at)
) FOR each row in source_citations WHERE cited_source_id = source_id
```

**Tier weights** (verbatim from Q7):

- T1 = 1.0
- T2 = 0.85
- T3 = 0.7
- T4 = 0.5
- T5 = 0.3
- T6 = 0.15
- T7 = 0

### Independence and syndication (corroboration integrity)

Corroboration STRENGTH counts INDEPENDENT corroborators, not raw citation edges. When N outlets
republish a single underlying announcement (one press release, one wire story), that is ONE
corroboration, not N — syndication is collapsed to its origin before counting. Two integrity rules
follow, both load-bearing for any "how well-corroborated is this signal?" judgment (the Market
surface's corroboration-count grounding model in particular):

1. **Independent over raw.** Count distinct INDEPENDENT corroborators (citers sharing a syndication
   group collapse to one), never the raw edge count. Raw count rewards a single announcement echoed
   across an aggregator network, inflating credibility from one source.
2. **Tier over volume.** A corroborator's weight is its institutional tier (T1 best … T7 = 0), not how
   often it appears. Ten low-tier echoes do not outweigh one T1/T2 independent confirmation; high
   citation volume from low-tier sources must not elevate credibility (the Section 1 principle).

Implementation: `src/lib/sources/source-growth.ts` (`aggregateConvergence`) collapses each syndication
group to one unit at its best tier, then reports `independent_citers` / `confirmation_count` /
`highest_citing_tier`; the trust citation component (`src/lib/trust.ts`) consumes those, not raw edge
counts. Distinguish the two measures: the tier-weighted decayed SUM below scores a source's STANDING
credibility over time (it can grow from many edges); the independent-citer COUNT scores a single
SIGNAL's corroboration strength right now. A signal is "strongly corroborated" only on independent,
suitably-tiered confirmation — never on volume alone.

### Recency decay

`decay_factor(detected_at)` is a half-life curve. Starting parameter: 18-24 months tunable; operator decides exact value (open sub-decision in the decisions doc). Formula:

```
decay_factor(detected_at) = 0.5 ^ ((NOW - detected_at) / half_life)
```

A citation at `now` contributes weight 1.0. A citation at `now - half_life` contributes weight 0.5. A citation at `now - 2 * half_life` contributes weight 0.25.

Decay applies to citation-network contributions to effective_tier ONLY. Decay does NOT apply to:

- `base_tier` (structural, not time-sensitive; a 2010 EU regulation is still binding at tier 1 in 2026)
- accessibility decay (separate existing logic in `src/lib/trust.ts` operating on `last_accessible` timestamps)
- `tier_history` audit trail (immutable record)

### Promotion threshold

Per Q7: a source is candidate for tier elevation when `weighted_sum >= 2.5`. The threshold accounts for tier-weighted contributions (a single T1 citation = 1.0, so the threshold requires effectively 2-3 high-tier citations or many more low-tier citations).

### Recompute cadence

Daily batch. The recompute job:

1. For each source, sums weighted decayed citation contributions
2. Computes `computed_dynamic_tier` as a function of `base_tier` plus the network signal
3. Writes `effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)` to the sources row
4. Logs to `source_trust_events` when `effective_tier` changes

The `source_citations.detected_at` column (existing per migration 004, currently unused in scoring) wires into the decay computation.
