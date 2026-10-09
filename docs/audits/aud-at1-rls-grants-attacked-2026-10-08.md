# AUD-AT-1: RLS and grants x ATTACKED (owed cell O-001), 2026-10-08

> **Landing note (lane SEC-7, PR 1037):** The fix for its residual is in flight in PR 1037 (SEC-7, migration 381, NOT APPLIED), open at the time of this landing. No finding in this register was re-verified by the landing lane (DOCS-4); findings carry the tokens the audit's own method assigns. The body is the register verbatim; the only edit is the form of status tokens, where the checker required it: 1 line received the token that line's own section or method statement already carries.

Lenses run: ATTACKED. Lenses not run: EXISTS, RUNS, CALLED, COSTS, FIRED-TRUE, MODE, OVERLAPS, OPERATOR-SEAT, RECORD-VS-REALITY (all owed for subsystem 11).
Subsystem: 11, RLS and grants. Unit: each table by principal by command (SELECT, INSERT, UPDATE, DELETE, TRUNCATE), each column privilege revoked from authenticated by migrations 364, 367 and 370, each policy.
Enumerator: SELECT over pg_tables (schemaname='public'), pg_class and has_table_privilege, has_column_privilege, has_any_column_privilege for anon and authenticated, information_schema.role_table_grants and column_privileges, and pg_policies, run over the Supabase MCP execute_sql (project kwrsbpiseruzbfwjpvsp).
Status tokens follow CLAUDE.md rule 14. Every observation below carries [CONFIRMED: rolled-back DO block probe, AUD-AT-1] unless it is marked otherwise. Nothing in this file is a recommendation.

## 0. Start condition and window

- [CONFIRMED: schema_migrations read] Migration 370_privilege_table_policies is recorded (ledger version 20261008131555), with 371_definer_hygiene (20261008131647), 372_profiles_read (20261008092141), 373 (20261008134455), 375_admin_flag_private (20261008131209) and 377 (20261008134702). The latest earlier entry is 369_privilege_functions_views (20261008072538). [NOT-WORK: fact, no action]
- Probes ran 2026-10-08 between 14:26 and 14:34 UTC against the live schema as it stood then. [NOT-WORK: fact, no action]
- Live inventory at run time [CONFIRMED: catalog]: 121 public tables (pg_tables), 0 partitioned, 0 with RLS off, 0 with FORCE RLS, 6 views, 213 policies (200 name anon, authenticated or public; 13 name only reconciler or service_role), 96 tables carry at least one policy. [NOT-WORK: fact, no action]
- Grant counts at run time [CONFIRMED: has_table_privilege over 121 tables]: anon SELECT 108, INSERT 44, UPDATE 35, DELETE 31, TRUNCATE 0. authenticated SELECT 114, INSERT 108, UPDATE 104, DELETE 110, TRUNCATE 0. Column-level (partial) UPDATE grants for authenticated exist on 6 tables (community_member_profiles, community_posts, notifications, organizations, portfolios, profiles); partial INSERT on 4 (community_member_profiles, community_posts, organizations, profiles). [NOT-WORK: fact, no action]

## 1. Principals

| id | principal | status |
|---|---|---|
| P1 | anon (SET LOCAL ROLE anon, jwt claims role anon, no sub) | RUN |
| P2 | authenticated as an org viewer | OWED: org_memberships holds 2 rows (1 owner, 1 member), no row with role viewer [CONFIRMED: count by role] |
| P3 | authenticated as an org member of another org | OWED: org_memberships holds 1 organization with members; no second org and no member of another org exists [CONFIRMED: count of distinct org_id = 1] |
| P4 | authenticated as a platform non-admin: the one real profile with is_platform_admin false, who is also the org member (role member) of the single org | RUN (SET LOCAL ROLE authenticated, jwt sub = that profile id, claims role authenticated). The id and e-mail are not recorded here. |

The brief names the profile of jasonlosh@gmail.com for the org-member legs; the catalog read matched that profile to the single non-admin member. P4 therefore covers both the "org member" leg and the "platform non-admin" leg. The "org member of another org" leg is owed under P3, not run as a substitute.

## 2. Result summary

Enumerator cell count: 121 tables x 4 principals x 5 commands = 2420 cells, plus 51 revoked-column cells (31 UPDATE, 20 INSERT) for authenticated.
Attempted: 1210 table cells (P1 and P4, 121 tables x 2 x 5) plus 50 revoked-column probes = 1260 probe statements. Owed: 1210 table cells (P2 605, P3 605) and 1 column cell (not assignable). 1210 + 1210 = 2420. 50 + 1 = 51. [CONFIRMED: counts computed from the matrix in section 7 by a read-only script]

Outcome of the 1210 attempted table cells (the 50 column probes are in section 9):

