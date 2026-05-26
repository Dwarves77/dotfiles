# A5 Q2 Spot-Check — r.reasoning + r.why_matters content quality

**Date:** 2026-05-26
**Status:** READ-ONLY investigation complete. Verdict: **RED** — columns are EMPTY across active D1 corpus.

## Method

Script `scripts/sprint3-a5-q2-spotcheck.mjs` queries:

```sql
SELECT id, title, reasoning, why_matters, added_date, item_type, domain
FROM intelligence_items
WHERE is_archived = false
  AND domain = 1
  AND reasoning IS NOT NULL
ORDER BY added_date DESC
LIMIT 10;
```

(The `reasoning IS NOT NULL` filter selects rows where the column was populated at some point. Empty-string rows pass through this filter because empty string is not NULL.)

## Findings

| Row | Title (truncated) | `reasoning.length` | `why_matters.length` |
| --- | --- | --- | --- |
| 1 | European Banking Authority - Key Regulatory Updates... | **0** | **0** |
| 2 | ESMA MiCA Transitional Period Expiration... (Jul 2026) | **0** | **0** |
| 3 | Financial Conduct Authority - Main Portal... | **0** | **0** |
| 4 | Active Vehicle Module (AVM) Search Tool - NHVR... | **0** | **0** |
| 5 | Metro Nashville Energy Sustainability Program... | **0** | **0** |
| 6 | Fit for 55: EU Climate Legislation Package... | **0** | **0** |
| 7 | EU Heavy-Duty Vehicle CO2 Emission Standards: 2025... | **0** | **0** |
| 8 | Local Law 97: NYC Greenhouse Gas Emissions Reduction... | **0** | **0** |
| 9 | Romania Ministry of Environment - Electronic Waste... | **0** | **0** |
| 10 | EU Regulation 2023/1804 - Sustainability Reporting... | **0** | **0** |

**Aggregate: 10 of 10 rows EMPTY on both columns.** Zero rows GOOD. Zero rows THIN. Zero rows MIXED. Pure RED.

## Verdict

**A5 Q2 RED.** The `reasoning` and `why_matters` columns exist in the schema (confirmed via migration 001) but carry NO content in the active D1 corpus. The "Why It Matters" block on /regulations/[slug] cannot render from these columns as-is — there is no editorial copy to render.

## What this changes for A5

The A5 scope-reset audit (commit 3794139) said: "Why It Matters live code already renders r.reasoning + r.whyMatters with a blue left-border block, which matches the mockup. Need to spot-check 5 production rows to confirm the existing column carries 2-paragraph editorial copy vs sparse/bullet content."

The spot-check disproves the assumption. The columns are present but unpopulated. A5 cannot "render from existing columns" because there is nothing in the existing columns.

## Three paths forward (operator-decide)

### Path A — Regenerate (substantial scope expansion)

Run a Sonnet regeneration pass over all D1 active items (~319 rows) with an updated agent prompt that explicitly emits a 2-paragraph editorial "Why It Matters" rationale, written to the `why_matters` column.

- Cost estimate: at ~$0.15/item per item via Sonnet 4.6, ~$50 for D1 alone. Higher if extended to all 641 active items.
- Time: hours to days depending on concurrency.
- Risk: agent prompt revision (SKILL.md update); regeneration touches all D1 briefs which were already regenerated under the current contract.
- Pattern: similar to v3 Phase B.2 full regeneration but scoped to one column.

### Path B — Parse from full_brief markdown (free, parse-fragile)

Extract Why It Matters from full_brief markdown. The agent prompt already emits structured sections; if there's a `## Why It Matters` heading (or similar) inside full_brief, a parser can pull it. Risk: parse-fragile per the A5 audit's parser warning. Some briefs may not have this section at all.

- Cost: 0.
- Coverage: only briefs that happen to include this section (unknown %; needs sampling).
- Pattern: similar to the A5 sections backfill parser, scoped to one extracted primitive.

### Path C — Hide the Why It Matters block until content exists (H1 precedent)

Per H1 trajectory + Coverage Gaps integrity precedents: drop visual UI when data doesn't support it honestly. Render Why It Matters block ONLY when `why_matters` column is non-empty. For all current D1 rows (where it's empty), the block is suppressed.

- Cost: 0.
- Coverage: 0% rendering until columns populate by some other means.
- Pattern: H1 precedent verbatim.
- Honest, but cosmetically thin until A5 follow-up populates columns.

## Recommendation

**Path C as Sprint 3 close** (preserves integrity, ships fast). **Path A as Sprint 4 candidate** (populate via deliberate Sonnet pass with prompt-locked Why It Matters emission, then flip rendering on).

Path B (parse) is unreliable enough that recommending it carries risk: parse failures would produce SILENT EMPTY rather than honest empty-state. The integrity rule prefers explicit empty-state over silent miss.

## A5 commit plan implication

The A5 commit plan (post operator decision on §10/§11 IN per locked Decision 2) needs Path C wiring at minimum:

- Modify RegulationDetailSurface to render Why It Matters block ONLY when `why_matters` is non-empty
- Same conditional on the Impact Assessment block if `impact_scores` JSONB is also empty (separate spot-check needed — not run by this audit)
- Sections 10 and 11 render from `intelligence_item_sections` per the locked decision; same conditional applies — render only when sections present

Verifying `impact_scores` population is a separate spot-check worth running before A5 ships.

## Open question for operator

1. Path C (hide until content exists) for Sprint 3 close, with Path A as Sprint 4 follow-up? Or Path A in Sprint 3?
2. Should I run an equivalent spot-check on `impact_scores` JSONB to confirm or rule out a parallel empty-data problem on the Impact Assessment primitive?
