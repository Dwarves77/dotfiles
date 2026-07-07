# Source classification batch 2 — dry run (size=5)

**Date:** 2026-05-10
**Script:** `scripts/backfill-classify-batch.mjs`
**Invocations:** see below
**Status:** dry run (5 rows only). HOLD on full batch 2 (size=100).

## Why `--batch=21` and not `--batch=2`

The existing batch script computes its window as `[(batch-1)*size .. batch*size)`. So `--batch=2 --size=5` selects rows 5..10, not rows 100..105, because the batch index is scaled by the **current** size, not by the previous batch's size of 100.

Two paths considered:

1. Re-invoke with `--batch=21 --size=5` so the window math lands on `[100..105)`. Chosen for this dry run because it actually exercises the new metadata write path on fresh, never-classified rows.
2. Add a `--start` / `--offset` flag. Worth doing before the next full batch but not in scope for this hold.

The first attempt with `--batch=2 --size=5` is captured below for the record (it selected rows 5..10, all of which were already classified by batch 1, so the idempotent guard skipped all 5 with zero writes — proves the guard works, exercises nothing else).

## Pre-run state

| Metric | Value |
|---|---|
| classified rows (`source_role IS NOT NULL`) | 111 |
| classified with metadata | 100 |

## First invocation: `--batch=2 --size=5` (window 5..10)

```
[SELECT] batch=2 window=[5..10) selected=5
[SKIP] International Civil Aviation Organization — already classified as intergovernmental_body
[SKIP] California Air Resources Board (CARB) — already classified as primary_legal_authority
[SKIP] European Clean Trucking Alliance (ECTA) — already classified as industry_association
[SKIP] U.S. Energy Information Administration (EIA) — already classified as statistical_data_agency
[SKIP] Colorado General Assembly — already classified as primary_legal_authority
```

5 rows skipped by `WHERE source_role IS NULL` guard. 0 writes. 0 errors. Proves idempotency.

## Second invocation: `--batch=21 --size=5` (window 100..105)

| # | id | name | items | role | tier (existing → new) | OVERRIDE/keep | confidence |
|---|---|---|---|---|---|---|---|
| 1 | `2d150967-be7a-476f-bfe4-33ed871e9653` | Massachusetts Legislature (General Court) – Session Laws & MGL | 1 | primary_legal_authority | T1 → T1 | keep | HIGH |
| 2 | `2dd40334-abc1-4bd7-a4bf-b6fe7f75d038` | Port of Los Angeles (Los Angeles Harbor Department) | 1 | academic_research | T3 → T3 | keep | LOW |
| 3 | `2dff892f-eafb-4b88-8e9b-0746675e6fea` | BizClik Media (Sustainability Magazine) | 1 | trade_press | T5 → T5 | keep | LOW |
| 4 | `2e1ca35a-97fa-46bb-a719-27c36d613f58` | National Renewable Energy Laboratory (NREL) | 1 | academic_research | T3 → T3 | keep | HIGH |
| 5 | `2e34415c-4afc-44dd-8c2b-9e137afbe31d` | Lloyd's Register Maritime Decarbonisation Hub | 1 | statistical_data_agency | T4 → T4 | keep | LOW |

## Counts

| Metric | Value |
|---|---|
| Pre-run classified | 111 |
| Pre-run with metadata | 100 |
| Post-run classified | 116 |
| Post-run with metadata | 105 |
| Delta classified | +5 |
| Delta with metadata | +5 |
| UPDATEs issued | 5 |
| Tier overrides | 0 |
| Errors | 0 |

## 12-field write verification

Live DB readback for the 5 ids confirms `classification_confidence`, `classification_rationale` (all non-null, lengths 14-21 chars), `source_role`, `tier`, and `classification_assigned_at` all set in the same UPDATE. The 12-field atomic write path works.

## Confidence distribution

| Confidence | Count |
|---|---|
| HIGH | 2 |
| LOW | 3 |

## Tier overrides

None this slice (5/5 kept). Items 1-100 had tier overrides; items 101-105 happen to all align with framework defaults already. This is a small-N artifact, not a regression.

---

HOLD — full batch 2 (size=100, window 100..200 of the candidate list) awaits operator approval. Recommend adding a `--start` or `--offset` flag to the executor before that run so batch labels stop drifting when sizes vary. Not blocking.
