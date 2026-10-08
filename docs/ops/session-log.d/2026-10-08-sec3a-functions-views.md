# 2026-10-08, lane SEC-3a (sec3a-functions-views): functions, views and grants that let anon or a user write what only the system may write (migration 369)

## Finding (source: the privilege census of 2026-10-08, sections 0, 2 and 3; the catalog facts are the census's, this lane had no live access)

- [CONFIRMED by census] admin_set_judgement_drain was executable by PUBLIC, anon and authenticated with no caller test, and it sets the writer marker its own guard trigger trusts, so any caller could flip the judgement drain kill switch.
- [CONFIRMED by census] derived_values_admissible and research_assessments_current ran as their owner (security_invoker off), are auto-updatable, and carried INSERT, UPDATE and DELETE grants for anon and authenticated, so a write through them skipped the base tables' deny-all RLS. propagation_queue_depth is the third security_invoker-off view (not writable).
- [CONFIRMED by census] publish_aggregate (anon executable, no search_path), item_corrections_note and item_corrections_patch (anon executable, no caller test), move_override_notes_to_item_notes (anon executable).
- [CONFIRMED by census] anon held INSERT 107, UPDATE 106, DELETE 107, TRUNCATE 110, TRIGGER 110 of 119 tables; authenticated held TRUNCATE 114, TRIGGER 114, REFERENCES 114 (none of the three is subject to RLS).

## Accomplished

- `fsi-app/supabase/migrations/369_privilege_functions_views.sql` (header NOT APPLIED; number 369 free: 368 landed on master from DEAD-2, no other branch carries 369). Sections:
  1. Functions. REVOKE EXECUTE FROM PUBLIC, anon, authenticated and GRANT to service_role on: admin_set_judgement_drain, admin_set_pause_state, item_corrections_note, item_corrections_patch, and (coordinator ruling, each guarded by to_regprocedure) item_corrections_latest, item_corrections_span_is_verbatim, item_corrections_pair_tombstoned, move_override_notes_to_item_notes. publish_aggregate (ruling A): REVOKE FROM PUBLIC, anon, authenticated, GRANT to service_role only, and `ALTER FUNCTION ... SET search_path = public, pg_temp` (no CREATE OR REPLACE). gate_a_health_refresh was removed from the migration entirely (F47 allowlists it).
  2. Views. Every relkind v view in public, enumerated at apply time: ALTER VIEW SET (security_invoker = on); REVOKE INSERT, UPDATE, DELETE FROM PUBLIC, anon, authenticated. research_assessments_current: REVOKE SELECT FROM anon.
  3. Grant hygiene. REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, re-GRANT per table and per command only where pg_policies shows a policy with roles overlapping {anon, public} (set printed in a NOTICE). REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated (new, ruling 4). ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE the six FROM anon and the three FROM authenticated. The block asserts the anon SELECT grant count and the authenticated INSERT/UPDATE/DELETE grant count are unchanged.
  4. Self-check (always rolled back by sentinel; a pg_temp helper runs one statement as a role): anon and authenticated each calling the four writers get 42501, and anon and authenticated calling publish_aggregate get 42501; service_role succeeds on admin_set_judgement_drain, admin_set_pause_state, item_corrections_patch and publish_aggregate; the privilege catalog for all nine functions (no anon, no authenticated, no PUBLIC, service_role yes); publish_aggregate carries search_path=public, pg_temp; every view carries security_invoker=on with no INSERT/UPDATE/DELETE for anon or authenticated and a real INSERT DEFAULT VALUES and DELETE through each auto-updatable view refused 42501; anon SELECT on research_assessments_current refused 42501; the flipped views still readable by service_role; a real INSERT, UPDATE, DELETE as anon on a table with no anon-or-public write policy refused 42501; no authenticated TRUNCATE, TRIGGER or REFERENCES on any public table ACL and a real `TRUNCATE` as authenticated on one real table refused 42501; the default ACL for new tables (read from pg_default_acl: role postgres, schema public, objtype r) holds none of the six for anon and none of the three for authenticated. No table is created (the earlier probe table tripped F47 and F64).
- `fsi-app/supabase/migrations/369_privilege_functions_views.test.mjs`: 21 tests, node builtins only.
- `fsi-app/scripts/proof/attacks/attacks.json` (write-set expansion GRANTED by the coordinator, limited to the publish_aggregate entries): in adr035-aggregate-below-floor-refused the existing legs now run as `service` (the floor still refuses k-1, 5 and 0 organisations and grants exactly k), plus an authenticated leg and an anon leg that must raise 42501; in adr035-dominance-cap-refused the legs run as `service` plus an authenticated leg that must raise 42501. `attacks-manifest.test.mjs` and `attack-engine.test.mjs` pass (32 tests).
- No harness pending marker: GATE-3 (merged into this branch) retired the pending-run convention and F28 now fails on any pending/ directory, so the chain-proof marker created for the attacks.json change was removed again before the final push (the first push of it, in the previous commit, was what failed the Discipline engine unit tests).
- `docs/inventories/migrations.md` regenerated.

