-- 317: provisional_sources.status gains the terminal value 'promoted'.
--
-- Defect D2, docs/plans/defect-fix-plan-2026-09-12.md. The migration that added
-- promoted_to_source_id never widened provisional_sources_status_check, so the
-- admin promote route (src/app/api/admin/sources/promote/route.ts) has written
-- status = 'promoted' against a CHECK that allows only pending_review, confirmed,
-- rejected and needs_more_data. Live on 2026-09-12: 0 promoted rows, 0 rows with
-- promoted_to_source_id, last review 2026-05-06. 'rejected' stays the decline
-- value; nothing else changes.
--
-- Applied live by the coordinator before the dependent code merges (standing rule 3).

alter table public.provisional_sources
  drop constraint if exists provisional_sources_status_check;

alter table public.provisional_sources
  add constraint provisional_sources_status_check
  check (status = any (array['pending_review'::text, 'confirmed'::text, 'rejected'::text, 'needs_more_data'::text, 'promoted'::text]));
