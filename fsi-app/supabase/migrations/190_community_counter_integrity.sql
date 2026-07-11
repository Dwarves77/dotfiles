-- 190_community_counter_integrity.sql
--
-- Wave-α Track D item d1 (correction-plan D2; DB-4 register F9/F10, 2026-07-11).
-- AUTHORED-NOT-APPLIED — apply rides the operator DDL window with the other
-- Wave-α migrations; after apply, run scripts/_wave-alpha/recount-community-counters.mjs
-- (service role) to repair any counts that drifted while the triggers were INVOKER.
--
-- TWO defects closed:
--
-- 1. F10 — the community counter-maintenance trigger functions run as SECURITY
--    INVOKER, so their parent-table UPDATEs execute under the CALLER's RLS.
--    On any RLS-path write (community_posts_insert_member invites exactly that:
--    a plain member's user-JWT post insert), the UPDATE on community_groups
--    matches 0 rows (update policy = owner/group-admin only) and the counter
--    silently drifts with no error. Fix: recreate the three LIVE-layer trigger
--    functions as SECURITY DEFINER. Semantics preserved verbatim (bodies read
--    back from live pg_get_functiondef 2026-07-11 before authoring); search_path
--    stays pinned to public, extensions, pg_temp per the mig-160 convention and
--    Supabase definer-function guidance.
--    NOT flipped here: update_section_thread_count / update_thread_reply_count
--    (forum layer — dropped by migration 192) and update_vendor_endorsement_count
--    (vendor family — Track E drop scope).
--
-- 2. F9 — community_groups.weekly_post_count is displayed ("posts this week",
--    GroupCard/GroupHeader) and selected by /api/community/groups, but NO writer
--    has ever existed (only the mig-028 DEFAULT 0). It IS derivable from
--    community_posts, so it gets a writer instead of leaving the UI: the post
--    trigger now recounts the group's 7-day window deterministically on EVERY
--    post insert/delete (top-level posts AND replies both count — every
--    community_posts row is posting activity).
--    HONESTY BOUND (documented, not hidden): the stored value is exact as of the
--    group's most recent post write; posts aging out of the 7-day window do not
--    fire a trigger, so a group with zero writes for >7 days can overstate until
--    the next write or the recount script runs. The recount script is the repair
--    lever; if a scheduled recount ever exists it should include this column.
--
-- Reversible: supabase/rollbacks/190_community_counter_integrity_rollback.sql
-- (restores the exact INVOKER bodies read back from live).

BEGIN;

-- 1) community_group_members → community_groups.member_count / last_active_at
--    (body verbatim from live; only SECURITY DEFINER added)
CREATE OR REPLACE FUNCTION public.update_community_group_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' then
    update community_groups
       set member_count = member_count + 1,
           last_active_at = now()
     where id = new.group_id;
  elsif tg_op = 'DELETE' then
    update community_groups
       set member_count = greatest(0, member_count - 1)
     where id = old.group_id;
  end if;
  return coalesce(new, old);
end;
$function$;

-- 2) community_posts → reply_count / last_reply_at / group last_active_at
--    (reply semantics verbatim from live) + NEW weekly_post_count recount
--    (deterministic 7-day window recount on every post insert/delete).
CREATE OR REPLACE FUNCTION public.update_community_post_reply_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_group_id uuid;
begin
  if tg_op = 'INSERT' and new.parent_post_id is not null then
    update community_posts
       set reply_count = reply_count + 1,
           last_reply_at = new.created_at
     where id = new.parent_post_id;
    -- bubble last_active_at up to the group
    update community_groups
       set last_active_at = new.created_at
     where id = new.group_id;
  elsif tg_op = 'DELETE' and old.parent_post_id is not null then
    update community_posts
       set reply_count = greatest(0, reply_count - 1)
     where id = old.parent_post_id;
  end if;

  -- weekly_post_count writer (F9, migration 190): deterministic recount of the
  -- trailing 7-day window. AFTER-trigger visibility means the recount already
  -- sees the inserted row / no longer sees the deleted row.
  v_group_id := coalesce(new.group_id, old.group_id);
  if v_group_id is not null then
    update community_groups
       set weekly_post_count = (
             select count(*)
               from community_posts p
              where p.group_id = v_group_id
                and p.created_at >= now() - interval '7 days'
           )
     where id = v_group_id;
  end if;

  return coalesce(new, old);
end;
$function$;

-- 3) case_study_endorsements → case_studies.peer_validation_count /
--    validation_status auto-promote (body verbatim from live; only
--    SECURITY DEFINER added). Flipped alongside the community pair because
--    case_study_endorsements INSERT is an RLS-path write (verified profiles)
--    while case_studies UPDATE is submitter/service-only — the identical
--    silent-no-op class.
CREATE OR REPLACE FUNCTION public.update_case_study_validation_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE case_studies SET peer_validation_count = peer_validation_count + 1
    WHERE id = NEW.case_study_id;
    UPDATE case_studies SET validation_status = 'peer_validated'
    WHERE id = NEW.case_study_id
    AND validation_status = 'under_review'
    AND peer_validation_count >= 2;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE case_studies SET peer_validation_count = GREATEST(0, peer_validation_count - 1)
    WHERE id = OLD.case_study_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON COLUMN public.community_groups.weekly_post_count IS
  'Count of community_posts rows (top-level + replies) created in the trailing 7 days. Written by update_community_post_reply_count() on every post insert/delete (migration 190); exact as of the group''s most recent post write — repairable any time via scripts/_wave-alpha/recount-community-counters.mjs.';

COMMIT;