| outcome | P1 anon (605) | P4 authenticated (605) | total |
|---|---|---|---|
| ACCEPTED (changed rows or read rows where the catalog predicted refusal) | 0 | 0 | 0 |
| REFUSED 42501 (R:grant) | 410 | 159 | 569 |
| REFUSED 42501 (R:rls) | 36 | 108 | 144 |
| REFUSED 42501 (R:guard, org_membership_role_guard) | 0 | 1 | 1 |
| REFUSED, 0 rows (R0: target rows existed, policy filtered them all) | 78 | 181 | 259 |
| NX (ran; the table had no rows for the probe to act on) | 55 | 116 | 171 |
| READ returning rows (RD under a literal-true policy 17 / 21; RA under a filtered policy 9 / 16) | 26 | 37 | 63 |
| ADMITTED-BY-POLICY (write changed rows, a write policy applies) | 0 | 2 | 2 |
| POLICY-NOT-REFUSED, stopped by a constraint (23505) | 0 | 1 | 1 |
| total | 605 | 605 | 1210 |

Refused = 569 + 144 + 1 + 259 = 973 cells. TRUNCATE: 242 of 242 cells refused at privilege (anon and authenticated hold TRUNCATE on 0 of 121 tables). Rollback proof: 121 of 121 tables unchanged inside the transaction; 0 of 121 differ in a committed-state snapshot taken before the first call (14:26:15 UTC) and after the last probe call (14:39:42 UTC).

## 3. Rows that were NOT refused (ACCEPTED first)

ACCEPTED (a weaker principal performed an action for which the grant and policy catalog predicted refusal): 0 cells of 1210 attempted.

Other non-refused rows (outcome is not a refusal; each is stated with the catalog expectation that applied):

| attack id | principal | target | expected | observed | SQLSTATE | status |
|---|---|---|---|---|---|---|
| workspace_item_overrides.P4.UPDATE | P4 | UPDATE workspace_item_overrides, target rows = rows whose owner column differs from the caller (4 of 4 rows in the org) | per-policy(1): a write policy applies to authenticated | 4 rows updated (no-op assignment, rolled back) | 00000 | ADMITTED-BY-POLICY [CONFIRMED: probe] |
| workspace_item_overrides.P4.DELETE | P4 | DELETE workspace_item_overrides, same target rows | per-policy(1) | 4 rows deleted (rolled back) | 00000 | ADMITTED-BY-POLICY [CONFIRMED: probe] |
| workspace_item_overrides.P4.INSERT | P4 | INSERT a copy of an existing row (primary key regenerated) | per-policy(1) | row-level security did not refuse; stopped by a unique constraint | 23505 | POLICY-NOT-REFUSED(constraint) [CONFIRMED: probe]. Whether an insert with non-conflicting values would pass is [HYPOTHESIS], not executed. |

The caller in these three rows holds role member in the org. Migration 370 made the write policies on workspace_item_overrides use user_can_write_in_org (role member, admin or owner). The viewer role is the principal that migration changes; P2 does not exist, so the viewer leg for workspace_item_overrides, org_watchlist, workspace_tags, item_workspace_tags, portfolios and portfolio_members is OWED (section 4).

## 4. Owed legs and cells not exercised, with reason

1. P2 (org viewer): 121 tables x 5 commands = 605 cells OWED. Reason: no viewer membership exists. Fixture creation inside a rolled-back block was not among the approved statements.
2. P3 (org member of another org): 121 x 5 = 605 cells OWED. Reason: one organization exists.
3. NX cells (command ran and was refused or returned nothing, but the table had no rows for the probe to act on, so the policy was not exercised against a row): counted in section 2 and listed per table in section 7 as NX. For INSERT the probe never depends on existing rows beyond the copy source; where a table was empty the INSERT used DEFAULT VALUES. [CONFIRMED: rolled-back DO block probe, AUD-AT-1] [NOT-WORK: fact, no action]
4. One column privilege not probed by a statement: portfolios has 5 columns without UPDATE for authenticated; 1 of them is a generated or identity column that cannot be assigned, so 4 were probed (30 of 31 revoked UPDATE columns probed across the 6 tables) [CONFIRMED: attgenerated/attidentity catalog read]. [NOT-WORK: fact, no action]
5. Layer 2 standing alone (the guard trigger with the column grant restored) was not exercised: restoring a grant is a write outside the approved statements. Migrations 364 and 370 each run that leg inside their own self-check [CONFIRMED: read of the migration files]; this lane did not re-run it.
6. Views (6) and functions (EXECUTE grants, SECURITY DEFINER bodies) are outside this lane's enumerator (tables, column privileges, policies). The census staged probes A, B and C (derived_values_admissible, research_assessments_current, admin_set_judgement_drain) were not run here. OWED.
7. Policies for the roles reconciler and service_role (13 policies) are not attacked: those are not weaker principals. [NOT-WORK: fact, no action]
8. The six lenses other than ATTACKED are owed for subsystem 11.

## 5. Method, as run, and deviations from the brief

