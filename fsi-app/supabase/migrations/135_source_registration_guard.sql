-- 135_source_registration_guard.sql
-- SOURCE-REGISTRATION INVARIANT at the database layer (the durable, can't-bypass guarantee).
-- Governing skills: source-credibility-model (§1/§5) + remediation-discipline.
--
-- Invariant: an intelligence_items row may NOT be is_archived=true with a source-y archive_reason
-- unless a source for its host is registered AND status='active'. This is the DB twin of:
--   - rule 019            (commit-time: scripts can't raw-archive-as-source)
--   - db.mjs reclassifyToSource()  (the safe path: register-then-archive, read-back verified)
--   - orphan-source-audit.mjs      (live-data scan that drives existing orphans to zero)
-- Together these close the gap that produced 25 orphaned reclassified_to_source archives + 5 wrong ones.
--
-- APPLIED 2026-06-06 via supabase/seed/apply-135.mjs (direct pg, SUPABASE_DB_PASSWORD) and fire-tested
-- live: an archive-as-source with an UNREGISTERED host RAISES; with a REGISTERED active host it passes.
-- Precondition held at apply time: orphan-source-audit reported 0 (no pre-existing violation to trip on).
-- The trigger validates NEW writes only; it does not retro-scan existing rows.

-- Host extraction (immutable): strip scheme, take authority up to first '/', drop leading www.
-- Note: ignores port/userinfo edge cases; matches the JS hostOf() used by db.mjs closely enough
-- for registry membership (both lowercase + strip www).
create or replace function _url_host(u text)
returns text language sql immutable as $$
  select regexp_replace(
           lower(split_part(regexp_replace(coalesce(u, ''), '^[a-z]+://', '', 'i'), '/', 1)),
           '^www\.', ''
         );
$$;

create or replace function _guard_source_archive()
returns trigger language plpgsql as $$
begin
  if NEW.is_archived is true
     and NEW.archive_reason = any (array[
       'reclassified_to_source','source_not_item','institutional_source',
       'non_regulatory_source','portal_artifact'
     ])
  then
    if not exists (
      select 1 from sources s
      where s.status = 'active'
        and _url_host(s.url) = _url_host(NEW.source_url)
    ) then
      raise exception
        'source-registration invariant: cannot archive item % AS a source (reason=%) without a registered active source for host %',
        NEW.id, NEW.archive_reason, _url_host(NEW.source_url)
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_source_archive on intelligence_items;
create trigger trg_guard_source_archive
  before insert or update of is_archived, archive_reason on intelligence_items
  for each row execute function _guard_source_archive();
