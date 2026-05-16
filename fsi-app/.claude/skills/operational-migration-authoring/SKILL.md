---
name: operational-migration-authoring
description: STUB. When and how to write a Supabase migration. Patterns: idempotent ADD COLUMN, BEGIN/COMMIT wrapping, COMMENT ON COLUMN, no breaking changes without backfill plan. Schema audit identified migration registry corruption (gaps 026-050) that this skill addresses on next consolidation.
---

# Operational: Migration Authoring

## Purpose

When a schema change is needed (new column, new table, new constraint), this skill provides the patterns for authoring a clean migration that:
- Is idempotent (re-running is safe)
- Wraps in BEGIN/COMMIT
- Includes COMMENT ON COLUMN for documentation
- Has a backfill plan for non-NULLABLE additions
- Numbers correctly given current migration registry state

## When to use

- New schema column needed (e.g., the phantom columns penalty_range, cost_mechanism, enforcement_body, legal_instrument that v2 audit Section 6.5 spec'd)
- New table needed (e.g., the entity tables from Section 6.1)
- New constraint needed (e.g., the severity-priority CHECK from Section 6.5)

## When NOT to use

- For data corrections (use [[operational-backfill-pattern]] instead)
- For RLS policy changes alone (different pattern; can be done via migration but the discipline is policy-first)

## Inputs

- The change being made (schema diff)
- Current migration registry state
- Backfill plan if applicable

## Outputs

- A new migration file at `fsi-app/supabase/migrations/NNN_descriptive_name.sql`

## Patterns (TO REFINE per archived migrations)

### Idempotent ADD COLUMN
```sql
ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS penalty_range TEXT NULL,
  ADD COLUMN IF NOT EXISTS penalty_range_confidence NUMERIC NULL;

COMMENT ON COLUMN intelligence_items.penalty_range IS
  'Penalty schedule extracted from full_brief by extractor-structured-facts. Free text; confidence tracked separately.';
```

### Wrapped DDL with rationale
```sql
-- Migration NNN: <description>
--
-- Why: <link to v2 audit section>
-- Backfill plan: <how existing rows get populated>
-- Reversibility: <how to roll back if needed>

BEGIN;

ALTER TABLE ...;

COMMIT;
```

### Schema migration registry awareness

Per the schema audit, `supabase_migrations.schema_migrations` has gaps for migrations 026-050. New migrations need to either:
- Register a registry-repair migration first (recommended)
- Or use a numbering scheme that avoids the gap collision

## Inherits

- [[rule-cross-reference-integrity]] (new schema columns must have writers AND readers — no phantom columns)

## Composition

Used by feature work that requires schema changes. Composes with [[operational-backfill-pattern]] when the migration adds NOT NULL columns to existing tables.

## Audit cross-reference

- Schema audit: migration registry corruption (gaps 026-050) is a deployment-blocker
- v2 audit Section 6.5 (schema columns the renderer reads must exist)
- v2 audit Section 6.1 (entity tables that need to be added)
