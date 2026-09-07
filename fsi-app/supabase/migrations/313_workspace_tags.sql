-- 313, workspace_tags + item_workspace_tags (Workspace tags, lane uitags, 2026-09-07).
-- docs/design/handoff-2026-09-06/README.md "Workspace tags"; ruling R6 (operator, via Claude Design,
-- 2026-09-07): a workspace-owned tag, applied to intelligence_items, unique per workspace
-- case-insensitively, deleting a tag deletes its links (never soft-hides, so facet counts stay
-- truthful), and is the source for saved-search filters.
--
-- SHAPE, per the delta brief:
--   workspace_tags        (id, org_id, name, name_key GENERATED, created_by, created_at)
--                          UNIQUE (org_id, name_key)
--   item_workspace_tags   (tag_id, intelligence_item_id, org_id, created_by, created_at)
--                          PRIMARY KEY (tag_id, intelligence_item_id)
--
-- RLS PATTERN: copied from migration 311's org-scoped read policies (surcharge_audits_org_read etc.),
-- which mirror migration 077's org_watchlist_member_read, public.user_belongs_to_org(org_id) OR
-- auth.role() = 'service_role'. Migration 077's org_watchlist also supplies the INSERT/UPDATE/DELETE
-- shape used here: members of the org may write; INSERT additionally requires the caller to be the
-- created_by they are claiming.
--
-- CASCADE, NOT SOFT-HIDE: item_workspace_tags.tag_id references workspace_tags(id) ON DELETE CASCADE
-- and .intelligence_item_id references intelligence_items(id) ON DELETE CASCADE, so deleting a tag (or
-- an item) removes its links outright, a facet count is always a live COUNT(*), never a count that
-- must first filter out soft-hidden rows.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE throughout) so a re-apply is a no-op, per the coordinator's
-- "DDL before code, migration file must be self-contained and idempotent" requirement.

BEGIN;

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.organizations does not exist, migration 006 must be applied first';
  END IF;
  IF to_regclass('public.intelligence_items') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.intelligence_items does not exist';
  END IF;
  PERFORM 1 FROM pg_proc WHERE proname = 'user_belongs_to_org';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: user_belongs_to_org() does not exist, migration 006 must be applied first';
  END IF;
END $$;

-- ── workspace_tags ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  name_key   text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_tags_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT workspace_tags_name_len CHECK (length(name) <= 60)
);

-- Names unique per workspace, case-insensitively (R6).
CREATE UNIQUE INDEX IF NOT EXISTS workspace_tags_org_name_key_uidx
  ON public.workspace_tags (org_id, name_key);

COMMENT ON TABLE public.workspace_tags IS
  'Workspace-owned tags (migration 313, README "Workspace tags"). One row per distinct tag name per org; name_key is the case-insensitive dedupe key. Source for the + Tag popover and saved-search tag filters.';
COMMENT ON COLUMN public.workspace_tags.name_key IS
  'GENERATED lower(trim(name)), enforces case-insensitive uniqueness per org via workspace_tags_org_name_key_uidx.';

ALTER TABLE public.workspace_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_tags_org_read ON public.workspace_tags;
CREATE POLICY workspace_tags_org_read ON public.workspace_tags FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS workspace_tags_org_insert ON public.workspace_tags;
CREATE POLICY workspace_tags_org_insert ON public.workspace_tags FOR INSERT
  WITH CHECK (
    (public.user_belongs_to_org(org_id) AND created_by = auth.uid())
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS workspace_tags_org_delete ON public.workspace_tags;
CREATE POLICY workspace_tags_org_delete ON public.workspace_tags FOR DELETE
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

-- ── item_workspace_tags ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.item_workspace_tags (
  tag_id              uuid NOT NULL REFERENCES public.workspace_tags(id) ON DELETE CASCADE,
  intelligence_item_id uuid NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, intelligence_item_id)
);

CREATE INDEX IF NOT EXISTS item_workspace_tags_org_name_idx
  ON public.item_workspace_tags (org_id, tag_id);
CREATE INDEX IF NOT EXISTS item_workspace_tags_org_item_idx
  ON public.item_workspace_tags (org_id, intelligence_item_id);

COMMENT ON TABLE public.item_workspace_tags IS
  'Applies a workspace_tags row to an intelligence_items row (migration 313). Deleting either side CASCADEs, a tag is never soft-hidden, so facet counts stay a live COUNT(*).';

ALTER TABLE public.item_workspace_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_workspace_tags_org_read ON public.item_workspace_tags;
CREATE POLICY item_workspace_tags_org_read ON public.item_workspace_tags FOR SELECT
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

DROP POLICY IF EXISTS item_workspace_tags_org_insert ON public.item_workspace_tags;
CREATE POLICY item_workspace_tags_org_insert ON public.item_workspace_tags FOR INSERT
  WITH CHECK (
    (public.user_belongs_to_org(org_id) AND created_by = auth.uid())
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS item_workspace_tags_org_delete ON public.item_workspace_tags;
CREATE POLICY item_workspace_tags_org_delete ON public.item_workspace_tags FOR DELETE
  USING (public.user_belongs_to_org(org_id) OR auth.role() = 'service_role');

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_policies int;
BEGIN
  IF to_regclass('public.workspace_tags') IS NULL THEN
    RAISE EXCEPTION 'ABORT: workspace_tags was not created';
  END IF;
  IF to_regclass('public.item_workspace_tags') IS NULL THEN
    RAISE EXCEPTION 'ABORT: item_workspace_tags was not created';
  END IF;
  SELECT count(*) INTO n_policies FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'workspace_tags_org_read', 'workspace_tags_org_insert', 'workspace_tags_org_delete',
        'item_workspace_tags_org_read', 'item_workspace_tags_org_insert', 'item_workspace_tags_org_delete'
      );
  IF n_policies <> 6 THEN RAISE EXCEPTION 'ABORT: expected 6 workspace-tags policies, found %', n_policies; END IF;
  RAISE NOTICE 'migration 313 OK: workspace_tags + item_workspace_tags created, 6 RLS policies present by name.';
END $$;

COMMIT;
