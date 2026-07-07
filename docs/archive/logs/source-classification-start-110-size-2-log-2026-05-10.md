# Source classification backfill — batch 1

**Generated:** 2026-05-11T01:41:09.472Z
**Halted on error:** no

## Summary

| Metric | Value |
|---|---|
| Total classified rows in JSON | 783 |
| Dropped (AMBIGUOUS) | 39 |
| Dropped (URL-split flagged) | 0 |
| Candidates after filter | 744 |
| Selected for batch 1 | 2 |
| UPDATEs issued (success) | 2 |
| Skipped — already classified | 0 |
| Skipped — read fail / other | 0 |
| Tier overrides | 0 |
| Errors | 0 |

## Tier overrides by direction

_none_

## Role distribution (this batch)

| Role | Count |
|---|---|
| primary_legal_authority | 1 |
| intergovernmental_body | 1 |

## Confidence distribution (this batch)

| Confidence | Count |
|---|---|
| HIGH | 2 |

## Notes / schema gaps

- Migration 067 (2026-05-10) added classification_confidence and classification_rationale to public.sources. Per-row UPDATE now writes 12 fields atomically.

## Per-row log

| # | id | name | items | role | tier (existing → new) | confidence | action |
|---|---|---|---|---|---|---|---|
| 1 | `2f7e1fcf-17b4-40e3-9770-2f54afd14ce9` | Legislative Assembly of Manitoba | 1 | primary_legal_authority | T1 → T1 keep | HIGH | UPDATED |
| 2 | `306c0fb8-6a54-47af-a4d9-973ccc3f70b7` | International Renewable Energy Agency (IRENA) | 1 | intergovernmental_body | T3 → T3 keep | HIGH | UPDATED |

---

HOLD — batch 2 awaits operator approval
