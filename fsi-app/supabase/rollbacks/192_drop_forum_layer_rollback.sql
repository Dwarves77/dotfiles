-- ROLLBACK for 192_drop_forum_layer.sql
-- Recreates the mig-007 forum layer SCHEMA: tables, indexes, trigger functions,
-- triggers, RLS enable + policies (definitions verbatim from
-- 007_community_layer.sql / 007_rls_community.sql, cross-checked against live
-- pg_get_functiondef / pg_policy before the drop was authored), plus the
-- case_studies.linked_thread_id column.
--
-- DATA is NOT restored here: the 17 forum_sections seed rows restore by
-- re-running the forum INSERT block from supabase/seed/seed-community.sql at
-- its pre-192 git revision (see docs/ops/wave-alpha-closeout-2026-07-11/
-- deletions-log.md for the snapshot).

BEGIN;

CREATE TABLE IF NOT EXISTS public.forum_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  section_type TEXT DEFAULT 'regional'
    CHECK (section_type IN ('regional', 'topical', 'global', 'special')),
  primary_region_tag TEXT,
  primary_topic_tag TEXT,
  features_enabled TEXT[] DEFAULT ARRAY['posts', 'questions', 'intelligence_feed'],
  is_public BOOLEAN DEFAULT TRUE,
  minimum_membership_tier TEXT DEFAULT 'free',
  sort_order INTEGER DEFAULT 0,
  thread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES public.forum_sections(id),
  title TEXT NOT NULL,
  body TEXT,
  author_id UUID REFERENCES public.profiles(id),
  thread_type TEXT DEFAULT 'discussion'
    CHECK (thread_type IN ('discussion', 'question', 'case_study_link', 'intelligence_alert', 'announcement')),
  topic_tags TEXT[] DEFAULT '{}',
  region_tags TEXT[] DEFAULT '{}',
  transport_mode_tags TEXT[] DEFAULT '{}',
  vertical_tags TEXT[] DEFAULT '{}',
  linked_intelligence_item_ids UUID[] DEFAULT '{}',
  linked_vendor_ids UUID[] DEFAULT '{}',
  linked_case_study_ids UUID[] DEFAULT '{}',
  linked_regulation_ids UUID[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  reply_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  upvote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threads_section ON public.forum_threads(section_id);
CREATE INDEX IF NOT EXISTS idx_threads_author ON public.forum_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_threads_topic ON public.forum_threads USING GIN(topic_tags);
CREATE INDEX IF NOT EXISTS idx_threads_region ON public.forum_threads USING GIN(region_tags);
CREATE INDEX IF NOT EXISTS idx_threads_transport ON public.forum_threads USING GIN(transport_mode_tags);
CREATE INDEX IF NOT EXISTS idx_threads_vertical ON public.forum_threads USING GIN(vertical_tags);
CREATE INDEX IF NOT EXISTS idx_threads_linked_items ON public.forum_threads USING GIN(linked_intelligence_item_ids);
CREATE INDEX IF NOT EXISTS idx_threads_created ON public.forum_threads(created_at DESC);

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  parent_reply_id UUID REFERENCES public.forum_replies(id),
  author_id UUID REFERENCES public.profiles(id),
  body TEXT NOT NULL,
  upvote_count INTEGER DEFAULT 0,
  is_accepted_answer BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replies_thread ON public.forum_replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_replies_parent ON public.forum_replies(parent_reply_id);
CREATE INDEX IF NOT EXISTS idx_replies_author ON public.forum_replies(author_id);

-- case_studies inbound link (mig-007 shape)
ALTER TABLE public.case_studies
  ADD COLUMN IF NOT EXISTS linked_thread_id UUID REFERENCES public.forum_threads(id);

-- Trigger functions (verbatim from live pg_get_functiondef pre-drop; INVOKER,
-- search_path pinned by mig 160)
CREATE OR REPLACE FUNCTION public.update_section_thread_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.section_id IS NOT NULL THEN
    UPDATE forum_sections SET thread_count = thread_count + 1
    WHERE id = NEW.section_id;
  ELSIF TG_OP = 'DELETE' AND OLD.section_id IS NOT NULL THEN
    UPDATE forum_sections SET thread_count = GREATEST(0, thread_count - 1)
    WHERE id = OLD.section_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_thread_reply_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_threads SET reply_count = reply_count + 1, updated_at = NOW()
    WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_threads SET reply_count = GREATEST(0, reply_count - 1)
    WHERE id = OLD.thread_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER section_thread_count_trigger
  AFTER INSERT OR DELETE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_section_thread_count();

CREATE TRIGGER reply_count_trigger
  AFTER INSERT OR DELETE ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_thread_reply_count();

CREATE TRIGGER forum_threads_updated_at
  BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER forum_replies_updated_at
  BEFORE UPDATE ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS (verbatim from 007_rls_community.sql)
ALTER TABLE public.forum_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sections_read" ON public.forum_sections FOR SELECT USING (true);
CREATE POLICY "sections_write" ON public.forum_sections FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "threads_read" ON public.forum_threads FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.forum_sections fs
    WHERE fs.id = forum_threads.section_id
    AND (
      fs.is_public = true
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.membership_tier IN ('member', 'contributor', 'verified', 'premium')
      )
    )
  )
  OR section_id IS NULL -- threads without a section are readable
);

CREATE POLICY "threads_insert" ON public.forum_threads FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.verification_tier != 'unverified'
  )
);

CREATE POLICY "threads_update" ON public.forum_threads FOR UPDATE USING (
  author_id = auth.uid() OR auth.role() = 'service_role'
);

CREATE POLICY "replies_read" ON public.forum_replies FOR SELECT USING (true);

CREATE POLICY "replies_insert" ON public.forum_replies FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.verification_tier != 'unverified'
  )
);

CREATE POLICY "replies_update" ON public.forum_replies FOR UPDATE USING (
  author_id = auth.uid() OR auth.role() = 'service_role'
);

COMMIT;
