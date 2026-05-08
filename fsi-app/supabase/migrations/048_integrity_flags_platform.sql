-- 048_integrity_flags_platform.sql
-- Platform-level integrity_flags table — durable queue for agent-detected
-- concerns the dispatch context can't resolve (design drift, data quality
-- gaps, source issues, coverage gaps, data integrity, surface concerns).
--
-- This is DISTINCT from migration 035's per-item agent_integrity_flag*
-- columns on intelligence_items. Those flag a specific brief whose body
-- contains an integrity-concern phrase. THIS table catches the broader
-- class of concerns that aren't tied to a single intelligence_items row:
--   - design_drift   — preview HTML diverges from live surface
--   - data_quality   — missing or malformed metadata across many rows
--   - source_issue   — source registry inconsistency
--   - coverage_gap   — jurisdiction or topic with thin coverage
--   - data_integrity — cross-row referential or invariant break
--   - surface_concern — UI/UX surface problem the agent surfaced during work
--
-- Per CLAUDE.md "Integrity flags — agent contract for design_drift" section,
-- this is the schema vehicle the agent contract has been waiting on. When
-- an agent surfaces a category-fitting flag it can't resolve, it writes a
-- row here via service-role INSERT and the platform admin (Jason) resolves
-- it from the /admin Integrity flags surface.

CREATE TABLE IF NOT EXISTS public.integrity_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'design_drift',
    'data_quality',
    'source_issue',
    'coverage_gap',
    'data_integrity',
    'surface_concern'
  )),
  subject_type text NOT NULL CHECK (subject_type IN (
    'surface', 'item', 'source', 'jurisdiction', 'system'
  )),
  subject_ref text NOT NULL,
  description text NOT NULL,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_review', 'resolved', 'archived'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  resolved_at timestamptz NULL,
  resolved_by text NULL,
  resolution_note text NULL
);

-- Partial index — fast Admin queue read. Only indexes rows the operator
-- needs to act on; resolved/archived rows fall out.
CREATE INDEX IF NOT EXISTS idx_integrity_flags_status
  ON public.integrity_flags(status)
  WHERE status IN ('open', 'in_review');

CREATE INDEX IF NOT EXISTS idx_integrity_flags_category
  ON public.integrity_flags(category);

CREATE INDEX IF NOT EXISTS idx_integrity_flags_subject
  ON public.integrity_flags(subject_type, subject_ref);

-- RLS — adopt the same pattern migration 043 uses for canonical_source_candidates:
-- platform admins (org_memberships role IN owner/admin) can SELECT; service
-- role bypasses for the agent worker that writes rows. Anon cannot read.
ALTER TABLE public.integrity_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrity_flags_admin_read" ON public.integrity_flags;
CREATE POLICY "integrity_flags_admin_read"
  ON public.integrity_flags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "integrity_flags_admin_update" ON public.integrity_flags;
CREATE POLICY "integrity_flags_admin_update"
  ON public.integrity_flags
  FOR UPDATE
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

-- Service role write policy is implicit (service role bypasses RLS), but we
-- still emit an explicit ALL policy keyed on auth.role() = 'service_role'
-- for self-documentation and to mirror migration 005's trust framework
-- pattern. PostgreSQL evaluates the most permissive matching policy.
DROP POLICY IF EXISTS "integrity_flags_service_role_write" ON public.integrity_flags;
CREATE POLICY "integrity_flags_service_role_write"
  ON public.integrity_flags
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.integrity_flags IS
  'Platform-level integrity flags — durable queue for agent-detected concerns the dispatch context cannot resolve. Distinct from intelligence_items.agent_integrity_flag* (per-brief flags from migration 035). Agent contract documented in fsi-app/.claude/CLAUDE.md.';

COMMENT ON COLUMN public.integrity_flags.category IS
  'design_drift | data_quality | source_issue | coverage_gap | data_integrity | surface_concern';

COMMENT ON COLUMN public.integrity_flags.subject_type IS
  'surface | item | source | jurisdiction | system — the kind of thing subject_ref points at';

COMMENT ON COLUMN public.integrity_flags.subject_ref IS
  'Stable reference to the affected entity: route path for surface, intelligence_items.id or legacy_id for item, sources.id or canonical name for source, ISO code for jurisdiction, free-text component name for system.';

COMMENT ON COLUMN public.integrity_flags.recommended_actions IS
  'jsonb array of {action, rationale} objects. Agent populates with possible resolutions when the dispatch context can choose between them but the agent cannot.';

COMMENT ON COLUMN public.integrity_flags.status IS
  'open → in_review → resolved | archived. Admin updates via /admin Integrity flags surface.';

COMMENT ON COLUMN public.integrity_flags.created_by IS
  'Agent identifier: e.g., "wave-4-a5-agent", "wave-5-coverage-investigation". Free-text rather than auth.users FK because the writer is a service-role worker, not an authenticated user.';
