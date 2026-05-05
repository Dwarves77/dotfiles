-- 043_security_advisor_fixes.sql
--
-- Fix 4 Supabase Security Advisor errors:
--
--   1. public.source_health_summary       - SECURITY DEFINER view
--   2. public.open_conflicts               - SECURITY DEFINER view
--   3. public.provisional_sources_review   - SECURITY DEFINER view
--   4. public.canonical_source_candidates  - RLS disabled
--
-- The three views were created in migrations 004 / 005 / B.0e with the
-- default SECURITY DEFINER mode (Postgres default for views), which
-- bypasses RLS and runs with the creator's permissions. Dropping and
-- recreating with the explicit `WITH (security_invoker=true)` option
-- forces them to honor the caller's RLS, matching expectations for
-- multi-tenant safety.
--
-- The canonical_source_candidates table needs RLS enabled so that the
-- anon key cannot read its full contents. Admin-only reads via service
-- role + a permissive policy for platform admins via org_memberships.

-- View 1: source_health_summary
-- Aggregate of sources by tier + status. Reads sources only.
DROP VIEW IF EXISTS public.source_health_summary;
CREATE VIEW public.source_health_summary
WITH (security_invoker = true) AS
SELECT s.tier,
    s.status,
    count(*) AS source_count,
    avg(s.trust_score_overall) AS avg_trust_score,
    sum(CASE WHEN s.status = 'active'::text THEN 1 ELSE 0 END) AS active_count,
    sum(CASE WHEN s.status = 'stale'::text THEN 1 ELSE 0 END) AS stale_count,
    sum(CASE WHEN s.status = 'inaccessible'::text THEN 1 ELSE 0 END) AS inaccessible_count,
    sum(CASE WHEN s.next_scheduled_check < now() THEN 1 ELSE 0 END) AS overdue_count
FROM sources s
GROUP BY s.tier, s.status
ORDER BY s.tier, s.status;

COMMENT ON VIEW public.source_health_summary IS
  'Aggregate of sources by tier + status. SECURITY INVOKER so RLS on sources gates the read.';

-- View 2: open_conflicts
DROP VIEW IF EXISTS public.open_conflicts;
CREATE VIEW public.open_conflicts
WITH (security_invoker = true) AS
SELECT c.id,
    c.item_id,
    c.source_a_id,
    c.source_b_id,
    c.source_a_tier,
    c.source_b_tier,
    c.source_a_claim,
    c.source_b_claim,
    c.field_in_dispute,
    c.status,
    c.resolution,
    c.resolution_note,
    c.resolved_by_source_id,
    c.resolved_by_human,
    c.opened_at,
    c.resolved_at,
    sa.name AS source_a_name,
    sb.name AS source_b_name,
    i.title AS item_title
FROM source_conflicts c
    JOIN sources sa ON c.source_a_id = sa.id
    JOIN sources sb ON c.source_b_id = sb.id
    JOIN intelligence_items i ON c.item_id = i.id
WHERE c.status = 'open'::text
ORDER BY c.opened_at DESC;

COMMENT ON VIEW public.open_conflicts IS
  'Open source-attribution conflicts. SECURITY INVOKER so RLS on source_conflicts gates the read.';

-- View 3: provisional_sources_review
DROP VIEW IF EXISTS public.provisional_sources_review;
CREATE VIEW public.provisional_sources_review
WITH (security_invoker = true) AS
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
    s.tier AS cited_by_tier_current
FROM provisional_sources ps
    LEFT JOIN sources s ON ps.cited_by_source_id = s.id
WHERE ps.status = ANY (ARRAY['pending_review'::text, 'needs_more_data'::text])
ORDER BY ps.independent_citers DESC, ps.citation_count DESC;

COMMENT ON VIEW public.provisional_sources_review IS
  'Pending-review provisional sources. SECURITY INVOKER so RLS on provisional_sources gates the read.';

-- Issue 4: Enable RLS on canonical_source_candidates.
-- Service role bypasses RLS. Authenticated users with platform-admin role
-- (owner or admin in any org_memberships row) can read. Anon cannot.
ALTER TABLE public.canonical_source_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canonical_source_candidates_admin_read" ON public.canonical_source_candidates;
CREATE POLICY "canonical_source_candidates_admin_read"
  ON public.canonical_source_candidates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "canonical_source_candidates_admin_write" ON public.canonical_source_candidates;
CREATE POLICY "canonical_source_candidates_admin_write"
  ON public.canonical_source_candidates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE public.canonical_source_candidates IS
  'Canonical-source discovery candidates. RLS-gated to platform admins (org_memberships role IN owner/admin). Service role bypasses for the discovery worker.';
