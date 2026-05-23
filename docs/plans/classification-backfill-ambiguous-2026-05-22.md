# Classification backfill: ambiguous items needing per-item operator decision

Date: 2026-05-22
Companion to: `docs/plans/classification-backfill-plan-2026-05-22.md`
Migration: `fsi-app/supabase/migrations/101_intelligence_items_domain_backfill.sql`

## Summary

7 rows fall through the routing rule as AMBIGUOUS. All 7 are `item_type='initiative'` where the source's `category` is NULL in the `sources` registry. The migration applies the default route (`domain=4`, Market Intel) but the operator may apply per-row overrides.

The underlying cause is a sources-registry gap: 7 sources have not been classified per the 5-axis framework (migration 063 + 084), so the routing rule has no `source_role` or `category` to disambiguate.

Closing this gap permanently (operator classifies each source with `source_role` and `category`) automatically resolves the ambiguity and prevents future backfills from re-encountering it.

## Per-row review table

| # | item_id | title | item_type | source_name | source_role | current_domain | proposed_domain | ambiguity_reason |
|---|---|---|---|---|---|---|---|---|
| 1 | `01126119-5005-4617-b7a5-0f1e37f1bedb` | SAFA (Sustainable Air Freight Alliance) | initiative | (source missing from registry) | NULL | 1 | 4 (default) | source_id resolves to no source row; cannot disambiguate. Likely industry coalition -> d=4 (market intel). |
| 2 | `566f0598-7e1e-451d-b834-66ac9cecddb6` | TIACA Launches Keynote Speaker Series at Executive Summit 2026 in Warsaw | initiative | TIACA (The International Air Cargo Association) | NULL | 1 | 4 (default) | TIACA is industry_association; would route to category=market_news -> d=4. Operator should classify the source. |
| 3 | `9546c01a-dec6-46cc-88d7-56c7f30a7764` | E-Fuel Alliance | initiative | eFuel Alliance e.V. | NULL | 1 | 4 (default) | E-Fuel Alliance is industry consortium; likely industry_association/vendor_corporate -> category=market_news -> d=4. |
| 4 | `9d18608f-269e-405a-9ad8-afa638dda928` | SPC Impact 2026: Industry-Wide Shift in Sustainable Packaging Practices and Recyclability Standards | initiative | Sustainable Packaging Coalition (a project of GreenBlue) | NULL | 1 | 4 (default) | SPC is industry coalition / non-profit. Could be industry_association (market_news -> d=4) or academic_research (research -> d=7) depending on operator framing. |
| 5 | `b813d0a5-211b-4b56-9cee-503087c11486` | Project JOLT: Real-World eHGV Trials and Sustainable Road Freight Initiatives | initiative | Centre for Sustainable Road Freight | NULL | 1 | 4 (default) | Academic research centre; likely academic_research -> category=research -> d=7. Default of d=4 is plausibly wrong here. Operator should consider d=7. |
| 6 | `c8b7f538-bd0c-49ce-824e-c3b786c3ece0` | eFuel Alliance: Carbon-Neutral Renewable Fuels Initiative | initiative | eFuel Alliance e.V. | NULL | 1 | 4 (default) | Same source as row 3; same disposition. |
| 7 | `ed0d78a6-e368-4874-8075-bc65bd9f8fc2` | ZEMBA Maritime Buyers Alliance | initiative | ZEMBA (Zero Emission Maritime Buyers Alliance) | NULL | 1 | 4 (default) | Industry buyers alliance; industry_association -> market_news -> d=4. Default is plausibly correct here. |

## Operator decisions per row

If the operator agrees with the default (d=4) for all 7 rows, no action is required beyond approving the migration; the default routing applies.

If the operator wants to override per row, apply a follow-up UPDATE after migration 101 commits, e.g.:

```sql
-- Example: route Project JOLT to research (d=7) instead of the default d=4.
UPDATE public.intelligence_items
SET domain = 7
WHERE id = 'b813d0a5-211b-4b56-9cee-503087c11486';
```

## Recommended parallel cleanup (out of scope for this dispatch)

The right long-term fix is to register the 5 distinct sources (rows 2-7 cover 5 distinct sources after dedup) with `source_role` and `category` per the 5-axis classification framework (migration 063 + 084). The 5 sources:

1. TIACA (The International Air Cargo Association) — likely `industry_association` / `market_news`
2. eFuel Alliance e.V. — likely `industry_association` / `market_news`
3. Sustainable Packaging Coalition (GreenBlue project) — `industry_association` / `market_news` OR `academic_research` / `research` per operator judgment
4. Centre for Sustainable Road Freight — likely `academic_research` / `research`
5. ZEMBA — likely `industry_association` / `market_news`

Row 1 (SAFA) has a NULL source_id; the item likely needs a source-discovery pass to attach to a registered source.

Once those source classifications are set, re-running the backfill rule produces NO ambiguous rows.