- One DO block per call covered a batch of 15 or 16 tables (8 calls, 121 tables). Inside it, each table ran in its own BEGIN ... EXCEPTION sub-block that ended with RAISE EXCEPTION 'aud-at1-rollback', which rolled that table's probes back before the next table began; the DO block as a whole also ended with RAISE EXCEPTION 'aud-at1-rollback:<results>', and every call returned that text (P0001). This groups the brief's "one DO block per table" into 8 calls; the per-table rollback shape is kept. The grouping is a deviation from the brief's wording. [NOT-WORK: fact, no action]
- A first trial call on 5 tables (profiles, organizations, org_memberships, community_member_profiles, notifications) and an earlier version that failed on an array-append type error (22P02, nothing executed past that point) preceded the 8 recorded calls; their outputs are not used. The trial showed an UPDATE probe column choice that read an ungranted column; the recorded runs choose a column with both UPDATE and SELECT privilege for the role where one exists. [NOT-WORK: fact, no action]
- Each cell ran inside its own nested sub-block (savepoint) with SET LOCAL ROLE <principal> and request.jwt.claims set, then RESET ROLE. [NOT-WORK: fact, no action]
- Statements per cell: SELECT = count(*) over the rows matching the target predicate; INSERT = a copy of the first existing row via jsonb_populate_record (primary key columns that have a default left out, generated and identity columns left out), or DEFAULT VALUES when the table is empty; UPDATE = SET c = c over the target rows (c is a column the role may update and read, else the first column); DELETE over the target rows; TRUNCATE. [NOT-WORK: fact, no action]
- Target predicate for P4: when the table has a uuid identity column (user_id, owner_user_id, author_user_id, created_by, added_by_user_id, added_by, requested_by, reporter_user_id, assignee_user_id, invitee_user_id, inviter_user_id; id for profiles) the predicate is that column IS DISTINCT FROM auth.uid() (kind U, foreign rows). Otherwise it is true (kind A, all rows). For P1 it is always true. [NOT-WORK: fact, no action]
- Expected, per cell, from the catalog read inside the block: ng = refused, role holds no grant; np = refused, grant held but no applicable policy; ppN = N applicable policies, outcome decided by the policy; r = refused (TRUNCATE for any weaker principal); cr = refused, column revoked. A write that changes rows where the expectation is ng, np, r or cr is ACCEPTED. A write that changes rows where ppN applies is ADMITTED-BY-POLICY and is listed in section 3, not judged. [NOT-WORK: fact, no action]
- No row content, e-mail, token or id is printed in this file or was echoed to the transcript; the probe reports row counts and SQLSTATEs only. The ids of the fixture principal are not recorded. [NOT-WORK: fact, no action]
- Two further calls of the same shape (anon only, 11 tables, INSERT/UPDATE/DELETE and SELECT) re-ran cells that the matrix coded R:grant while a policy applied, and recorded the SQLERRM text (object names only) to see which object refused (section 10). Their results are not part of the 1210-cell count; they are the evidence for the refusal mechanism. [NOT-WORK: fact, no action]
- Side effects not rolled back by design: sequence advances. Nothing else changed (section 8). [NOT-WORK: fact, no action]

## 6. Legend

Cell format: S, I, U, D, T = SELECT, INSERT, UPDATE, DELETE, TRUNCATE; value = code/expected. Attack id = table.principal.command, for example agent_runs.P1.INSERT. Codes:
- R:grant = refused 42501 "permission denied": the message names a table, a column or, for some policy helpers, a function (section 10 separates them for the 24 anon cells where a policy applies). R:rls = refused 42501 new row violates row-level security. R:guard:<name> = refused 42501 raised by a guard trigger. R0 = ran, 0 rows changed or visible while target rows existed (policy filtered all). NX = ran, no target rows existed. [NOT-WORK: fact, no action]
- RD:n = read returned n rows under a policy whose qualifier is literal true. RA:n = read returned n rows under a policy with a row filter. AD:n = write admitted by policy, n rows. PNR:state = policy did not refuse, stopped by a constraint with that SQLSTATE. ACC:x = ACCEPTED. REC = 42P17 policy recursion. ERR:state = any other error. [NOT-WORK: fact, no action]
- (A) = target predicate true; (U) = foreign-row predicate. cols:upd a/b ins c/d = revoked-column probes refused a of b (UPDATE) and c of d (INSERT). PROOF c0/c1 x0/x1 = row count before/after and sum of xmin before/after, read as the owner inside the same transaction, before the table's probes and after its sub-block rolled back. [NOT-WORK: fact, no action]

## 7. Matrix (121 tables; each line: table, rows at probe time, P1 cells, P4 cells, column probes, rollback proof)

