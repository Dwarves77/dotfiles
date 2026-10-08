# 2026-10-08, lane SEC-3a (sec3a-functions-views): functions, views and grants that let anon or a user write what only the system may write (migration 369)

## Finding (source: the privilege census of 2026-10-08, sections 0, 2 and 3; the catalog facts are the census's, this lane had no live access)

- [CONFIRMED by census] admin_set_judgement_drain was executable by PUBLIC, anon and authenticated with no caller test, and it sets the writer marker its own guard trigger trusts, so any caller could flip the judgement drain kill switch.
- [CONFIRMED by census] derived_values_admissible and research_assessments_current ran as their owner (security_invoker off), are auto-updatable, and carried INSERT, UPDATE and DELETE grants for anon and authenticated, so a write through them skipped the base tables' deny-all RLS. propagation_queue_depth is the third security_invoker-off view (not writable).
- [CONFIRMED by census] publish_aggregate (anon executable, no search_path), item_corrections_note and item_corrections_patch (anon executable, no caller test), move_override_notes_to_item_notes and gate_a_health_refresh (anon executable).
- [CONFIRMED by census] anon held INSERT 107, UPDATE 106, DELETE 107, TRUNCATE 110, TRIGGER 110 of 119 tables.

## Accomplished

- `fsi-app/supabase/migrations/369_privilege_functions_views.sql` (header NOT APPLIED; number 369 confirmed free: highest on master is 367, 368 is on lane/dead2-schema, no other branch or open PR carries 369). Sections:
  1. Functions. REVOKE EXECUTE FROM PUBLIC, anon, authenticated and GRANT to service_role on: admin_set_judgement_drain, admin_set_pause_state, item_corrections_note, item_corrections_patch, and (disclosed extension, same family, each guarded by to_regprocedure) item_corrections_latest, item_corrections_span_is_verbatim, item_corrections_pair_tombstoned, move_override_notes_to_item_notes, gate_a_health_refresh. publish_aggregate: REVOKE FROM PUBLIC, anon; authenticated and service_role keep EXECUTE; `ALTER FUNCTION ... SET search_path = public, pg_temp` (no CREATE OR REPLACE, the 180-line body is not restated).
  2. Views. Every relkind v view in public, enumerated at apply time (order-independent of DEAD-2's migration 368, which drops acquisition_backlog_v): ALTER VIEW SET (security_invoker = on); REVOKE INSERT, UPDATE, DELETE FROM PUBLIC, anon, authenticated. research_assessments_current: REVOKE SELECT FROM anon.
  3. Grant hygiene. REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon; re-GRANT per table and per command only where pg_policies shows a policy with roles overlapping {anon, public} and cmd INSERT, UPDATE, DELETE or ALL (the set is computed at apply time and printed in a NOTICE; the block asserts the anon SELECT grant count is unchanged). ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE the same six ON TABLES FROM anon.
  4. Self-check (one DO block, always rolled back by sentinel exception; a pg_temp helper runs one statement as a role under SET LOCAL ROLE and returns ok or the SQLSTATE, dropped afterwards): anon and authenticated each calling the four writers get 42501; service_role succeeds on admin_set_judgement_drain, admin_set_pause_state and item_corrections_patch and is not refused on item_corrections_note; anon calling publish_aggregate gets 42501 while authenticated and service_role succeed; the privilege catalog for all ten functions (no anon, no PUBLIC, service_role yes, authenticated only on publish_aggregate); publish_aggregate carries search_path=public, pg_temp; every view carries security_invoker=on, grants no INSERT/UPDATE/DELETE to anon or authenticated, and a real INSERT DEFAULT VALUES and DELETE through each auto-updatable view as anon and as authenticated gets 42501; anon SELECT on research_assessments_current gets 42501; service_role still reads the two flipped views, authenticated reads zero rows (or is refused) when the base table has no SELECT policy; no public table's anon ACL holds any of the six except where a policy justifies it; a real INSERT, UPDATE and DELETE as anon on a table with no anon-or-public write policy gets 42501; a table created by the migration role inside the block carries none of the six for anon.
- `fsi-app/supabase/migrations/369_privilege_functions_views.test.mjs`: 18 tests, node builtins only.
- `docs/inventories/migrations.md` regenerated with `scripts/inventories/generate-migrations-inventory.mjs --write` (329 rows, one added).

## Read and reused

- Census (read in full); migrations 354 and 201 (the writer-marker idiom, left untouched), 248 (the prior REVOKE pattern for admin_set_pause_state), 356 (the corrections functions and their SECURITY DEFINER trigger callers), 287, 294, 347, 349 (publish_aggregate, its cohort shape, ADR-035 floor, ADR-042 removal of the caller), 285, 344, 346 (the two views and their grant history), 363, 364 and 367 (the sentinel-rollback self-check shape, the has_function_privilege/aclexplode catalog assertions), ADR-035, ADR-042, spec 03, CLAUDE.md rules 13 to 15.
- Reused instead of built: the existing sentinel-rollback pattern of 363/364; to_regprocedure guards; ALTER FUNCTION SET instead of restating publish_aggregate; pg_policies as the single source for the anon re-grant set; the migrations inventory generator.
- Callers read: `src/app/api/admin/sources/pause-global/route.ts` (the only rpc caller of the two admin writers) through `requireAdminRoute` in `src/lib/api/route-guard.ts` (returns getServiceSupabase()); `scripts/proof/load-subset.mjs` (direct database connection as the migration role). Readers of the flipped views, all service role: `src/app/research/page.tsx`, `src/app/research/[slug]/page.tsx` via `src/lib/detail/load-detail.ts` (defaultCreateServiceClient), `src/lib/agent/canonical-pipeline.ts`, `scripts/producers/research/research-assessment-producer.mjs`, `src/app/api/notices/route.ts`. `scripts/proof/attacks/attacks.json` (PROOF-4) read for the publish_aggregate and admin writer attack roles.

## Decisions

- publish_aggregate cohort validation (brief item 3) NOT BUILT, reported under the brief's own STOP clause. Reasons, all [CONFIRMED by code read]: no caller exists in src or scripts (ADR-042 removed the benchmark that fed it); the cohort is a list of contributor ids whose k_min counts distinct contributing organisations (ADR-035: at least 10), so "every member is the caller's organisation" can never meet the floor and "the caller's organisation is one of the members" is an unruled reciprocity design; PROOF-4 attacks call publish_aggregate as user:owner_a with synthetic ids, so a membership test in the body would break the proof lane until attacks.json changes (not in this write set). What is closed: anon and PUBLIC. What remains (open, below): any signed-in user can still write cohort rows into aggregate_query_log with caller-supplied ids.
- authenticated therefore KEEPS EXECUTE on publish_aggregate; the migration asserts it.
- The extension list (3 corrections read helpers, move_override_notes_to_item_notes, gate_a_health_refresh) goes beyond the brief's named functions but is inside its title and the census rows; each is guarded so an absent out-of-repo function does not abort.
- Views flip to security_invoker for all views in public, not only the three; the four already on are a no-op.
- authenticated SELECT on the two flipped views is left in place; under security_invoker it is inert (base tables have no SELECT policy).
- Function default privileges are NOT changed (that would change every future function for every role).

## Before and after (privilege table; "before" is the census, "after" is what the self-check asserts at apply time, not yet applied)

| Object | Before (PUBLIC / anon / authenticated / service_role) | After |
|---|---|---|
| admin_set_judgement_drain | exec / exec / exec / exec | none / none / none / exec |
| admin_set_pause_state | revoked by 248 (census: not executable by anon or authenticated) | none / none / none / exec |
| item_corrections_note, item_corrections_patch | exec / exec / exec / exec | none / none / none / exec |
| item_corrections_latest, _span_is_verbatim, _pair_tombstoned, move_override_notes_to_item_notes, gate_a_health_refresh | exec for anon (census rows or default grants of SECURITY DEFINER functions) | none / none / none / exec (if the function exists) |
| publish_aggregate | exec / exec / exec / exec; no search_path | none / none / exec / exec; search_path=public, pg_temp |
| derived_values_admissible | security_invoker off; anon DML+TRUNCATE+SELECT; authenticated DML+SELECT | security_invoker on; no INSERT/UPDATE/DELETE for anon or authenticated |
| research_assessments_current | as above, plus anon SELECT of credibility scores | as above, and no anon SELECT |
| propagation_queue_depth | security_invoker off | security_invoker on; no INSERT/UPDATE/DELETE |
| 4 views already security_invoker on | DML grants for anon and authenticated | DML grants revoked |
| public tables, anon | INSERT 107, UPDATE 106, DELETE 107, TRUNCATE 110, TRIGGER 110 of 119 | none of the six except per-command grants a policy naming anon or public needs (count printed at apply); REFERENCES, TRUNCATE, TRIGGER never |
| default privileges, postgres, public, tables | grant ALL to anon | the six revoked for anon |

## Red then green

- With the migration file absent, `node --test fsi-app/supabase/migrations/369_privilege_functions_views.test.mjs`: 18 tests, 8 pass, 10 fail. With it: 18 pass, 0 fail.
- The attacks (SET LOCAL ROLE) run only at apply time inside the migration; they have not been executed (no database in this lane; no local Postgres available).

## NOT done

- Not applied. The SQL has not been executed against any database. Syntax and semantics were checked by reading only; CI runs the static test and the proof replay if it applies migrations.
- Cohort validation for publish_aggregate (above).
- authenticated TRUNCATE, TRIGGER and REFERENCES grants (114 tables) are untouched, by the brief; they are not subject to RLS. Recommended for SEC-3b or a follow-on.
- Function default privileges for anon/authenticated on future SECURITY DEFINER functions are untouched (every new function again defaults to anon EXECUTE until its migration revokes it).
- No src, script, attacks.json or fitness change.

## Open items

- Ruling needed on publish_aggregate for authenticated callers. Candidate shapes: (A) revoke authenticated too and grant service_role only, because no caller exists and a future caller (a server route deriving member_ids from a real join) would use the service client; this needs the PROOF-4 aggregate attacks changed to run as service; (B) keep authenticated and require the caller's organisation to be one of the cohort members (reciprocity), checked against org_memberships inside the body; this needs the same attacks changed to use real org ids.
- Risk at apply: the self-check aborts (rolling the whole migration back) if a grant the revoke cannot remove exists, for example a grant made by a role other than the table owner, or a PUBLIC grant on a function. That is a finding, not a defect, but it cannot be predicted without live access.
- Any later CREATE OR REPLACE VIEW of one of the three flipped views without WITH (security_invoker = on) resets the option; the static test scans migrations numbered above 369 for it.
