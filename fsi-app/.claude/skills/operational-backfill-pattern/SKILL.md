---
name: operational-backfill-pattern
description: STUB. Discipline for one-shot backfills (data corrections, retroactive classifications, populating new columns). Distinct from migration-authoring (which is about schema). Idempotent, batched, with progress tracking and rollback plan.
---

# Operational: Backfill Pattern

## Purpose

When schema columns or relationships need to be populated retroactively across the corpus (e.g., backfilling `verticals[]` for the 626 items currently empty; populating `compliance_deadline` for the 644 items where the column exists but is null; running [[classifier-page-routing]] across all 644 items to set `primary_surface`), this skill provides the discipline.

Distinct from [[operational-migration-authoring]] (which is about schema changes; backfills run AFTER the schema is in place).

## When to use

- After a new column is added per [[operational-migration-authoring]]
- After a new classifier ([[classifier-jurisdiction]], [[classifier-vertical-mode]]) is built and existing items need the new tags
- After a data correction is identified (e.g., the EcoVadis reclassification was a single-row UPDATE; a corpus-wide trade_press → vendor_corporate reclassification would be a backfill)

## Pattern (TO REFINE)

1. **Idempotent.** Re-running the backfill against already-corrected rows is a no-op. UPDATE clauses include `WHERE existing_value != target_value` or equivalent.

2. **Batched.** Process N rows at a time (typical: 100-500), with progress logging. Avoid table-locking transactions over the full corpus.

3. **Progress tracking.** Backfill script writes its progress to a log table or file. Restart-safe: resumes from last completed batch.

4. **Rollback plan.** Document the inverse SQL. For data corrections, the prior values are recoverable from `intelligence_item_versions` per [[operational-versioning-and-changelog]]; for relationship inserts, document the DELETE clause.

5. **Sample first.** Before running across the corpus, run on 10 items, verify, then 100, verify, then full.

6. **Live DB writes use service-role.** Backfill scripts read credentials from `fsi-app/.env.local`. Per existing pattern in `fsi-app/scripts/`.

## Inputs

- Target columns or tables to populate
- Source of truth for the new values (a classifier, an extractor, a deterministic rule)
- Progress tracking strategy

## Outputs

- The backfill script in `fsi-app/scripts/backfills/<descriptive-name>-YYYY-MM-DD.mjs`
- A log of what was changed
- A rollback document

## Inherits

- [[rule-cross-reference-integrity]] (backfilled values must be canonical, not cause new drift)
- Whatever classifier / extractor produces the new values

## Composition

Composed with [[operational-versioning-and-changelog]] (every backfill UPDATE generates version log entries).

## Audit cross-reference

- v2 audit Section 7 (reading order: many of the priorities require backfills as part of the work)
- v2 audit Section 3 / S14 (96% empty verticals requires backfill)
- v2 audit Section 6.5 (structured fact extraction — populating new columns)
