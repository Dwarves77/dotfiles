-- subject: Defect D2, `docs/plans/defect-fix-plan-2026-09-12.md` (W9 Part 7.5 fix round 1, 2026-09-12). `provisional_sources_status_check` (migration 004) allowed only `pending_review`, `confirmed`, `rejected`, `needs_more_data`; `src/app/api/admin/sources/promote/route.ts` had written `status: "promoted"` at its approve arm since before this task, and the terminal write had never succeeded against the live constraint (coordinator's live SQL: 0 promoted rows, 0 rows with `promoted_to_source_id`, last review 2026-05-06). Drops and re-adds the CHECK constraint, widening the allowed set to add `promoted`; `rejected` stays the decline value, nothing else changes. Authored by the coordinator, staged with the task 7.5 fix-round-1 commit that consumes it (`resolve-provisional-sources.mjs`, `promote-provisional.ts` both reference the widened set via shared exported constants). Applied live by the coordinator before the dependent code merges, per standing rule 3 (schema DDL before consumer code). Reversible: drop and re-add the constraint with `promoted` removed from the array, once no row carries that status.
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