## Read and reused

- Census (read in full); migrations 354 and 201, 248, 356, 287, 294, 347, 349, 285, 344, 346, 363, 364, 367; ADR-035, ADR-042; spec 03; the route-guard and view-reader files; `scripts/proof/attacks/attacks.json`, `attacks-manifest.test.mjs`, `attack-engine.mjs`; `scripts/harness-runs/CONVENTION.md` and the chain-proof family descriptor.
- Reused instead of built: the sentinel-rollback pattern of 363/364; to_regprocedure guards; ALTER FUNCTION SET instead of restating publish_aggregate; pg_policies as the single source of the anon re-grant set; pg_default_acl instead of a probe table; the existing `expect.error` and `as: service|anon|user:` forms of the attack manifest; the migrations inventory generator.

## Per-function evidence for the extension list (ruling 2: keep only if SECURITY DEFINER and every caller uses the service client or is itself SECURITY DEFINER)

| Function | SECURITY DEFINER | Callers in src and scripts (git grep, including tests) | Callers in the migration tree | Verdict |
|---|---|---|---|---|
| item_corrections_latest(uuid, text) | yes (356, line 163) | none through rpc; `src/lib/corrections/item-corrections.mjs` line 14 names it in a comment only | item_corrections_patch (356, lines 263, 289, 300, 314), SECURITY DEFINER | kept |
| item_corrections_span_is_verbatim(uuid, uuid, text) | yes (356, line 180) | none | item_corrections_before_insert (356, line 430), SECURITY DEFINER | kept |
| item_corrections_pair_tombstoned(uuid, uuid) | yes (356, line 217) | none through rpc; same comment in item-corrections.mjs | item_corrections_block_tombstoned_edge (356, line 561), SECURITY DEFINER | kept |
| move_override_notes_to_item_notes() | yes per census section 2; not defined in the migration tree | none in src, scripts, .discipline, supabase | none | kept: run post-merge by the executor over the Supabase MCP (service role) per the coordinator |
| gate_a_health_refresh() | yes (256) | none through rpc | none | removed from the migration (ruling 2) |

## Decisions

- publish_aggregate: ruling A, service_role only. Aggregates are system-published, no user path exists (ADR-042; no src or script caller). The cohort-membership validation of the original brief is therefore moot and not built; the authenticated ledger-poisoning residue is closed by the revoke. PROOF-4 attacks changed accordingly (above).
- Views flip to security_invoker for all views in public, not only the three; the four already on are a no-op. authenticated SELECT on the two flipped views is left in place (inert under security_invoker).
- Function default privileges are NOT changed (ruling 5); the input to a follow-up lane is the list below.

## [CONFIRMED] SECURITY DEFINER functions in public with no explicit REVOKE EXECUTE FROM PUBLIC anywhere in the migrations (input to a follow-up lane; nothing built from it here)

Method [CONFIRMED]: a parse of every `fsi-app/supabase/migrations/*.sql` file in numeric order with comments stripped. A function is SECURITY DEFINER if the SECURITY DEFINER attribute appears in its CREATE FUNCTION header or in the tail after its dollar-quoted body, or in an `ALTER FUNCTION ... SECURITY DEFINER`; a DROP FUNCTION removes it; a REVOKE counts when its statement names the function (`ON FUNCTION`) and `PUBLIC` in its FROM list with EXECUTE or ALL (no `REVOKE ... ON ALL FUNCTIONS IN SCHEMA` exists anywhere); migration 369's own revokes are counted. Limits: functions defined only live (out of repo, for example move_override_notes_to_item_notes) are invisible to this parse; a revoke built from a dynamic string in a DO block is only recognized in 369. Totals: 56 SECURITY DEFINER functions defined in the migrations; 14 with an explicit REVOKE FROM PUBLIC; **42 without**, of which 31 are callable (non-trigger) and 11 are trigger functions.

Callable (31): _assert_org_membership, _workspace_active_items, accept_invitation, create_org_for_self, decline_invitation, gate_a_health_refresh, get_all_surface_counts, get_market_intel_items, get_market_intel_items_public, get_operations_items, get_operations_items_public, get_research_items, get_research_items_public, get_surface_counts, get_technology_items, get_workspace_due_next, get_workspace_intelligence, get_workspace_intelligence_aggregates, get_workspace_intelligence_aggregates_scoped, get_workspace_intelligence_dashboard, get_workspace_intelligence_listings, get_workspace_intelligence_listings_public, get_workspace_intelligence_slim, get_workspace_intelligence_slim_public, get_workspace_recent_changes, lookup_invitation, revoke_invitation, user_belongs_to_org, user_is_group_admin, user_is_group_member, user_owns_group.