```
T|admin_action_cooldowns|1rows|anon:S=R0/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|auth(A):S=R0/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1/1 22029/22029 unchanged;
T|agent_run_searches|6597rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 6597/6597 2030106297/2030106297 unchanged;
T|agent_runs|24144rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 24144/24144 3382225570/3382225570 unchanged;
T|aggregate_query_log|0rows|anon:S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|assumption_register|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|auxiliary_energy_profiles|0rows|anon:S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|brief_apply_runs|3rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 3/3 933003/933003 unchanged;
T|bulk_imports|0rows|anon:S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|canonical_source_candidates|331rows|anon:S=R0/pp2,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|auth(A):S=R0/pp2,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 331/331 9863245/9863245 unchanged;
T|census_worklist|21609rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 21609/21609 3362310349/3362310349 unchanged;
T|claim_versions|949rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 949/949 274657744/274657744 unchanged;
T|community_group_invitations|0rows|anon:S=NX/pp2,I=R:rls/pp2,U=NX/pp3,D=NX/pp1,T=R:grant/r,|auth(U):S=NX/pp2,I=R:rls/pp2,U=NX/pp3,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|community_group_members|1rows|anon:S=R0/pp2,I=R:grant/pp2,U=R:grant/pp2,D=R0/pp2,T=R:grant/r,|auth(U):S=R0/pp2,I=R:rls/pp2,U=R0/pp2,D=R0/pp2,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1/1 67664/67664 unchanged;
T|community_groups|7rows|anon:S=RA:7/pp2,I=R:rls/pp2,U=R0/pp2,D=R0/pp2,T=R:grant/r,|auth(U):S=RA:7/pp2,I=R:rls/pp2,U=R0/pp2,D=R0/pp2,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 7/7 614841/614841 unchanged;
T|community_member_profiles|0rows|anon:S=NX/pp2,I=R:grant/ng,U=R:grant/ng,D=NX/pp1,T=R:grant/r,|auth(U):S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp1,T=R:grant/r,|cols:upd 4/4 ins 4/4|PROOF 0/0 0/0 unchanged;
T|community_post_signoff_requests|0rows|anon:S=R:grant/pp1,I=R:rls/pp1,U=R:grant/pp2,D=R:grant/ng,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=NX/pp2,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|community_posts|0rows|anon:S=NX/pp2,I=R:grant/ng,U=R:grant/ng,D=NX/pp2,T=R:grant/r,|auth(U):S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp2,T=R:grant/r,|cols:upd 3/3 ins 2/2|PROOF 0/0 0/0 unchanged;
T|community_thread_entities|0rows|anon:S=NX/pp2,I=R:rls/pp2,U=NX/pp1,D=NX/pp1,T=R:grant/r,|auth(A):S=NX/pp2,I=R:rls/pp2,U=NX/pp1,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|community_topic_groups|0rows|anon:S=NX/pp2,I=R:rls/pp2,U=NX/pp1,D=NX/pp2,T=R:grant/r,|auth(A):S=NX/pp2,I=R:rls/pp2,U=NX/pp1,D=NX/pp2,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|community_topics|0rows|anon:S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp2,T=R:grant/r,|auth(U):S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp2,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|connection_theme_runs|64rows|anon:S=RD:64/pp2,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|auth(A):S=RD:64/pp2,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 64/64 15451261/15451261 unchanged;
T|connection_themes|18rows|anon:S=RD:18/pp2,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|auth(A):S=RD:18/pp2,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 18/18 5668830/5668830 unchanged;
T|corpus_census|655rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 655/655 53237863/53237863 unchanged;
T|corpus_turn_requests|1757rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1757/1757 399312576/399312576 unchanged;
T|coverage_gap_candidates|109rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 109/109 27649227/27649227 unchanged;
T|coverage_gap_census_findings|116rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 116/116 9986636/9986636 unchanged;
T|coverage_gaps|2rows|anon:S=RD:2/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:2/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2/2 23108/23108 unchanged;
T|data_sources|28rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:28/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 28/28 5609772/5609772 unchanged;
T|derivation_edges|20rows|anon:S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 20/20 4446755/4446755 unchanged;
T|derived_values|20rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 20/20 4446832/4446832 unchanged;
T|disposition_ledger|236rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 236/236 19471032/19471032 unchanged;
T|emission_factors|13rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:13/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 13/13 2658108/2658108 unchanged;
T|entities|2880rows|anon:S=RD:2880/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:2880/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2880/2880 665139679/665139679 unchanged;
T|entity_aliases|0rows|anon:S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|entity_identifiers|2853rows|anon:S=RD:2853/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:2853/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2853/2853 657744527/657744527 unchanged;
T|entity_refs|2878rows|anon:S=RD:2878/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:2878/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2878/2878 740830796/740830796 unchanged;
T|entity_relations|0rows|anon:S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|entity_scope|8rows|anon:S=RD:8/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:8/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 8/8 2298120/2298120 unchanged;
T|error_events|43rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 43/43 10286403/10286403 unchanged;
T|estimated_values|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|funded_pass_runlock|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/np,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|gate_a_health_cache|1rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1/1 200067/200067 unchanged;
T|grid_connection_queues|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|harness_runs|195rows|anon:S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 195/195 61635991/61635991 unchanged;
T|holdings_quality|672rows|anon:S=R0/pp2,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|auth(A):S=R0/pp2,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 672/672 49925089/49925089 unchanged;
T|indexation_clauses|0rows|anon:S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|inference_records|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/np,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|ingest_rejections|133rows|anon:S=R0/pp1,I=R:grant/ng,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/pp1,I=R:rls/np,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 133/133 2642523/2642523 unchanged;
T|institutions|462rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 462/462 13844583/13844583 unchanged;
T|integrity_flags|11224rows|anon:S=R0/pp2,I=R:rls/pp1,U=R0/pp2,D=R0/pp1,T=R:grant/r,|auth(A):S=R0/pp2,I=R:rls/pp1,U=R0/pp2,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 11224/11224 2575554027/2575554027 unchanged;
T|intelligence_changes|0rows|anon:S=NX/pp2,I=R:rls/pp1,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp2,I=R:rls/pp1,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|intelligence_item_citations|2668rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2668/2668 415636262/415636262 unchanged;
T|intelligence_item_sections|12686rows|anon:S=RA:6143/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:6143/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 12686/12686 2382512254/2382512254 unchanged;
T|intelligence_item_versions|4100rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 4100/4100 779505512/779505512 unchanged;
T|intelligence_items|2766rows|anon:S=RA:1440/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|auth(A):S=RA:1440/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2766/2766 721985160/721985160 unchanged;
T|intelligence_summaries|2040rows|anon:S=R0/pp1,I=R:rls/pp1,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:2040/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2040/2040 6725535/6725535 unchanged;
T|item_assignments|0rows|anon:S=R:grant/ng,I=R:rls/pp1,U=R:grant/pp1,D=NX/pp1,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=NX/pp1,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|item_changelog|146rows|anon:S=RA:143/pp1,I=R:rls/pp1,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:143/pp1,I=R:rls/pp1,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 146/146 42349517/42349517 unchanged;
T|item_correction_evidence|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|item_corrections|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(U):S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|item_cross_references|23715rows|anon:S=RA:20072/pp1,I=R:rls/pp1,U=R:grant/ng,D=R0/pp1,T=R:grant/r,|auth(A):S=RA:20072/pp1,I=R:rls/pp1,U=R0/np,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 23715/23715 5419050367/5419050367 unchanged;
T|item_disputes|7rows|anon:S=RA:6/pp1,I=R:rls/pp1,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:6/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 7/7 14126/14126 unchanged;
T|item_forward_events|1336rows|anon:S=RA:1048/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:1048/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1336/1336 336587003/336587003 unchanged;
T|item_gate_a_state|2690rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2690/2690 573765585/573765585 unchanged;
T|item_notes|0rows|anon:S=R:grant/ng,I=R:rls/pp1,U=R:grant/pp1,D=R:grant/ng,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=NX/pp1,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|item_supersessions|11rows|anon:S=R0/pp1,I=R:rls/pp1,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/pp1,I=R:rls/pp1,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 11/11 123996/123996 unchanged;
T|item_timelines|2913rows|anon:S=RA:2197/pp1,I=R:rls/pp1,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:2197/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2913/2913 867804583/867804583 unchanged;
T|item_type_required_slots|48rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 48/48 2476916/2476916 unchanged;
T|item_workspace_tags|0rows|anon:S=NX/pp1,I=R:grant/pp1,U=R:grant/ng,D=R:grant/pp1,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=NX/np,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|market_series|2747rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:2747/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2747/2747 598471970/598471970 unchanged;
T|moderation_reports|0rows|anon:S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp1,T=R:grant/r,|auth(U):S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|monitoring_queue|580rows|anon:S=RD:580/pp1,I=R:rls/pp1,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:580/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 580/580 8673554/8673554 unchanged;
T|mutation_leases|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/np,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|notification_preferences|0rows|anon:S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp2,T=R:grant/r,|auth(U):S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp2,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|notifications|0rows|anon:S=NX/pp2,I=R:rls/pp1,U=R:grant/ng,D=NX/pp1,T=R:grant/r,|auth(U):S=NX/pp2,I=R:rls/pp1,U=NX/pp2,D=NX/pp1,T=R:grant/r,|cols:upd 5/5 ins 0/0|PROOF 0/0 0/0 unchanged;
T|obligations|1336rows|anon:S=RA:1048/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:1048/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1336/1336 329516470/329516470 unchanged;
T|oem_tech_roadmaps|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|org_invitations|0rows|anon:S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp1,T=R:grant/r,|auth(A):S=NX/pp2,I=R:rls/pp2,U=NX/pp2,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|org_member_bans|0rows|anon:S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|org_memberships|2rows|anon:S=R0/pp1,I=R:grant/pp1,U=R:grant/pp1,D=R:grant/pp1,T=R:grant/r,|auth(U):S=RA:1/pp1,I=R:guard:org_membership_role_guard/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2/2 318090/318090 unchanged;
T|org_watchlist|0rows|anon:S=NX/pp1,I=R:grant/pp1,U=R:grant/pp1,D=R:grant/pp1,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=NX/pp1,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|organizations|1rows|anon:S=R0/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:1/pp1,I=R:grant/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 1/1 ins 1/1|PROOF 1/1 2030/2030 unchanged;
T|pending_first_fetch|1388rows|anon:S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1388/1388 260497701/260497701 unchanged;
T|pending_jurisdiction_review|77rows|anon:S=R0/pp1,I=R:grant/ng,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/pp1,I=R:rls/np,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 77/77 1492683/1492683 unchanged;
T|portal_link_candidates|57472rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 57472/57472 16349378100/16349378100 unchanged;
T|portfolio_members|0rows|anon:S=R:grant/ng,I=R:grant/pp1,U=R:grant/ng,D=R:grant/pp1,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=R:grant/ng,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|portfolios|0rows|anon:S=R:grant/ng,I=R:grant/pp1,U=R:grant/pp1,D=R:grant/pp1,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=NX/pp1,D=NX/pp1,T=R:grant/r,|cols:upd 4/4 ins 0/0|PROOF 0/0 0/0 unchanged;
T|profiles|2rows|anon:S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(U):S=RA:1/pp1,I=R:grant/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 13/13 ins 13/13|PROOF 2/2 334968/334968 unchanged;
T|propagation_events|2784rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2784/2784 725172481/725172481 unchanged;
T|provisional_sources|497rows|anon:S=R0/pp1,I=R:rls/pp1,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 497/497 9431968/9431968 unchanged;
T|published_price_statistics|10rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:10/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 10/10 1993003/1993003 unchanged;
T|raw_fetches|679rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 679/679 11296056/11296056 unchanged;
T|region_dimension_coverage|30rows|anon:S=RD:30/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:30/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 30/30 1161896/1161896 unchanged;
T|regional_data_facts|90rows|anon:S=RD:90/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:90/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 90/90 4541916/4541916 unchanged;
T|regions|5rows|anon:S=RD:5/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:5/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 5/5 91640/91640 unchanged;
T|reroute_events|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|research_assessments|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/np,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|section_claim_provenance|34025rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 34025/34025 6218358383/6218358383 unchanged;
T|sector_contexts|15rows|anon:S=R0/pp1,I=R:rls/pp1,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:15/pp1,I=R:rls/pp1,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 15/15 40110/40110 unchanged;
T|sensitive_field_policy|4rows|anon:S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R:grant/ng,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 4/4 1263856/1263856 unchanged;
T|signposts|0rows|anon:S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|source_bias_tags|2895rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2895/2895 51808558/51808558 unchanged;
T|source_citations|742rows|anon:S=RD:742/pp1,I=R:rls/pp1,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:742/pp1,I=R:rls/pp1,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 742/742 32198798/32198798 unchanged;
T|source_reliability_ledger|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/np,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|source_tier_opinions|371rows|anon:S=R0/pp1,I=R:grant/ng,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/pp1,I=R:rls/np,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 371/371 106505567/106505567 unchanged;
T|source_trust_events|908rows|anon:S=RD:908/pp1,I=R:rls/pp1,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:908/pp1,I=R:rls/pp1,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 908/908 12356047/12356047 unchanged;
T|source_verifications|1414rows|anon:S=RD:1414/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:1414/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1414/1414 12523166/12523166 unchanged;
T|sources|2572rows|anon:S=RD:2572/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|auth(A):S=RD:2572/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 2572/2572 675873362/675873362 unchanged;
T|staged_updates|38rows|anon:S=R0/np,I=R:rls/pp1,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 38/38 1393216/1393216 unchanged;
T|state_cost_facts|13rows|anon:S=RD:13/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:13/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 13/13 892593/892593 unchanged;
T|statutory_computations|0rows|anon:S=NX/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|system_state|1rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1/1 87684/87684 unchanged;
T|system_state_flag_audit|8rows|anon:S=R0/np,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=R0/np,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 8/8 637320/637320 unchanged;
T|theme_briefs|9rows|anon:S=RD:9/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=RD:9/pp1,I=R:rls/np,U=R0/np,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 9/9 1805148/1805148 unchanged;
T|user_item_state|0rows|anon:S=NX/pp1,I=R:rls/pp1,U=NX/pp1,D=NX/pp1,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=NX/pp1,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|user_watchlist|1rows|anon:S=R0/pp1,I=R:rls/pp1,U=R:grant/ng,D=R0/pp1,T=R:grant/r,|auth(U):S=R0/pp1,I=R:rls/pp1,U=R0/np,D=R0/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1/1 190129/190129 unchanged;
T|vocabulary_mentions|0rows|anon:S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|vocabulary_terms|0rows|anon:S=NX/pp1,I=R:grant/ng,U=R:grant/ng,D=R:grant/ng,T=R:grant/r,|auth(A):S=NX/pp1,I=R:rls/np,U=NX/np,D=NX/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
T|workspace_item_overrides|4rows|anon:S=R0/pp1,I=R:grant/pp1,U=R:grant/pp1,D=R:grant/pp1,T=R:grant/r,|auth(U):S=RA:4/pp1,I=PNR:23505/pp1,U=AD:4/pp1,D=AD:4/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 4/4 112945/112945 unchanged;
T|workspace_settings|1rows|anon:S=R0/pp1,I=R:rls/pp1,U=R0/pp1,D=R:grant/ng,T=R:grant/r,|auth(A):S=RA:1/pp1,I=R:rls/pp1,U=R0/pp1,D=R0/np,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 1/1 199524/199524 unchanged;
T|workspace_tags|0rows|anon:S=NX/pp1,I=R:grant/pp1,U=R:grant/ng,D=R:grant/pp1,T=R:grant/r,|auth(U):S=NX/pp1,I=R:rls/pp1,U=NX/np,D=NX/pp1,T=R:grant/r,|cols:upd 0/0 ins 0/0|PROOF 0/0 0/0 unchanged;
```

