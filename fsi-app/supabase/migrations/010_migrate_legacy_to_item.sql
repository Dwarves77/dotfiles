-- ════════════════════════════════════════════════════════════════════
-- Migration 010 — idempotent migration of legacy intelligence content
--                 into the item_* tables introduced in 004.
--
-- Phase A.5.a of the four-phase Caro's Ledge minimum-working-product
-- plan. Per the docs/SCOPE_AUDIT.md "Schema findings summary", the
-- legacy {changelog, disputes, cross_references, supersessions,
-- timelines} tables are still read by the data layer; their item_*
-- equivalents (declared in 004 but only partially populated) are
-- written by no current code path. This migration backfills the
-- item_* tables from legacy so A.5.b can swap the read path without
-- data loss.
--
-- VERIFICATION — pre-state (2026-04-27, post-A.4):
--   ┌──────────────────────┬───────────┬───────────┬─────────────────────────┐
--   │ Pair                 │ legacy    │ item_*    │ Content check           │
--   ├──────────────────────┼───────────┼───────────┼─────────────────────────┤
--   │ changelog → item_*   │   9 rows  │   9 rows  │ identical               │
--   │ disputes → item_*    │   7 rows  │   7 rows  │ identical               │
--   │ cross_references →   │  49 rows  │  49 rows  │ identical, w/ value     │
--   │   item_*             │           │           │   normalization         │
--   │   ('references' →    │           │           │                         │
--   │    'related')        │           │           │                         │
--   │ supersessions →      │   5 rows  │   0 rows  │ NOT migrated            │
--   │   item_*             │           │           │                         │
--   │ timelines → item_*   │ 110 rows  │ 110 rows  │ identical, w/ partial-  │
--   │                      │           │           │   date normalization    │
--   │                      │           │           │   ('YYYY-MM' →          │
--   │                      │           │           │    'YYYY-MM-01')        │
--   └──────────────────────┴───────────┴───────────┴─────────────────────────┘
-- intelligence_items: 159 total / 123 with legacy_id populated.
--
-- Idempotency strategy:
--   Each statement uses INSERT … SELECT … WHERE NOT EXISTS keyed on the
--   natural identity of a legacy row. Re-running the migration after
--   it has already landed produces zero inserts.
--
-- Conflict-resolution clause: every WHERE NOT EXISTS effectively
-- behaves as ON CONFLICT DO NOTHING — we never overwrite an existing
-- item_* row with legacy data. The check is "is the legacy content
-- already represented in item_* by natural key" rather than "by id".
--
-- ID resolution:
--   Legacy rows reference resources by TEXT id (e.g. "o3", "a17").
--   item_* rows reference intelligence_items by UUID. We resolve
--   via intelligence_items.legacy_id ↔ legacy.resource_id JOINs.
--   If a legacy row references a resource_id that has no matching
--   intelligence_items.legacy_id, the JOIN drops the row — the
--   apply script logs these orphans rather than failing the migration.
--
-- Apply via:
--   node supabase/seed/apply-010-migration.mjs
--   (DDL/complex SQL can't be sent through the @supabase/supabase-js
--   client; the apply script implements these statements as a series
--   of pre-filtered INSERTs over the JS client — same data effect.)
-- ════════════════════════════════════════════════════════════════════


-- ── 1. changelog → item_changelog ────────────────────────────────
-- Natural key: (item_id, change_date, field). Legacy.fields[0] is
-- mapped to item.field; impact_level is derived from the leading
-- token of legacy.impact (HIGH/MEDIUM/LOW/CRITICAL/MODERATE), with
-- 'MODERATE' as the default.

INSERT INTO item_changelog (
  item_id, change_date, change_type, field,
  previous_value, new_value, impact, impact_level, created_at
)
SELECT
  ii.id,
  c.date,
  c.type,
  COALESCE(c.fields[1], '(unspecified)'),
  COALESCE(c.prev_value, ''),
  COALESCE(c.now_value, ''),
  c.impact,
  CASE
    WHEN c.impact ILIKE 'CRITICAL%' THEN 'CRITICAL'
    WHEN c.impact ILIKE 'HIGH%'     THEN 'HIGH'
    WHEN c.impact ILIKE 'LOW%'      THEN 'LOW'
    ELSE 'MODERATE'
  END,
  c.created_at