Trigger functions (11): _intelligence_items_normalize_jurisdictions, enqueue_pending_first_fetch, item_corrections_apply_claims, item_corrections_apply_items, item_corrections_apply_sections, item_corrections_before_insert, item_corrections_block_tombstoned_edge, org_memberships_ban_guard, trg_intelligence_items_version_snapshot, update_community_group_member_count, update_community_post_reply_count.

Explicit REVOKE FROM PUBLIC present (14): admin_set_judgement_drain, admin_set_pause_state, capture_worker_fetch, create_item_correction, intelligence_items_theme_guard, item_corrections_latest, item_corrections_note, item_corrections_pair_tombstoned, item_corrections_patch, item_corrections_span_is_verbatim, publish_aggregate, reorder_user_list_item, request_verification, revoke_item_correction. Note: an explicit REVOKE FROM PUBLIC alone does not remove a Supabase role-specific default grant to anon or authenticated; that needs the REVOKE to name those roles too (369 does).

## Before and after (privilege table; "before" is the census, "after" is what the self-check asserts at apply time, not yet applied)

| Object | Before (PUBLIC / anon / authenticated / service_role) | After |
|---|---|---|
| admin_set_judgement_drain | exec / exec / exec / exec | none / none / none / exec |
| admin_set_pause_state | revoked by 248 (census: not executable by anon or authenticated) | none / none / none / exec |
| item_corrections_note, item_corrections_patch | exec / exec / exec / exec | none / none / none / exec |
| item_corrections_latest, _span_is_verbatim, _pair_tombstoned, move_override_notes_to_item_notes | exec for anon (default grants of SECURITY DEFINER functions) | none / none / none / exec (if the function exists) |
| gate_a_health_refresh | exec for anon | unchanged (removed from the migration, ruling 2) |
| publish_aggregate | exec / exec / exec / exec; no search_path | none / none / none / exec; search_path=public, pg_temp |
| derived_values_admissible | security_invoker off; anon DML+TRUNCATE+SELECT; authenticated DML+SELECT | security_invoker on; no INSERT/UPDATE/DELETE for anon or authenticated |
| research_assessments_current | as above, plus anon SELECT of credibility scores | as above, and no anon SELECT |
| propagation_queue_depth | security_invoker off | security_invoker on; no INSERT/UPDATE/DELETE |
| 4 views already security_invoker on | DML grants for anon and authenticated | DML grants revoked |
| public tables, anon | INSERT 107, UPDATE 106, DELETE 107, TRUNCATE 110, TRIGGER 110 of 119 | none of the six except per-command grants a policy naming anon or public needs (count printed at apply); REFERENCES, TRUNCATE, TRIGGER never |
| public tables, authenticated | TRUNCATE 114, TRIGGER 114, REFERENCES 114 | none of the three; INSERT/UPDATE/DELETE unchanged (SEC-3b) |
| default privileges, postgres, public, tables | grant ALL to anon and authenticated | the six revoked for anon, the three revoked for authenticated |

## Red then green

- First commit: with the migration file absent the test file gave 18 tests, 8 pass, 10 fail; with it, 18 pass.
- Follow-up commit (rulings 1, 3, 4): the test file was updated first and run against the previous migration: 21 tests, 14 pass, 7 fail (extension list and gate_a_health_refresh, publish_aggregate grants, authenticated TRUNCATE/TRIGGER/REFERENCES, default privileges for authenticated, no-table probe, TRUNCATE leg, self-check attack list). After editing the migration: 21 pass, 0 fail. `node --test` of 369's test, `attacks-manifest.test.mjs` and `attack-engine.test.mjs`: 53 pass, 0 fail.
- The attacks (SET LOCAL ROLE) run only at apply time inside the migration, and in the chain-proof attack suite; neither has been executed (no database in this lane).

## NOT done

- Not applied. The SQL has not been executed against any database; syntax and semantics were checked by reading only. The updated attacks.json legs have not been run against the proof stack.
- Function default privileges for future SECURITY DEFINER functions are untouched (ruling 5); the list above is the input for the follow-up lane.
- No src change.

## Open items

- Risk at apply: the self-check aborts (rolling the whole migration back) if a grant the REVOKE cannot remove exists, for example a grant made by a role other than the table owner, or a PUBLIC grant on a table or function. That is a finding, not a defect, but it cannot be predicted without live access.
- Any later CREATE OR REPLACE VIEW of one of the three flipped views without WITH (security_invoker = on) resets the option; the static test scans migrations numbered above 369 for it.
