-- ════════════════════════════════════════════════════════════════════
-- 045_orphan_slugs_and_acf_dedup.sql
--
-- Three data fixes from the platform audit + integrity triage:
--
--   (1) Assign kebab-case slugs (legacy_id) to ~23 orphan-materialized
--       intelligence_items rows from W4.3 that have legacy_id IS NULL
--       and source_url IS NOT NULL. Slug = lower(title) with non-alnum
--       collapsed to '-', length-capped at 80, prefix-collision-prefixed
--       with a country code (us-, eu-, ca-, uk-, ...) only when title
--       alone collides with an existing legacy_id.
--
--   (2) Delete the duplicate Advanced Clean Fleets row left over from
--       W4.3 orphan materialization
--       (id=4688fc47-9c55-45ef-91e6-3524df3d95a7) — keep
--       ccee10a4-da4a-4a65-810e-51142ec3b753 (W4.4-inserted, has
--       full_brief, has CARB source_id).
--
--   (3) Archive r10 Journal of Sustainable Transport (set is_archived=
--       TRUE, archive_reason='source_url_unverifiable_no_replacement_found',
--       archived_date=CURRENT_DATE; per integrity-flag triage decision).
--
-- The 15 missing EU regulations are inserted by the orchestrator via a
-- separate one-shot script (not this migration) so they can also be
-- queued for brief regeneration in the same step.
--
-- Idempotency: every statement is safe to re-run.
--   * The DELETE filters by id AND legacy_id IS NULL — once row is gone
--     (or once a future migration assigns it a legacy_id) the WHERE
--     stops matching.
--   * The DO-block slug loop only touches rows where legacy_id IS NULL
--     so a second run finds nothing to update.
--   * The r10 UPDATE is the same write twice over — it's a no-op the
--     second time.
--
-- Schema notes (verified against migrations 004 + 006):
--   intelligence_items columns: is_archived BOOLEAN, archive_reason
--   TEXT, archived_date DATE (NOT archived_at — that name is on
--   workspace_item_overrides only).
-- ════════════════════════════════════════════════════════════════════


-- ── Step 2 first ──
-- Dedup ACF before slug assignment to avoid accidentally giving the
-- orphan ACF row a slug we'd then have to clean up.
DELETE FROM intelligence_items
WHERE id = '4688fc47-9c55-45ef-91e6-3524df3d95a7'
  AND legacy_id IS NULL;


-- ── Step 1: orphan slug assignment ──
-- Use a deterministic inline slugify. Limit slug to 80 chars. If the
-- generated slug already exists in legacy_id, fall back to slug + the
-- first jurisdiction_iso country code (lower-cased) as prefix. If even
-- the prefixed slug collides, append a numeric suffix until unique.
DO $$
DECLARE
  r              RECORD;
  base_slug      TEXT;
  candidate_slug TEXT;
  jur_suffix     TEXT;
  collide_count  INT;
  attempt        INT;
BEGIN
  FOR r IN
    SELECT id, title, jurisdiction_iso
    FROM intelligence_items
    WHERE legacy_id IS NULL
      AND title IS NOT NULL
      AND source_url IS NOT NULL
      AND source_url <> ''
  LOOP
    -- Slugify: lowercase, non-alnum → '-', strip leading/trailing '-'
    base_slug := lower(
      regexp_replace(
        regexp_replace(r.title, '[^a-zA-Z0-9]+', '-', 'g'),
        '^-+|-+$', '', 'g'
      )
    );
    base_slug := substring(base_slug FROM 1 FOR 80);

    IF base_slug IS NULL OR base_slug = '' THEN
      -- Defensive: title was all punctuation. Fall back to short uuid.
      base_slug := 'item-' || substring(replace(r.id::text, '-', '') FROM 1 FOR 8);
    END IF;

    candidate_slug := base_slug;

    SELECT COUNT(*) INTO collide_count
    FROM intelligence_items
    WHERE legacy_id = candidate_slug;

    IF collide_count > 0 THEN
      jur_suffix := lower(COALESCE(r.jurisdiction_iso[1], 'x'));
      candidate_slug := jur_suffix || '-' || base_slug;
      candidate_slug := substring(candidate_slug FROM 1 FOR 80);

      -- Final tie-break: numeric suffix loop. Bounded to 50 attempts.
      attempt := 2;
      WHILE attempt <= 50 LOOP
        SELECT COUNT(*) INTO collide_count
        FROM intelligence_items
        WHERE legacy_id = candidate_slug;
        EXIT WHEN collide_count = 0;
        candidate_slug := substring(jur_suffix || '-' || base_slug FROM 1 FOR 76)
                          || '-' || attempt::text;
        attempt := attempt + 1;
      END LOOP;
    END IF;

    UPDATE intelligence_items
    SET legacy_id = candidate_slug
    WHERE id = r.id
      AND legacy_id IS NULL;
  END LOOP;
END $$;


-- ── Step 3: archive r10 ──
-- Journal of Sustainable Transport — source URL was unverifiable and
-- no replacement could be found during integrity triage. Archive it so
-- it stops surfacing in Research feeds; the row is preserved for audit.
UPDATE intelligence_items
SET is_archived    = TRUE,
    archive_reason = 'source_url_unverifiable_no_replacement_found',
    archived_date  = CURRENT_DATE
WHERE legacy_id = 'r10';
