-- ════════════════════════════════════════════════════════════════════
-- Migration 011 — backfill ghost intelligence_items for orphan
--                 supersessions, then complete the item_supersessions
--                 migration that 010 deferred.
--
-- Phase A.5.a.2 of the Caro's Ledge minimum-working-product plan.
-- Inserted between 010 (legacy → item_* migration) and the A.5.b
-- read-path swap because the 5 orphan supersession rows would
-- otherwise cause a 5-row data-loss regression on the home page's
-- "Replaced" section when the read swaps from supersessions to
-- item_supersessions.
--
-- BACKGROUND
--
-- The 5 legacy supersession rows describe replacement events whose
-- OLD versions pre-date the Caro's Ledge resource catalog: ss1..ss5
-- have no matching intelligence_items.legacy_id, so the FK-based
-- INSERT in 010 dropped them. This migration creates archival
-- placeholder ("ghost") intelligence_items rows so the FK resolves
-- and the supersession audit trail survives the schema unification.
--
-- The 5 backfilled rows are:
--   legacy_id  title
--   ss1        EU PPWD 94/62/EC
--   ss2        CSRD 250+ employees threshold
--   ss3        EPA 2009 Endangerment Finding
--   ss4        IMO 2018 GHG Strategy (50% by 2050)
--   ss5        Voluntary IMO GHG measures only
--
-- Each is inserted with status='superseded', is_archived=true,
-- confidence='unconfirmed', domain=1, summary and reasoning that
-- mark them as pre-tracking historical records. They are not
-- intended to surface as live regulations; they exist to keep the
-- supersession FK valid.
--
-- Apply via: node supabase/seed/apply-011-backfill.mjs
-- (DDL-free DML; idempotent — re-running matches existing legacy_id
-- on the UNIQUE constraint and inserts nothing.)
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Backfill ghost intelligence_items rows ─────────────────────
-- Idempotent via legacy_id UNIQUE: ON CONFLICT DO NOTHING.

INSERT INTO intelligence_items (
  legacy_id, title, summary, reasoning,
  domain, status, confidence, is_archived, source_url
)
SELECT
  s.old_id,
  s.old_title,
  'Pre-tracking historical record. Superseded before continuous tracking began.',
  'Backfilled to preserve supersession audit trail during legacy-to-item schema unification.',
  1,
  'superseded',
  'unconfirmed',
  TRUE,
  COALESCE(s.old_url, '')
FROM supersessions s
WHERE s.old_id NOT IN (
  SELECT legacy_id FROM intelligence_items WHERE legacy_id IS NOT NULL
)
ON CONFLICT (legacy_id) DO NOTHING;


-- ── 2. Migrate supersessions → item_supersessions ──────────────────
-- Same INSERT…WHERE NOT EXISTS as 010, repeated here because the
-- backfill above newly enables the JOIN to resolve ss1..ss5.

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