## 8. Rollback proof

- Per table: the PROOF field in section 7 compares count(*) and sum(xmin) before the table's probes and after the sub-block rolled back: 121 of 121 tables read "unchanged" (count and xmin sum equal) [CONFIRMED: counted from the matrix by a read-only script]. Tables with zero rows show 0/0 and 0/0, which proves no inserted row survived; it cannot show an update or delete, because there was nothing to update or delete. [NOT-WORK: fact, no action]
- Across the whole run: a snapshot of count(*) and sum(xmin) for all 121 public tables taken at 2026-10-08 14:26:15 UTC (before the first probe call) was compared with the same query at 14:33:52 UTC (after the 8 recorded calls) and again at 14:39:42 UTC (after the two targeted message calls of section 10): 0 of 121 tables differ at each comparison [CONFIRMED: SQL diff of the two snapshots; the earlier one was embedded as literals]. Concurrent application writes would also show as a difference; none appeared in the 13 minutes. [NOT-WORK: fact, no action]
- pg_stat_user_tables n_tup_ins/n_tup_upd/n_tup_del, before and after, for the 7 tables that carry column or admitted-write probes: unchanged for community_member_profiles (8/6/0), notifications (2/1/0), org_memberships (21/15/3), organizations (8/6/0), portfolios (3/1/0), profiles (27/17/1); workspace_item_overrides moved from 1/1/0 to 2/5/4. Fact: Postgres adds aborted tuple operations to these counters. The workspace_item_overrides movement (+1 insert attempt that reached the heap before the unique violation, +4 updates, +4 deletes) equals the three non-refused probes in section 3, all rolled back; the committed-state diff above is empty. The pg_stat comparison therefore does not by itself show "no committed change"; the count/xmin snapshot does. [NOT-WORK: fact, no action]
- Each call returned P0001 with text beginning aud-at1-rollback, which is the sentinel exception [CONFIRMED: error text of all 8 recorded calls]. [NOT-WORK: fact, no action]

