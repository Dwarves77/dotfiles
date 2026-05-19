-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 090: tier schema split (base_tier + effective_tier)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Q2 (source-credibility-model decisions doc, 2026-05-19): the sources tier
-- column splits into a static base_tier (classifier or operator decision at
-- registration, preserved for provenance) and a computed effective_tier
-- (dynamic credibility signal derived from base + citation network + override
-- + decay, recomputed by daily batch per Q7).
--
-- Per the operator's Flag 1 decision (force rename, not additive shadow):
--   * RENAME public.sources.tier -> public.sources.base_tier
--   * ADD   public.sources.effective_tier INT NULL CHECK (1..7)
--
-- The rename will BREAK existing application code that reads sources.tier.
-- That is intended. Per-consumer review (Phase 1.5) explicitly chooses
-- base_tier (definitional / provenance reads) or effective_tier (dynamic
-- credibility reads) per consumer site. See
-- docs/sprint-2/Phase-1.5-consumer-migration-list.md for the file:line
-- inventory of consumers that must be migrated immediately after this
-- migration lands.
--
-- Why both columns layered (vs static-only or dynamic-only):
--   * Static only: citation-network signal cannot influence the customer-
--     facing credibility number; the network exists but is decoupled from
--     presentation.
--   * Dynamic only: provenance is lost; cannot answer "what did the
--     classifier think before the network adjusted it"; audit clarity gone.
--   * Both, layered: mental model stays single (effective_tier is the
--     customer-facing number per Section 8 of source-credibility-model
--     skill); base_tier remains queryable for audit, classifier-prompt
--     references, and the SourceTier definitional type.
--
-- Effective tier formula (computed by Q7 daily batch, not by this migration):
--   effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)
--
-- Day 1 post-migration semantics: all 796 sources have effective_tier set
-- equal to base_tier. The Q7 background batch converges effective_tier to
-- the citation-network-derived value over subsequent days. Override semantics
-- land per Q5; recency decay per Q6; promotion thresholds per Q7.
--
-- What this migration does:
--   * DROPs two views that reference s.tier:
--       - provisional_sources_review  (alias s.tier AS cited_by_tier_current)
--       - source_health_summary       (GROUP BY s.tier)
--     The views are recreated post-rename referencing s.base_tier. This
--     preserves Day 1 behavior because base_tier == effective_tier on Day 1.
--     Both views are listed in the Phase 1.5 consumer migration list for
--     explicit base-vs-effective review.
--   * ALTER TABLE public.sources RENAME COLUMN tier TO base_tier
--   * Renames the matching CHECK constraint:
--       sources_tier_check -> sources_base_tier_check
--   * ALTER TABLE public.sources ADD COLUMN effective_tier INT NULL
--       CHECK (effective_tier BETWEEN 1 AND 7)
--   * UPDATE sources SET effective_tier = base_tier WHERE effective_tier
--       IS NULL (Day 1 backfill).
--   * COMMENT ON COLUMN base_tier   (provenance semantic)
--   * COMMENT ON COLUMN effective_tier (computed dynamic semantic)
--   * RECREATEs the two dropped views to reference s.base_tier.
--
-- What this migration explicitly does NOT do:
--   * Does NOT migrate any application-code consumer. The rename is the
--     forcing function for Phase 1.5 per-consumer review.
--   * Does NOT compute citation-network signals into effective_tier. That
--     is Q7's daily batch dispatch.
--   * Does NOT add tier_override / override_reason / override_date columns.
--     That is Q5's separate migration.
--   * Does NOT add the recency decay half-life parameter. That is Q6.
--   * Does NOT remove sources_tier_at_creation_check (different column).

BEGIN;

-- Drop the views that reference sources.tier so the column rename succeeds.
DROP VIEW IF EXISTS public.provisional_sources_review;
DROP VIEW IF EXISTS public.source_health_summary;

-- Rename the existing column.
ALTER TABLE public.sources RENAME COLUMN tier TO base_tier;

-- Rename the CHECK constraint to match the new column name.
ALTER TABLE public.sources RENAME CONSTRAINT sources_tier_check TO sources_base_tier_check;

-- Add the computed dynamic credibility signal column.
ALTER TABLE public.sources
  ADD COLUMN effective_tier INT NULL
    CHECK (effective_tier BETWEEN 1 AND 7);

-- Day 1 backfill: every source's effective_tier starts equal to its base_tier.
-- The Q7 daily batch will subsequently converge effective_tier to the
-- citation-network-derived value where applicable.
UPDATE public.sources
   SET effective_tier = base_tier
 WHERE effective_tier IS NULL;

-- Provenance and semantic comments per source-credibility-model skill.
COMMENT ON COLUMN public.sources.base_tier IS
  'Static tier classification (1-7) from classifier or operator at registration. Source of provenance for credibility computation. Rarely changes. Preserves classifier judgment for audit. See source-credibility-model skill Section 3.';

COMMENT ON COLUMN public.sources.effective_tier IS
  'Computed dynamic tier (1-7) from network + base + override + decay. Recomputed by daily batch (Q7 dispatch). Customer-facing credibility signal per source-credibility-model skill Section 2 formula: COALESCE(tier_override, computed_dynamic_tier, base_tier).';

-- Recreate the two views post-rename, referencing s.base_tier. Day 1
-- preserves behavior because base_tier == effective_tier for all rows.
-- Both views are flagged in the Phase 1.5 consumer migration list for
-- explicit base-vs-effective review.
CREATE VIEW public.provisional_sources_review AS
  SELECT ps.id,
    ps.name,
    ps.url,
    ps.description,
    ps.domain,
    ps.discovered_via,
    ps.cited_by_source_id,
    ps.cited_by_source_tier,
    ps.citation_count,
    ps.independent_citers,
    ps.citing_source_ids,
    ps.highest_citing_tier,
    ps.provisional_tier,
    ps.recommended_tier,
    ps.accessibility_verified,
    ps.publishes_structured_content,
    ps.entity_identified,
    ps.status,
    ps.reviewer_notes,
    ps.promoted_to_source_id,
    ps.created_at,
    ps.reviewed_at,
    s.name AS cited_by_name,
    s.base_tier AS cited_by_tier_current
   FROM public.provisional_sources ps
     LEFT JOIN public.sources s ON ps.cited_by_source_id = s.id
  WHERE ps.status = ANY (ARRAY['pending_review'::text, 'needs_more_data'::text])
  ORDER BY ps.independent_citers DESC, ps.citation_count DESC;

CREATE VIEW public.source_health_summary AS
  SELECT s.base_tier,
    s.status,
    count(*) AS source_count,
    avg(s.trust_score_overall) AS avg_trust_score,
    sum(
        CASE
            WHEN s.status = 'active'::text THEN 1
            ELSE 0
        END) AS active_count,
    sum(
        CASE
            WHEN s.status = 'stale'::text THEN 1
            ELSE 0
        END) AS stale_count,
    sum(
        CASE
            WHEN s.status = 'inaccessible'::text THEN 1
            ELSE 0
        END) AS inaccessible_count,
    sum(
        CASE
            WHEN s.next_scheduled_check < now() THEN 1
            ELSE 0
        END) AS overdue_count
   FROM public.sources s
  GROUP BY s.base_tier, s.status
  ORDER BY s.base_tier, s.status;

COMMIT;
