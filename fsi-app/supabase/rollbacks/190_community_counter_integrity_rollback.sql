-- ROLLBACK for 190_community_counter_integrity.sql
-- Restores the three trigger functions to their pre-190 state: SECURITY INVOKER,
-- original bodies (verbatim from live pg_get_functiondef, read 2026-07-11),
-- weekly_post_count writer removed (the column reverts to read-never-written —
-- the F9 defect returns by construction; this rollback exists for reversibility,
-- not as a recommended state).

BEGIN;

CREATE OR REPLACE FUNCTION public.update_community_group_member_count()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION public.update_community_post_reply_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_case_study_validation_count()
RETURNS trigger
LANGUAGE plpgsql
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

COMMENT ON COLUMN public.community_groups.weekly_post_count IS NULL;

COMMIT;