## 9. Column probes (revoked privileges, P4)

Authenticated holds partial column grants on 6 tables. Every revoked column was probed by an UPDATE of that column (SET c = c over the foreign-row predicate) and, where the table has partial INSERT grants, by an INSERT of that column.

| table | UPDATE refused / probed | INSERT refused / probed |
|---|---|---|
| profiles | 13 / 13 | 13 / 13 |
| community_member_profiles | 4 / 4 | 4 / 4 |
| community_posts | 3 / 3 | 2 / 2 |
| notifications | 5 / 5 | 0 / 0 |
| organizations | 1 / 1 | 1 / 1 |
| portfolios | 4 / 4 (1 column not assignable) | 0 / 0 |
| total | 30 / 30 | 20 / 20 |

All 50 column probes were refused 42501 permission denied (50 of 50). Column names seen in the trial call's output (not in the recorded calls, which print counts): profiles.is_platform_admin, role, org_id, workspace_role, verifier_status, verifier_since, membership_tier, contribution_score, verification_tier and the four linkedin verification columns; organizations.plan; community_member_profiles.verified, verified_at, verification_method, organisation_key; notifications.id, user_id, kind, payload, created_at. The community_posts columns (3 UPDATE, 2 INSERT) were counted by the recorded call; their names were not printed. The counts in the table above are from the recorded calls.

