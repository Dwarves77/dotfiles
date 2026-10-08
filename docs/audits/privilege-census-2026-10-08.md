# Privilege-escalation census, schema public, 2026-10-08

> Landed in docs/audits/ on 2026-10-08 by the coordinator docs lane DOCS-3 from the register's scratch copy (source path: fsi-app/scripts/tmp/privilege-census-2026-10-08.md). The body below is the register verbatim; only the form of status tokens was touched where the checker required it. Statements below about a scratch location or a gitignored copy describe where the file lived before it landed.

Project kwrsbpiseruzbfwjpvsp. Read-only catalog queries only (pg_class, pg_policies, pg_proc, pg_trigger, pg_constraint, has_*_privilege, information_schema). No row contents read. No write executed.
File is gitignored (confirmed: `git check-ignore` matched `.gitignore:25 fsi-app/scripts/tmp/`).
Status tokens per CLAUDE.md rule 14. "[CONFIRMED: catalog]" means the grant, policy, trigger and constraint facts were read from the live catalog; where the end-to-end exploit was NOT executed (read-only lane) the impact line says so and carries [HYPOTHESIS] for the exploit, with the rollback-probe staged in section 7.

## 0. Scope and counts

- [CONFIRMED: Q0] Only app-owned schema with tables is `public` (all other non-system schemas empty or excluded). 119 tables, 119 RLS enabled, 0 RLS disabled. 7 views.
- [CONFIRMED: Q1b] Table-level grants (Supabase defaults): anon INSERT 107 / UPDATE 106 / DELETE 107 / TRUNCATE 110 / TRIGGER 110 of 119; authenticated INSERT 111 / UPDATE 108 / DELETE 110 / TRUNCATE 114 / TRIGGER 114 / REFERENCES 114. RLS is the only write barrier. TRUNCATE and TRIGGER are not subject to RLS; PostgREST does not expose them [HYPOTHESIS: unreachable over REST, relevant only to a direct DB connection or invoker-rights dynamic SQL]. Grant hygiene item, not scored below.
- [CONFIRMED: Q2] anon has zero non-SELECT policies and no public-role write policy lacks an identity or service_role check (query Q10).
- [CONFIRMED: Q2] 32 tables have at least one write policy reachable by a non-service role. 5 of those are platform-admin gated (canonical_source_candidates, ingest_rejections, integrity_flags, pending_jurisdiction_review, source_tier_opinions) and depend on profiles.is_platform_admin, which migration 364 and profiles_privilege_guard_trg now protect. The other 87 tables have no policy a non-service role can satisfy for INSERT/UPDATE: table grants exist but RLS denies.
- Escalation candidates (tables): 17 flagged = 7 column-level confirmed + 6 viewer-role gap + 3 unvalidated-foreign-key (low) + 1 hypothesis (profiles). Detail in section 1.
- Risky SECURITY DEFINER functions: 6 (1 high, 2 medium, 3 low) of 52 SECURITY DEFINER functions executable by anon or authenticated (12 are trigger functions, not directly callable). Section 2.
- Views with security_invoker off: 3 of 7. 2 are auto-updatable and carry INSERT/UPDATE/DELETE grants for anon and authenticated. Section 3.
- RLS-off tables: 0. Section 4.
- Policies with literal `true`: 42. 5 service_role, 8 reconciler (login role, no memberships), 29 on authenticated/public SELECT of which 6 are non-reference (profiles, monitoring_queue, coverage_gaps, source_trust_events, source_verifications, connection_theme_runs). Section 5.

## 1. Summary table (tables where a non-service role has a satisfiable write policy)

Columns: table | rls | non-FREE columns writable by authenticated (class:ops) | governing policy | guard trigger | escalation candidate
Class key: ID identity/ownership, PRIV privilege/status, MONEY, SCORE. ops I=insert U=update.