FROM changelog c
JOIN intelligence_items ii ON ii.legacy_id = c.resource_id
WHERE NOT EXISTS (
  SELECT 1 FROM item_changelog ic
   WHERE ic.item_id     = ii.id
     AND ic.change_date = c.date
     AND ic.field       = COALESCE(c.fields[1], '(unspecified)')
);


-- ── 2. disputes → item_disputes ──────────────────────────────────
-- Natural key: (item_id, note). Legacy disputes had UNIQUE(resource_id)
-- meaning one dispute per resource; we preserve that 1:1 by keying on
-- item_id + note.

INSERT INTO item_disputes (
  item_id, is_active, note, disputing_sources, created_at, resolved_at
)
SELECT
  ii.id,
  d.active,
  d.note,
  COALESCE(d.sources, '[]'::jsonb),
  d.created_at,
  NULL
FROM disputes d
JOIN intelligence_items ii ON ii.legacy_id = d.resource_id
WHERE NOT EXISTS (
  SELECT 1 FROM item_disputes id_
   WHERE id_.item_id = ii.id
     AND id_.note    = d.note
);


-- ── 3. cross_references → item_cross_references ──────────────────
-- Natural key is the existing UNIQUE(source_item_id, target_item_id).
-- 'references' relationship is normalized to 'related' to satisfy the
-- item_cross_references CHECK constraint
-- (related|supersedes|implements|conflicts|amends|depends_on).

INSERT INTO item_cross_references (
  source_item_id, target_item_id, relationship
)
SELECT
  ii_src.id,
  ii_tgt.id,
  CASE
    WHEN x.relationship = 'references' THEN 'related'
    WHEN x.relationship IN ('related','supersedes','implements','conflicts','amends','depends_on') THEN x.relationship
    ELSE 'related'
  END
FROM cross_references x
JOIN intelligence_items ii_src ON ii_src.legacy_id = x.source_id
JOIN intelligence_items ii_tgt ON ii_tgt.legacy_id = x.target_id
ON CONFLICT (source_item_id, target_item_id) DO NOTHING;


-- ── 4. supersessions → item_supersessions ────────────────────────
-- The big one: 5 legacy rows, 0 in item_*. Natural key:
-- (old_item_id, new_item_id, supersession_date). Legacy.date is TEXT
-- and may be partial ('YYYY-MM'); we normalize to 'YYYY-MM-01' for
-- DATE casting. Legacy rows whose old_id or new_id has no matching
-- intelligence_items.legacy_id are dropped by the JOIN.

INSERT INTO item_supersessions (
  old_item_id, new_item_id, supersession_date, severity, note, created_at
)
SELECT
  ii_old.id,
  ii_new.id,
  (CASE WHEN length(s.date) = 7 THEN s.date || '-01' ELSE s.date END)::DATE,
  s.severity,
  COALESCE(s.note, ''),
  s.created_at
FROM supersessions s
JOIN intelligence_items ii_old ON ii_old.legacy_id = s.old_id
JOIN intelligence_items ii_new ON ii_new.legacy_id = s.new_id
WHERE NOT EXISTS (
  SELECT 1 FROM item_supersessions is_
   WHERE is_.old_item_id        = ii_old.id
     AND is_.new_item_id        = ii_new.id
     AND is_.supersession_date  = (CASE WHEN length(s.date) = 7 THEN s.date || '-01' ELSE s.date END)::DATE
);


-- ── 5. timelines → item_timelines ────────────────────────────────
-- Natural key: (item_id, milestone_date, label) — same shape as the
-- legacy.timelines UNIQUE(resource_id, date, label). Partial dates
-- are normalized as in supersessions.

INSERT INTO item_timelines (
  item_id, milestone_date, label, is_completed, sort_order
)
SELECT
  ii.id,
  (CASE WHEN length(t.date) = 7 THEN t.date || '-01' ELSE t.date END)::DATE,
  t.label,
  (t.status IS NOT NULL AND t.status IN ('past', 'completed')),
  t.sort_order
FROM timelines t
JOIN intelligence_items ii ON ii.legacy_id = t.resource_id
WHERE NOT EXISTS (
  SELECT 1 FROM item_timelines it
   WHERE it.item_id        = ii.id
     AND it.milestone_date = (CASE WHEN length(t.date) = 7 THEN t.date || '-01' ELSE t.date END)::DATE
     AND it.label          = t.label
);