## 10. Facts observed on reads (counts only; whether a read is intended is not judged here)

- P1 (anon) SELECT returned rows on these tables: under a literal-true policy: connection_theme_runs 64, connection_themes 18, coverage_gaps 2, entities 2880, entity_identifiers 2853, entity_refs 2878, entity_scope 8, monitoring_queue 580, region_dimension_coverage 30, regional_data_facts 90, regions 5, source_citations 742, source_trust_events 908, source_verifications 1414, sources 2572, state_cost_facts 13, theme_briefs 9. Under a filtered policy: community_groups 7, intelligence_item_sections 6143 of 12686, intelligence_items 1440 of 2766, item_changelog 143 of 146, item_cross_references 20072 of 23715, item_disputes 6 of 7, item_forward_events 1048 of 1336, item_timelines 2197 of 2913, obligations 1048 of 1336.
- P1 SELECT refused R:grant on 13 tables: profiles, derivation_edges, harness_runs, pending_first_fetch, sensitive_field_policy, aggregate_query_log, entity_aliases, entity_relations, item_assignments, item_notes, community_post_signoff_requests, portfolios, portfolio_members. For community_post_signoff_requests the message names table profiles (the policy reads profiles, which anon cannot read); for the others it names the table itself. [NOT-WORK: fact, no action]
- P4 (authenticated, platform non-admin, org member) SELECT of foreign rows (rows whose identity column differs from the caller) returned: profiles 1 of 1, org_memberships 1 of 1, community_groups 7, organizations 1 of 1 (all-rows predicate), workspace_item_overrides 4 of 4, workspace_settings 1 of 1, intelligence_items 1440, intelligence_item_sections 6143, intelligence_summaries 2040, item_changelog 143, item_cross_references 20072, item_disputes 6, item_forward_events 1048, item_timelines 2197, obligations 1048, sector_contexts 15 (all under a filtered policy, code RA), plus the literal-true tables in the first bullet and emission_factors 13, market_series 2747, published_price_statistics 10, data_sources 28 (code RD, authenticated only).
- No table returned rows to a principal for which the catalog showed no applicable SELECT policy (0 cells coded ACC:read). [NOT-WORK: fact, no action]
- Census staged item compared: the census recorded anon SELECT on 34 profiles columns through a "Public read" policy. At run time anon holds no SELECT grant on public.profiles (S=R:grant/ng). This is the probe fact; the migration that changed it is not asserted here. [NOT-WORK: fact, no action]
- Census staged item compared: the census recorded organizations.plan, community_member_profiles verification columns, community_posts sign-off columns and org_memberships.role as writable by an org admin or member. At run time P4 (role member, not admin) is refused at column privilege on organizations.plan, on the four community_member_profiles verification columns and on the 3 revoked UPDATE and 2 revoked INSERT columns of community_posts, and is refused on an org_memberships INSERT copy of a membership row by guard org_membership_role_guard. P4 UPDATE and DELETE on foreign org_memberships rows returned 0 rows (R0). The admin and owner legs of those findings were not run: no admin-role non-platform-admin principal exists (the one org owner is the platform admin, and the brief names the weakest principal). OWED: org admin and owner legs for organizations.plan and org_memberships.role. [NOT-WORK: fact, no action]

