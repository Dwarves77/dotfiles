# Regulations classification mismatch counts (2026-05-22)

**Scope:** read-only quantification of (item_type, domain) mismatches across non-archived `intelligence_items`. Feeds dispatch E (ingest pipeline investigation) and any subsequent backfill plan.

**Total non-archived items:** 646

## Domain totals

| domain | count | % of total |
|---|---|---|
| 1 (regulations) | 588 | 91.0% |
| 2 | 10 | 1.5% |
| 3 | 10 | 1.5% |
| 4 | 16 | 2.5% |
| 5 | 8 | 1.2% |
| 6 | 4 | 0.6% |
| 7 | 10 | 1.5% |
| NULL | 0 | 0.0% |

The 91% concentration in domain=1 is itself a symptom — the classifier is over-assigning to regulations.

## (item_type, domain) cross-tab

| item_type | total | d=1 | d=2 | d=3 | d=4 | d=5 | d=6 | d=7 |
|---|---|---|---|---|---|---|---|---|
| regulation | 150 | 148 | 1 | 0 | 0 | 1 | 0 | 0 |
| framework | 128 | 126 | 0 | 0 | 0 | 2 | 0 | 0 |
| guidance | 92 | 92 | 0 | 0 | 0 | 0 | 0 | 0 |
| regional_data | 66 | 54 | 0 | 10 | 0 | 0 | 2 | 0 |
| market_signal | 56 | 40 | 0 | 0 | 16 | 0 | 0 | 0 |
| initiative | 52 | 51 | 1 | 0 | 0 | 0 | 0 | 0 |
| research_finding | 35 | 24 | 0 | 0 | 0 | 0 | 1 | 10 |
| tool | 25 | 19 | 1 | 0 | 0 | 5 | 0 | 0 |
| directive | 19 | 19 | 0 | 0 | 0 | 0 | 0 | 0 |
| technology | 11 | 5 | 6 | 0 | 0 | 0 | 0 | 0 |
| standard | 11 | 10 | 0 | 0 | 0 | 0 | 1 | 0 |
| innovation | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |

## Conservative mismatch count

Items where `item_type` strongly implies a non-regulations domain but `domain=1`:

| item_type | mismatched (domain=1) | total of item_type | mismatch rate |
|---|---|---|---|
| market_signal | 40 | 56 | 71% |
| initiative | 51 | 52 | 98% |
| research_finding | 24 | 35 | 69% |
| technology | 5 | 11 | 45% |
| **TOTAL** | **120** | 154 | **78%** |

**120 of 588 items (~20% of the regulations bucket) are misclassified by this conservative heuristic.**

Heuristic vocabulary: `NON_REGULATION_HINTS = {market_signal, market_update, market_news, price_signal, technology, tech_signal, tech_readiness, operations_data, feasibility, lane_intel, research, research_finding, horizon_scan, initiative, program, investment, corporate_announcement}`. Only the 4 item_types above had any matches in the live data.

The real scope is probably larger:
- `tool` (19 in d=1) — some are clearly market/operations
- `regional_data` (54 in d=1) — may belong to /operations
- `framework` (126 in d=1) — some "frameworks" are voluntary standards (research), some are statutory (regulations)

The backfill plan will need a finer-grained mapping than this conservative heuristic.

## Reverse mismatches

Items where `item_type` implies regulations but `domain != 1`:

| item_type | mismatched (domain != 1) | total | reverse rate |
|---|---|---|---|
| framework | 2 | 128 | 1.6% |
| regulation | 2 | 150 | 1.3% |
| standard | 1 | 11 | 9.1% |
| **TOTAL** | **5** | 289 | 1.7% |

Reverse mismatches are rare. Likely small data issues or edge cases worth a per-item look during backfill design, not a systemic problem.

## Sample misclassified items (first 8)

```
2026-05-19  d=1  t=market_signal:   edie Sustainability Business News and Resources Portal
2026-05-19  d=1  t=market_signal:   Environmental Finance Market Update: Sustainable Debt, Nature Capital...
2026-05-10  d=1  t=initiative:      GLA Digital Careers Roadshow 2016 - East London Tech Recruitment Event
2026-05-10  d=1  t=market_signal:   Interstate 10 Kino to Country Club Project: Active Design-Build Construction...
2026-05-11  d=1  t=initiative:      Gallery Climate Coalition: International Art Sector Sustainability Initiative
2026-02-28  d=1  t=initiative:      First Movers Coalition
2026-02-28  d=1  t=initiative:      American Trucking Associations
2026-05-10  d=1  t=initiative:      European Clean Trucking Alliance Drives Rapid Decarbonization of Road Freight
```

These are clearly NOT regulations. They're trade-press articles, industry coalitions, business programs, and infrastructure projects — content that belongs on Market Intel, Research, or Operations per the environmental-policy-and-innovation skill Section 3 routing rules.

## Impact estimate if all 120 conservative mismatches are corrected

| Surface | Current bucket | After fix |
|---|---|---|
| /regulations | 588 | ~468 (down 120) |
| /market | (gains market_signal) | +40 |
| /research | (gains research_finding + technology) | +29 |
| /operations or /research (initiatives) | (gains initiative) | +51 |

The "regulations tracked" headline drops ~20%; the other surfaces grow visibly. Customer-visible impact is large.

## Inputs for the backfill plan

The backfill dispatch should consume this doc and produce:
- A per-(item_type, target_domain) UPDATE statement set
- Pre-state capture so each UPDATE is reversible
- Row counts per UPDATE that match this doc's numbers (or surface the discrepancy)
- A mapping table that the operator can review BEFORE any UPDATE runs

No DB writes without operator signoff. Quantification only.

## Related

- [classification-backfill-plan-2026-05-22](./classification-backfill-plan-2026-05-22.md) — Consumes the mismatch-counts doc; reconciles its conservative 120 against the granular 212
- [ingest-pipeline-investigation-2026-05-22](./ingest-pipeline-investigation-2026-05-22.md) — That doc's conservative 120-count feeds this investigation; both share the (item_type,domain) cross-tab
- [ingest-restart-sequencing-2026-05-22](./ingest-restart-sequencing-2026-05-22.md) — Explicitly cross-referenced as the conservative quantification feeding the backfill
- [spec-audit-regulations-2026-05-23](./spec-audit-regulations-2026-05-23.md) — Audit's R1 gap cites this doc's 120-of-588 domain=1 item_type misclassification counts directly