| table | rls | writable non-FREE columns | policy (write) | guard trigger | candidate |
|---|---|---|---|---|---|
| organizations | on | plan (MONEY, IU) | org_update_admin: caller is owner/admin of that org; with_check NULL | no (updated_at only) | YES [CONFIRMED: catalog] |
| org_memberships | on | role (PRIV), user_id, org_id (ID), IU | membership_write_admin / membership_update_admin: caller is owner/admin of that org; with_check does not pin role | partial: org_memberships_ban_guard (ban only, not role) | YES [CONFIRMED: catalog] |
| community_member_profiles | on | verified, verified_at, role (PRIV, IU), user_id (ID) | community_member_profiles_update_own / upsert_own: user_id = auth.uid() only | no | YES [CONFIRMED: catalog] |
| community_posts | on | signed_off_at (PRIV), signed_off_by, author_user_id, group_id (ID), IU | community_posts_update_author_or_admin: author, or moderator/admin of the group; with_check allows author to set any group_id | no | YES [CONFIRMED: catalog] |
| community_post_signoff_requests | on | status, decision_note (PRIV, IU), requested_by (ID) | signoff_insert: requested_by = uid and member of post group, status not pinned; signoff_decide: any active verifier or platform admin, requester not excluded | no | YES [CONFIRMED: catalog] |
| community_groups | on | owner_user_id (ID, IU) | community_groups_update_owner_or_admin; user_is_group_admin returns true for role admin OR moderator, so a moderator can reassign ownership | no | YES [CONFIRMED: catalog] (low) |
| community_group_invitations | on | status (PRIV), group_id, inviter_user_id, invitee_user_id (ID), IU | insert_admin: status not pinned to pending; update policies pin status | no | YES (low) [CONFIRMED: catalog]; consumer effect [HYPOTHESIS] |
| profiles | on | email (ID, IU); also linkedin_sub (U, not in the guard's list) | profiles_self_update: id = uid | profiles_privilege_guard_trg (covers is_platform_admin, role, org_id, workspace_role, verifier_*, tier, score, linkedin_* flags; NOT email, NOT linkedin_sub) | YES [HYPOTHESIS]: no authz consumer of profiles.email found (accept_invitation reads auth.users.email); linkedin_sub consumer not read |
| workspace_item_overrides | on | priority_override (SCORE), is_archived (PRIV), owner_user_id, owner_assigned_by, archived_by, org_id (ID) | overrides_insert_org / overrides_update_org: user_belongs_to_org(org_id), no role check, so role `viewer` writes | no (updated_at only) | YES: viewer-role gap [CONFIRMED: catalog] |
| org_watchlist | on | org_id, added_by_user_id (ID) | org_watchlist_member_insert / update: user_belongs_to_org | no | YES: viewer-role gap |
| workspace_tags | on | org_id, created_by (ID) | workspace_tags_org_insert: user_belongs_to_org and created_by = uid | no | YES: viewer-role gap |
| item_workspace_tags | on | org_id, created_by (ID) | item_workspace_tags_org_insert: same | no | YES: viewer-role gap |
| portfolios | on | org_id, created_by (ID), insert only (UPDATE column grant revoked at table level) | portfolios_org_insert / portfolios_org_update: user_belongs_to_org | portfolios_org_cap_trg (count cap only) | YES: viewer-role gap |
| portfolio_members | on | org_id, added_by (ID), insert only | portfolio_members_org_insert: user_belongs_to_org | portfolio_members_cap_trg (cap only) | YES: viewer-role gap |
| user_item_state | on | user_id, org_id (ID), is_archived (PRIV) | user_item_state_insert/update: auth.uid() = user_id; org_id not validated against membership | no | YES (low): foreign org_id writable |
| user_watchlist | on | user_id, org_id (ID) | user_watchlist_insert: auth.uid() = user_id; org_id not validated | no | YES (low) |
| community_topic_groups | on | group_id (ID) | community_topic_groups_insert_owner: topic owner; group_id not validated | no | YES (low) |
| item_assignments | on | org_id, assignee_user_id, assigned_by (ID), state (PRIV) | insert_member (assigned_by = uid, assignee must be member); update_party | item_assignments_guard_trg: UPDATE changes only `state` | no (guarded) |
| item_notes | on | org_id, author_user_id (ID) | insert_member (owner/admin/member only, viewer excluded); update_author_or_admin | item_notes_guard_trg | no (guarded) |
| moderation_reports | on | reporter_user_id, resolved_by_user_id (ID), status (PRIV) | insert pins reporter and status open; update by platform admin or group moderator, with_check lax | no | no (low note: a moderator can resolve a report that targets their own post) |
| notification_preferences | on | user_id (ID) | insert/update_self (user_id = uid) | updated_at only | no |
| notifications | on | user_id (ID), kind (PRIV) | notifications_update_self_read: with_check pins user_id, kind, payload, created_at | no | no (constrained by with_check) |
| org_invitations | on | proposed_role, status (PRIV), org_id, invited_by_user_id, accepted_by_user_id, revoked_by_user_id (ID) | admin_insert (proposed_role limited to admin/member/viewer, inviter = uid); admin_update | no | no (caller is already org admin; CHECK blocks `owner`; accept_invitation validates against auth.users.email) |
| community_group_members | on | role (PRIV), user_id, group_id (ID) | insert_admin (group admin; role and user_id unpinned); update_self_prefs (with_check pins role to own current role) | community_group_members_count_trigger (AFTER, count) | no (admin-scoped; self-update pinned) |
| community_topics | on | owner_user_id (ID) | insert/update owner = uid | no | no (self-owned) |
| community_thread_entities | on | none | insert_author | no | no |
| workspace_settings | on | org_id (ID), jurisdiction_weights (SCORE) | settings_write_admin / update_admin (owner/admin) | updated_at only | no (intended admin setting) |
| canonical_source_candidates | on | confidence (SCORE), verified*, decision (PRIV) | _admin_write ALL: profiles.is_platform_admin | no | no (admin gated; relies on 364 guard) |
| ingest_rejections | on | triaged_by (ID) | update_platform_admin | no | no (admin gated) |
| integrity_flags | on | status (PRIV), created_by, resolved_by (ID) | admin_update: platform admin | no | no (admin gated) |
| pending_jurisdiction_review | on | resolved_by (ID) | pjr_update_platform_admin | no | no (admin gated) |
| source_tier_opinions | on | opined_tier (PRIV), dismissed_by (ID) | update_platform_admin | no | no (admin gated) |

Remaining 87 tables (RLS on; INSERT/UPDATE policies, where they exist, require service_role; table grants exist but RLS denies authenticated and anon): admin_action_cooldowns, agent_run_searches, agent_runs, aggregate_query_log, assumption_register, auxiliary_energy_profiles, brief_apply_runs, bulk_imports, census_worklist, claim_versions, connection_theme_runs, connection_themes, corpus_census, corpus_turn_requests, coverage_gap_candidates, coverage_gap_census_findings, coverage_gaps, data_sources, derivation_edges, derived_values, disposition_ledger, emission_factors, entities, entity_identifiers, entity_refs, entity_scope, error_events, estimated_values, funded_pass_runlock, gate_a_health_cache, grid_connection_queues, harness_runs, holdings_quality, indexation_clauses, inference_records, institutions, intelligence_changes, intelligence_item_citations, intelligence_item_sections, intelligence_item_versions, intelligence_items, intelligence_summaries, item_changelog, item_correction_evidence, item_corrections, item_cross_references, item_disputes, item_forward_events, item_gate_a_state, item_supersessions, item_timelines, item_type_required_slots, market_series, monitoring_queue, mutation_leases, obligations, oem_tech_roadmaps, org_member_bans, pending_first_fetch, portal_link_candidates, propagation_events, provisional_sources, published_price_statistics, raw_fetches, region_dimension_coverage, regional_data_facts, regions, reroute_events, research_assessments, section_claim_provenance, sector_contexts, sensitive_field_policy, signposts, source_bias_tags, source_citations, source_reliability_ledger, source_trust_events, source_verifications, sources, staged_updates, state_cost_facts, statutory_computations, system_state, system_state_flag_audit, theme_briefs, vocabulary_mentions, vocabulary_terms. (This enumeration is the 119-table catalog list minus the 32 above.)

### Candidate findings, ranked, each with status

1. [CONFIRMED: catalog] organizations.plan (MONEY): policy `org_update_admin` lets any owner or admin of an org UPDATE the row; column grant UPDATE on `plan` to authenticated; only trigger is updated_at; only constraint is plan IN (free, pro, enterprise). An org admin can set their own plan to enterprise. Exploit not executed [HYPOTHESIS: no server-side plan reconciliation overrides it].
2. [CONFIRMED: catalog] community_member_profiles.verified / verified_at / role: policy `community_member_profiles_update_own` is `user_id = auth.uid()` only; column grants IU; no trigger; constraint `verified_has_method` only requires verification_method, organisation_key and verified_at to be non-null, and those columns are themselves user-writable. A user can self-grant the verified badge. App route `api/community/profile/verify` exists as the intended writer; the DB does not force it.
3. [CONFIRMED: catalog] org_memberships.role: an org admin can INSERT or UPDATE any membership row of their org with role `owner` (and can demote an owner), because with_check is absent and the CHECK constraint only restricts the value domain. Admin-to-owner self-promotion and owner removal. Only trigger is the ban guard.
4. [CONFIRMED: catalog] community_posts.signed_off_at / signed_off_by: author UPDATE (policy `community_posts_update_author_or_admin`) with no column restriction and no trigger; the author can stamp their own post as signed off by any user id. Same policy lets an author set `group_id` to a group they are not a member of (insert requires membership, update does not), and lets a group moderator rewrite `author_user_id`.
5. [CONFIRMED: catalog] community_post_signoff_requests: INSERT policy does not pin `status` (CHECK allows signed_off), and `signoff_decide` lets any active verifier or platform admin decide a request including their own (requested_by not excluded). Whether a signed_off request propagates to the post badge is [HYPOTHESIS] (no AFTER trigger found).
6. [CONFIRMED: catalog] community_groups.owner_user_id: `user_is_group_admin` returns true for role IN (admin, moderator); `community_groups_update_owner_or_admin` with_check is `owner_user_id = uid OR user_is_group_admin(...)`, so a moderator can transfer ownership to themselves. Low (admins can already delete the group).
7. Viewer-role gap (6 tables: workspace_item_overrides, org_watchlist, workspace_tags, item_workspace_tags, portfolios, portfolio_members) [CONFIRMED: catalog]: `user_belongs_to_org` is `EXISTS (org_memberships row for caller)` with no role test, so role `viewer` satisfies every write policy above, while item_notes and item_assignments explicitly exclude viewer. If viewer is meant to be read-only (the item_notes policy implies it), these are role-gate escalations; workspace_item_overrides.priority_override and is_archived change what every member of the org sees.
8. [HYPOTHESIS] profiles.email and profiles.linkedin_sub are self-writable and outside profiles_privilege_guard. No authz consumer found for email (accept_invitation uses auth.users). linkedin_sub consumer not read.
9. Low: user_item_state.org_id, user_watchlist.org_id, community_topic_groups.group_id accept a foreign id without membership validation [CONFIRMED: catalog]; impact is writing rows into another tenant's or group's id space, no read path found [HYPOTHESIS].
10. Read-side exposure, not a write escalation, but material: [CONFIRMED: Q9] policy `Public read` (SELECT, roles public, USING true) on profiles. anon can SELECT 34 columns incl. org_id, workspace_role, verifier_status, membership_tier, contribution_score, linkedin_*_verified, settings, notification_preferences, timezone, *_overrides. authenticated can additionally SELECT email, is_platform_admin, role, linkedin_sub for every row (column grants confirmed).

Query used (Q3, writable-column classification; table list = the 32 above):
```sql
with tabs as (select unnest(array['canonical_source_candidates','community_group_invitations','community_group_members','community_groups','community_member_profiles','community_post_signoff_requests','community_posts','community_thread_entities','community_topic_groups','community_topics','ingest_rejections','integrity_flags','pending_jurisdiction_review','source_tier_opinions','item_assignments','item_notes','item_workspace_tags','moderation_reports','notification_preferences','notifications','org_invitations','org_memberships','org_watchlist','organizations','portfolio_members','portfolios','profiles','user_item_state','user_watchlist','workspace_item_overrides','workspace_settings','workspace_tags']) t),
cols as (select c.oid, c.relname, a.attnum, a.attname,
 has_column_privilege('authenticated',c.oid,a.attnum,'INSERT') ci, has_column_privilege('authenticated',c.oid,a.attnum,'UPDATE') cu
 from tabs join pg_class c on c.relname=tabs.t and c.relnamespace='public'::regnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
cl as (select *, case
 when attname ~ '(^|_)(user_id|org_id|owner|owner_user_id|created_by|author|author_user_id|group_id|assignee_user_id|inviter_user_id|invitee_user_id|reporter_user_id|requested_by|decided_by|added_by|added_by_user_id|invited_by_user_id|resolved_by_user_id|assigned_by|actor|email)$' or attname ~ '_by(_user_id)?$' then 'IDENTITY'
 when attname ~ '(^role$|_role$|^is_|_status$|^status$|tier|verified|admin|approved|state$|visibility|moderator|badge|permission|signed_off|locked|banned|suspend|disabled|^kind$|decision)' then 'PRIVILEGE'
 when attname ~ '(credit|quota|limit|plan|seat|billing|price|cost|balance|subscription)' then 'MONEY'
 when attname ~ '(score|rating|weight|confidence|reliab|priority|rank|trust)' then 'SCORE' else 'FREE' end cls from cols)
select relname, string_agg(attname||':'||cls||':'||case when ci then 'I' else '' end||case when cu then 'U' else '' end, ', ' order by attnum) filter (where cls<>'FREE' and (ci or cu)) nonfree
from cl group by relname order by 1;
```
Q2 (write policies reachable by authenticated, public or anon):
```sql
select tablename t, policyname p, cmd, array_to_string(roles,',') r, regexp_replace(coalesce(qual,''),'\s+',' ','g') q, regexp_replace(coalesce(with_check,''),'\s+',' ','g') wc from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','ALL') and (roles && array['authenticated','public','anon']::name[]) order by 1,3,2;
```
Q1 (grants and policy counts per table; grant totals Q1b):
```sql
select c.relname, has_table_privilege('authenticated',c.oid,'INSERT') a_ins, has_table_privilege('authenticated',c.oid,'UPDATE') a_upd, has_table_privilege('authenticated',c.oid,'DELETE') a_del, has_table_privilege('anon',c.oid,'INSERT') n_ins, has_table_privilege('anon',c.oid,'UPDATE') n_upd, has_table_privilege('anon',c.oid,'DELETE') n_del, c.relrowsecurity rls, c.relforcerowsecurity frls from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by 1;
-- Q1b
select count(*) filter (where has_table_privilege('anon',c.oid,'TRUNCATE')) anon_trunc, count(*) filter (where has_table_privilege('authenticated',c.oid,'TRUNCATE')) auth_trunc from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p');
```
Q4 (BEFORE triggers on public tables):
```sql
select c.relname t, tg.tgname, p.proname fn, p.prosecdef sd, (pg_get_functiondef(p.oid) ~* 'raise\s+exception') raises, (pg_get_functiondef(p.oid) ~* 'service_role|auth\.role|is_platform_admin|current_user|session_user|current_setting') chk_caller from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_proc p on p.oid=tg.tgfoid where c.relnamespace='public'::regnamespace and not tg.tgisinternal and tg.tgtype&2=2 order by 1,2;
```
Q4b (CHECK constraints on candidate tables): `select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) from pg_constraint where contype='c' and conrelid::regclass::text in (<candidate tables>);`
Q9 (profiles column exposure): `select attname from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped and has_column_privilege('anon','public.profiles',attnum,'SELECT');` (and the same for 'authenticated' SELECT and UPDATE).
Q10: `select count(*) filter (where roles && array['anon']::name[] and cmd<>'SELECT') anon_nonselect_pols, count(*) filter (where 'public'=any(roles) and cmd<>'SELECT' and coalesce(qual,'')||coalesce(with_check,'') !~ 'service_role|auth\.uid|auth\.role') public_write_no_identity_check from pg_policies where schemaname='public';` result 0 and 0.

## 2. SECURITY DEFINER functions executable by anon or authenticated

[CONFIRMED: Q5] 52 functions: 12 trigger functions (not directly callable), 15 gated `p_org_id` RPCs, 25 others. Table lists the 6 risky ones plus those examined and cleared. "validates caller" = auth.uid() or role/membership assert inside the body.

| function | exec | writes (parsed) | validates caller | caller-controlled org/user param | verdict |
|---|---|---|---|---|---|
| admin_set_judgement_drain(p_actor text, p_state text) | anon + authenticated | system_state.judgement_drain; sets `app.judgement_drain_writer` marker itself | NO (body has no auth.uid, role or admin test) | p_actor is free text | HIGH. [CONFIRMED: catalog] reachable by anon and body unguarded; the guard trigger `guard_judgement_drain_writer_trg` keys on the marker this function sets, so the marker is attacker-obtainable. Contrast: the pause-flag writer `admin_set_pause_state` is NOT in the anon/authenticated executable set (revoked). End-to-end flip [HYPOTHESIS: not executed, live flag]; staged rollback probe in section 7. |
| item_corrections_note(p_correction_id, p_machine_value) | anon + authenticated | item_correction_evidence (upsert, bumps observed_count) | NO | p_correction_id | MEDIUM [CONFIRMED: catalog]. Anyone can inflate evidence counts or overwrite latest_machine_value for any correction id. |
| item_corrections_patch(p_item_id, p_table, p_row) | anon + authenticated | indirectly via item_corrections_note | NO | p_item_id | LOW-MEDIUM [CONFIRMED: catalog]. Read path discloses enforced correction values; side-effect writes through _note. |
| publish_aggregate(p_table, p_column, p_cohort_filter) | anon + authenticated | aggregate_query_log (inserts granted and refused rows) | NO; requester = JWT sub or 'unknown'; no search_path set (has_cfg false) | cohort members and member_values fully caller-supplied | MEDIUM [CONFIRMED: catalog]. Anonymous callers can write the privacy-budget ledger, trigger the freeze window and complement-refusal logic against legitimate cohorts (denial or poisoning of the k-anonymity accounting). Payload value is computed from caller-supplied values only, so no data disclosure found. |
| move_override_notes_to_item_notes() | anon + authenticated | item_notes (bulk insert, author NULL) from workspace_item_overrides.notes | NO | none | LOW-MEDIUM [CONFIRMED: catalog]. One-shot migration helper still callable by anyone; idempotent (ON CONFLICT DO NOTHING) so repeat calls are no-ops, but it is an anon-triggerable cross-tenant write. |
| gate_a_health_refresh() | anon + authenticated | gate_a_health_cache | NO | none | LOW. Anyone can force a cache recompute (cost and staleness churn). |
| user_is_group_member / user_owns_group / user_is_group_admin(_group_id, _user_id) | anon + authenticated | none | NO | _user_id | LOW. Membership oracle for any user id and group id. Also note user_is_group_admin returns true for role moderator (drives finding 6). |
| accept_invitation(p_token) | anon + authenticated | org_invitations, org_memberships | YES: auth.uid(), caller email from auth.users, token, expiry, ban check | token | cleared. Note: ON CONFLICT DO UPDATE SET role = invitation role can DEMOTE an existing owner or admin who accepts a lower invite. |
| create_org_for_self(p_org_name, p_org_slug) | anon + authenticated | organizations (plan hard-coded free), org_memberships owner, workspace_settings | YES: auth.uid() required | name, slug | cleared |
| decline_invitation(p_token), revoke_invitation(p_invitation_id), lookup_invitation(p_token) | anon + authenticated | org_invitations | YES (token or org admin check) | token or id | cleared |
| request_verification() | authenticated only | profiles.verifier_status none to pending | YES: auth.uid() | none | cleared (this is migration 367's RPC) |
| _assert_org_membership + 14 p_org_id RPCs (get_workspace_*, get_*_items, get_*_surface_counts, _workspace_active_items) | anon + authenticated | none | YES: all 14 call _assert_org_membership (membership or service_role); verified by body regex Q6 | p_org_id | cleared. Membership test ignores role, so a viewer reads everything an org member reads (consistent with finding 7 class). |
| get_*_public (4), get_workspace_intelligence_listings_public, get_workspace_intelligence_slim_public | anon + authenticated | none | n/a, public listings by design | none | cleared |
| 12 trigger functions | anon + authenticated | various | n/a | none | not directly callable |

Q5:
```sql
with f as (select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_functiondef(p.oid) d, has_function_privilege('anon',p.oid,'EXECUTE') ax, has_function_privilege('authenticated',p.oid,'EXECUTE') ux, p.proconfig from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and p.prokind='f' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')))
select proname, args, ax, ux,
 (select string_agg(distinct m[2], ',') from regexp_matches(d, '(insert\s+into|update|delete\s+from)\s+(?:public\.)?([a-z_]+)', 'gi') m) writes,
 (d ~* 'auth\.uid\(\)') uses_uid, (d ~* 'is_platform_admin|is_admin\(') chk_admin, (d ~* 'org_memberships|user_belongs_to_org|user_is_group_admin|is_org_') chk_member, (d ~* 'service_role|auth\.role\(\)|current_user|session_user') chk_role,
 (args ~* '(org_id|user_id|owner|tenant|_uid|p_user|p_org)') ctrl_param, (proconfig is not null) has_cfg
from f order by 1;
```
Q6 (org-RPC gate): `select proname, (pg_get_functiondef(oid) ~* 'perform\s+(public\.)?_assert_org_membership') calls_assert from pg_proc where pronamespace='public'::regnamespace and prosecdef and pg_get_function_identity_arguments(oid) ~ 'p_org_id' and has_function_privilege('anon',oid,'EXECUTE');`
Q7 (bodies read): `select proname, regexp_replace(pg_get_functiondef(oid),'\s+',' ','g') from pg_proc where pronamespace='public'::regnamespace and proname in ('admin_set_judgement_drain','item_corrections_note','move_override_notes_to_item_notes','publish_aggregate','item_corrections_patch','accept_invitation','create_org_for_self','revoke_invitation','request_verification','profiles_privilege_guard','org_memberships_ban_guard','user_belongs_to_org','user_is_group_admin','item_assignments_guard','_assert_org_membership');`

## 3. Views with security_invoker off

[CONFIRMED: Q8] Three of seven public views have security_invoker off and are owned by postgres. RLS on their base tables is enabled with FORCE off, so the owner bypasses RLS when the view reads or writes.

| view | base | updatable | anon grants | authenticated grants | verdict |
|---|---|---|---|---|---|
| derived_values_admissible | derived_values (RLS on, zero policies = deny) | information_schema: updatable YES, insertable YES, check_option NONE | SELECT, INSERT, UPDATE, DELETE, TRUNCATE | SELECT, INSERT, UPDATE, DELETE | HIGH [CONFIRMED: catalog] for reachability: the view runs as owner, so a write through it is not subject to the base table's deny-all RLS. Intended as the read-only pollution barrier (rule RD-56); the DML grants plus updatability turn it into a write door. Actual write [HYPOTHESIS: not executed]; probe staged in section 7. SELECT filter (lifecycle and admissibility) is correct for reads. |
| research_assessments_current | research_assessments (RLS on, zero policies) | YES / YES / NONE | all DML | all DML | HIGH [CONFIRMED: catalog] same shape. Also exposes all 26 columns, including credibility scores, to anon on read, where the base table denies. [HYPOTHESIS: reads are intended for public Research surface; confirm]. |
| propagation_queue_depth | propagation_events | NO / NO | SELECT (plus unusable DML grants) | same | LOW: aggregate count and oldest timestamp only; not writable. |

The 4 security_invoker=on views (acquisition_backlog_v, census_rollup_by_surface, emission_factor_candidates, licence_clear_sources) also hold DML grants for anon and authenticated but writes pass through the invoker's RLS on the base tables, which have no matching write policy: safe.

Q8:
```sql
select c.relname, pg_get_userbyid(c.relowner) owner, coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'),'off') sec_invoker, has_table_privilege('anon',c.oid,'SELECT') anon_sel, has_table_privilege('anon',c.oid,'UPDATE') anon_upd, has_table_privilege('authenticated',c.oid,'UPDATE') auth_upd from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m') order by 1;
select v.table_name, v.is_updatable, v.is_insertable_into, v.check_option from information_schema.views v where v.table_schema='public';
select relname, relforcerowsecurity, relrowsecurity, pg_get_userbyid(relowner) from pg_class where relnamespace='public'::regnamespace and relname in ('derived_values','research_assessments');
```

## 4. Tables with RLS disabled

[CONFIRMED: Q0] None. `select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and not c.relrowsecurity;` returns 0 of 119. No other app-owned schema contains tables.
Adjacent fact [CONFIRMED]: none of the six spot-checked tables (derived_values, research_assessments, propagation_events, system_state, item_correction_evidence, aggregate_query_log) uses FORCE ROW LEVEL SECURITY, so table-owner paths (security_invoker=off views, SECURITY DEFINER functions owned by postgres) bypass RLS by design; sections 2 and 3 are where that matters.

## 5. Policies with literal USING true (or WITH CHECK true)

[CONFIRMED: Q11] 42 policies.
- service_role scoped (5): agent_runs, intelligence_item_versions, item_gate_a_state, pending_first_fetch, raw_fetches.
- reconciler scoped (8): agent_run_searches, integrity_flags (select and insert), intelligence_item_sections, intelligence_items (select and UPDATE true/true), item_type_required_slots, section_claim_provenance. `reconciler` is a login role (rolcanlogin true, bypassrls false); [CONFIRMED: Q9b] it is a member of no role and no role is a member of it, so anon and authenticated cannot SET ROLE to it. Its UPDATE true/true on intelligence_items is credential-bound, not exposed to end users.
- authenticated or public SELECT true (29): reference or catalog tables (23): assumption_register, connection_themes, data_sources, emission_factors, entities, entity_identifiers, entity_refs, entity_scope, estimated_values, grid_connection_queues, market_series, oem_tech_roadmaps, published_price_statistics, region_dimension_coverage, regional_data_facts, regions, reroute_events, signposts, source_citations, sources, state_cost_facts, statutory_computations, theme_briefs.
- Non-reference (6), flagged: profiles (`Public read`, public: see finding 10, the serious one), monitoring_queue (public), coverage_gaps (public), source_trust_events (public), source_verifications (public), connection_theme_runs (public). The last five are operational telemetry readable by anon [HYPOTHESIS: intended for the public trust surface; confirm per table].

Q11: `select tablename, policyname, cmd, array_to_string(roles,','), qual, with_check from pg_policies where schemaname='public' and (btrim(qual) in ('true','(true)') or btrim(with_check) in ('true','(true)')) order by 1,2;`
Q9b: `select r.rolname, m.rolname from pg_auth_members am join pg_roles r on r.oid=am.roleid join pg_roles m on m.oid=am.member where r.rolname='reconciler' or m.rolname='reconciler';` returned no rows.

## 6. Ten most serious items (ordered)

1. admin_set_judgement_drain: anon and authenticated can EXECUTE; no caller check; sets its own writer marker. [CONFIRMED: catalog] reachability; flip [HYPOTHESIS].
2. derived_values_admissible: security_invoker off, owner postgres, updatable, INSERT/UPDATE/DELETE granted to anon and authenticated. [CONFIRMED: catalog]; write [HYPOTHESIS].
3. research_assessments_current: same shape as 2, plus anon-readable credibility scores. [CONFIRMED: catalog]; write [HYPOTHESIS].
4. organizations.plan via policy org_update_admin (org admin sets own plan). [CONFIRMED: catalog]
5. community_member_profiles.verified/verified_at via community_member_profiles_update_own (self-verify). [CONFIRMED: catalog]
6. org_memberships.role via membership_write_admin / membership_update_admin (admin to owner, owner demotion). [CONFIRMED: catalog]
7. community_posts.signed_off_at/signed_off_by (and group_id, author_user_id) via community_posts_update_author_or_admin. [CONFIRMED: catalog]
8. profiles "Public read" (true): anon reads org_id, workspace_role, verifier_status and 31 more columns; authenticated reads every email and is_platform_admin. [CONFIRMED: catalog]
9. publish_aggregate (anon executable, caller-supplied cohort, writes privacy ledger, no search_path) and item_corrections_note / item_corrections_patch (anon-writable evidence counters). [CONFIRMED: catalog]
10. Viewer-role gap: user_belongs_to_org has no role test; viewer satisfies write policies on workspace_item_overrides (priority_override, is_archived), org_watchlist, workspace_tags, item_workspace_tags, portfolios, portfolio_members, while item_notes and item_assignments exclude viewer. [CONFIRMED: catalog]
Also noted: community_post_signoff_requests (status unpinned on insert, self-decide by verifier), community_groups.owner_user_id (moderator takeover), move_override_notes_to_item_notes (anon-callable bulk write), TRUNCATE/TRIGGER grants to anon and authenticated on 110 to 114 tables.

## 7. Staged adversarial probes (NOT executed in this lane; rule 15 template: attack under rollback)

Each raises an exception at the end so the whole DO block rolls back; the exception text carries the observed row count. Run only on coordinator approval.
```sql
-- A: anon through the pollution-barrier view
do $$ declare n int; begin set local role anon; update public.derived_values_admissible set value = value where false; get diagnostics n = row_count; raise exception 'PROBE_A privilege_ok rows=%', n; end $$;
-- A2: to test row reach, replace "where false" with "where true" (still rolled back by the raise).
-- B: anon through research_assessments_current
do $$ declare n int; begin set local role anon; update public.research_assessments_current set status_token = status_token where true; get diagnostics n = row_count; raise exception 'PROBE_B rows=%', n; end $$;
-- C: anon calls the unguarded drain writer (rolled back)
do $$ begin set local role anon; perform public.admin_set_judgement_drain('probe', 'off'); raise exception 'PROBE_C executed_without_error'; end $$;
-- D: org admin plan write and role write, run with request.jwt.claims set to a test admin's sub in a throwaway org (needs fixture; not staged by SQL here).
```
A permission error at SET ROLE/UPDATE means the finding is [REFUTED]; a PROBE_ message with rows greater than zero or "executed_without_error" upgrades it to [CONFIRMED] exploit. Correct this file in place either way.