## 11. What stopped anon on tables where anon holds table-level DML (anon cells coded R:grant while a policy applies: 24 cells)

[CONFIRMED: SQLERRM text from two targeted rolled-back calls, 11 tables; object names only] Anon holds table-level INSERT, UPDATE and DELETE (has_table_privilege true) on org_memberships, org_watchlist, workspace_item_overrides, community_group_members, item_workspace_tags, workspace_tags, portfolios and portfolio_members, and INSERT/UPDATE on item_notes. The refusal text for these cells names an object:
- permission denied for function user_org_role: org_memberships INSERT, UPDATE, DELETE. [NOT-WORK: fact, no action]
- permission denied for function user_group_role: community_group_members INSERT, UPDATE. [NOT-WORK: fact, no action]
- permission denied for function user_can_write_in_org: org_watchlist INSERT, UPDATE, DELETE; workspace_item_overrides INSERT, UPDATE, DELETE; workspace_tags INSERT, DELETE; item_workspace_tags INSERT, DELETE; portfolios INSERT, DELETE; portfolio_members INSERT, DELETE. [NOT-WORK: fact, no action]
- permission denied for the table itself: portfolios UPDATE, item_assignments UPDATE, item_notes UPDATE. Permission denied for table profiles: community_post_signoff_requests SELECT and UPDATE (the policy reads profiles, which anon cannot read).
Count: 19 of the 24 cells are refused on a policy helper function, 5 on a table. Not part of the 24 (coded R:rls in the matrix): community_post_signoff_requests INSERT, item_assignments INSERT, item_notes INSERT, refused with "new row violates row-level security policy".
Fact: on the function-refused cells anon holds the table-level privilege, and the refusal comes from the EXECUTE privilege on the policy helper function (migration 370 text revokes EXECUTE on user_org_role, user_group_role and user_can_write_in_org from PUBLIC and grants it to authenticated and service_role; has_function_privilege at run time: anon false, authenticated true, service_role true for all three; user_belongs_to_org, the older helper, shows anon true) [CONFIRMED: catalog read and migration text], not from the policy's own predicate and not from the table grant. Whether the policy predicate alone would refuse anon (anon has no auth.uid()) was not tested separately; [HYPOTHESIS] that it would, since the helpers key on auth.uid().
Also a fact: anon DELETE on community_group_members and item_assignments returned ok with 0 rows (R0 or NX in the matrix), meaning the DELETE policy evaluated without error. [NOT-WORK: fact, no action]

## 12. Matrix cell content to enter

~2026-10-08 AT1
