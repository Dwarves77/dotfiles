-- 235_dual_scope_archive.sql — Dual-scope archive (item-management program,
-- operator-approved scope + 5-layer team-archive protection + role gate).
--
-- 1) TEAM archive attribution: archived_by on workspace_item_overrides
--    (protection layer: every workspace archive carries who did it).
ALTER TABLE public.workspace_item_overrides
  ADD COLUMN IF NOT EXISTS archived_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2) PERSONAL archive: user_item_state — per-USER item state, layered above
--    the org override the same way the org override layers above platform
--    data. Personal archive hides the item for THIS user only (the operator
--    ruling: "archiving should be an option for group or individual").
--    Service-role-only writes via the API (deny-all RLS, same posture as
--    the operator-control tables in migration 230).
CREATE TABLE IF NOT EXISTS public.user_item_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  is_archived boolean NOT NULL DEFAULT false,
  archive_note text NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
ALTER TABLE public.user_item_state ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_user_item_state_user_archived
  ON public.user_item_state (user_id) WHERE is_archived;

-- 3) Notification kind 'archive' (watcher/owner fan-out when a workspace
--    archive hides an item someone is watching or owns).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY['mention'::text, 'reply'::text, 'promote'::text, 'invite'::text, 'moderation'::text, 'archive'::text]));

COMMENT ON TABLE public.user_item_state IS
  'Per-user item state (personal archive; dual-scope archive, 2026-08-02). Layered above workspace_item_overrides. Service-role writes only.';
