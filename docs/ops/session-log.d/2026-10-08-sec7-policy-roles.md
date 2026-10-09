# Session log 2026-10-08, lane SEC-7 (sec7-policy-roles)

Migration 381_write_policies_name_their_role.sql (NOT APPLIED). Facts only; each is something this lane read or ran. No live database access, no network.

## Accomplished

- Wrote migration 381: 107 `ALTER POLICY ... TO authenticated, service_role` statements (one per INSERT, UPDATE, DELETE or ALL policy whose roles are the implicit {public} in the migration tree below 381), a guarded block for the 4 out-of-band write policies, an apply-time enumeration assertion, 369's grant hygiene block repeated verbatim AFTER the ALTERs, and a rolled-back self-check. [CONFIRMED: file read; the static test passes]
- Wrote 381_write_policies_name_their_role.test.mjs (17 tests). It re-derives the policy set from the tree (CREATE, ALTER, DROP, RENAME and DROP TABLE of policies in file order) and fails if the ALTER list or either policy array differs; checks the verbatim hygiene block and its order; runs the shared fixture checker (`_lib/fixture-inserts.mjs`) over every self-check INSERT and UPDATE; carries mutation tests (a dropped ALTER, an extra ALTER, an ALTER to public, the hygiene block moved before the ALTERs, a synthetic tree). [CONFIRMED: `node --test`, 17 of 17]
- Added two PROOF-4 attacks to `scripts/proof/attacks/attacks.json` (group SEC-7 write policy roles): `sec7-anon-write-refused-on-the-grant` (12 anon attacks that require 42501 with the message class "permission denied for table <name>", one cross-organization attack that requires the row-level-security message, 5 controls) and `sec7-no-unjustified-anon-write-privilege` (2 catalog counts that must be 0, 1 control). [CONFIRMED: attacks-manifest, run-attacks and attack-engine tests pass, 51 of 51]
- `docs/inventories/migrations.md` and `APPLIED-MAP.json` are not touched by this lane: after PR 1035 (4ee8bbee) lanes no longer edit them, and this branch carries master versions of both. [CONFIRMED: git diff origin/master lists only the migration, its test, attacks.json and this log]

## Read and reused

- Read: AT1 register (full), CLAUDE.md, `docs/dispatches/lane-common-contract.md`, ADR-046, migrations 369 (full), 370 (SQL and test), 375 (header), 118 and 169 (reconciler), 259 (summaries ALTERs), `docs/inventories/out-of-band-objects.md`, `attack-engine.mjs` and the `attacks.json` structure.
- Reused: 369's section 3 block (copied statement for statement; the test asserts equality; 369 defined no function to call); 370's self-check shape (`sec3b_try` and `sec3b_expect` become `sec7_try` and `sec7_expect` with an anon branch, the fixture insert pattern, the sentinel rollback); `supabase/migrations/_lib/fixture-inserts.mjs` for the fixture proof; the 370 test's structure; the PROOF-4 fixtures (org_a, owner_a, member_b) for the attacks; the existing expect vocabulary (`error` plus `message_includes`).

## Decisions made by rule (the brief settled the design)

- ALL policies are in scope: they apply to the three write commands and 369's re-grant loop keys on cmd ALL as well. [CONFIRMED: 369 text]
- Order is ALTERs, enumeration assertion, then the hygiene block: run the other way round, the block re-grants (the policies still overlap {public}). 370 revoked anon INSERT and UPDATE on organizations, community_member_profiles, community_posts and notifications, and the tree still has TO public policies on all four, so a bare re-run of 369 today would hand anon those privileges back. [CONFIRMED: tree parse; AT1 shows those anon cells as ng]
- No policy is excluded: all 107 tree policies require an authenticated actor (text match of the tree predicate, also read by eye, and re-checked by the test). So no table keeps an anon write grant; the block still handles one if it appears (it keeps the grant and names the table in a NOTICE).
- Out-of-band policies (live only, in no migration file) cannot be listed from the tree and cannot be ALTERed unconditionally (a replay without them would fail): a guarded DO block narrows them only when present and only when the live predicate names an authenticated actor, else the apply stops.
- Preconditions stop the apply before any change if a listed policy is missing, has roles other than {public} (or already narrowed), or its live predicate names no authenticated actor.
- The reconciler role is unaffected: migration 118 states it connects directly with no JWT (auth.role() is NULL) and its policies are TO reconciler. [CONFIRMED: 118 text, asserted by the test]
- Helpers' grants are untouched (SEC-4). After 381 no write policy is evaluated for anon.

## Evidence the tree matches the live catalog

- AT1 header: anon holds INSERT on 44 tables, UPDATE on 35, DELETE on 31. Reading the matrix cells (anon cell code other than ng): 44, 35, 31. [CONFIRMED: read-only script over the register]
- Applicable-policy counts (ppN) in AT1 anon write cells against the tree: 110 cells, 106 match; the 4 that differ are exactly intelligence_changes INSERT, intelligence_summaries INSERT and UPDATE, sector_contexts INSERT, the out-of-band write policies. [CONFIRMED]
- Not confirmed (no live access): the live names and predicates of the 107 policies, and the predicates of changes_write_service and sector_contexts_write_service. The apply-time preconditions check both and stop the apply on a difference.

## Policy table, before and after

Before: roles {public} (implicit, no TO clause). After: roles {authenticated, service_role}. USING and WITH CHECK unchanged. Tree policies (107):

| table | policies (cmd) |
|---|---|
| admin_action_cooldowns | service role full access (ALL) |
| canonical_source_candidates | canonical_source_candidates_admin_write (ALL) |
| community_group_invitations | community_group_invitations_insert_admin (INSERT); community_group_invitations_update_invitee (UPDATE); community_group_invitations_update_admin (UPDATE); community_group_invitations_service_role (ALL) |
| community_group_members | community_group_members_insert_admin (INSERT); community_group_members_update_self_prefs (UPDATE); community_group_members_service_role (ALL); community_group_members_delete_self_or_admin (DELETE) |
| community_groups | community_groups_insert_authenticated (INSERT); community_groups_service_role (ALL); community_groups_update_owner_or_admin (UPDATE); community_groups_delete_owner_or_admin (DELETE) |
| community_member_profiles | community_member_profiles_upsert_own (INSERT); community_member_profiles_update_own (UPDATE); community_member_profiles_service_role (ALL) |
| community_post_signoff_requests | signoff_insert (INSERT); signoff_decide (UPDATE); signoff_withdraw_own (UPDATE) |
| community_posts | community_posts_insert_member (INSERT); community_posts_update_author_or_admin (UPDATE); community_posts_delete_author_or_admin (DELETE); community_posts_service_role (ALL) |
| community_thread_entities | community_thread_entities_insert_author (INSERT); community_thread_entities_service_role (ALL) |
| community_topic_groups | community_topic_groups_insert_owner (INSERT); community_topic_groups_delete_owner (DELETE); community_topic_groups_service_role (ALL) |
| community_topics | community_topics_insert_owner (INSERT); community_topics_update_owner (UPDATE); community_topics_delete_owner (DELETE); community_topics_service_role (ALL) |
| connection_theme_runs | connection_theme_runs_admin_write (ALL) |
| connection_themes | connection_themes_admin_write (ALL) |
| holdings_quality | holdings_quality_service_role_write (ALL) |
| ingest_rejections | ingest_rejections_update_platform_admin (UPDATE) |
| integrity_flags | integrity_flags_service_role_write (ALL); integrity_flags_admin_update (UPDATE) |
| intelligence_items | intelligence_items_admin_insert (INSERT); intelligence_items_admin_update (UPDATE); intelligence_items_admin_delete (DELETE) |
| item_assignments | item_assignments_insert_member (INSERT); item_assignments_update_party (UPDATE); item_assignments_delete_party (DELETE) |
| item_changelog | item_changelog_admin_write (INSERT) |
| item_cross_references | item_cross_references_admin_write (INSERT); item_cross_references_admin_delete (DELETE) |
| item_disputes | item_disputes_admin_write (INSERT); item_disputes_admin_update (UPDATE) |
| item_notes | item_notes_insert_member (INSERT); item_notes_update_author_or_admin (UPDATE) |
| item_supersessions | item_supersessions_admin_write (INSERT) |
| item_timelines | item_timelines_admin_write (INSERT); item_timelines_admin_update (UPDATE) |
| item_workspace_tags | item_workspace_tags_org_insert (INSERT); item_workspace_tags_org_delete (DELETE) |
| moderation_reports | moderation_reports_insert_authenticated (INSERT); moderation_reports_service_role (ALL); moderation_reports_update_admin (UPDATE) |
| monitoring_queue | monitoring_queue_admin_write (INSERT); monitoring_queue_admin_update (UPDATE) |
| notification_preferences | notification_preferences_insert_self (INSERT); notification_preferences_update_self (UPDATE); notification_preferences_delete_self (DELETE); notification_preferences_service_role (ALL) |
| notifications | notifications_update_self_read (UPDATE); notifications_service_role (ALL) |
| org_invitations | org_invitations_service_role (ALL); org_invitations_admin_insert (INSERT); org_invitations_admin_update (UPDATE) |
| org_memberships | membership_write_admin (INSERT); membership_update_admin (UPDATE); membership_delete_admin (DELETE) |
| org_watchlist | org_watchlist_member_insert (INSERT); org_watchlist_member_delete (DELETE); org_watchlist_member_update (UPDATE) |
| organizations | org_write_service (INSERT); org_update_admin (UPDATE) |
| pending_jurisdiction_review | pjr_update_platform_admin (UPDATE) |
| portfolio_members | portfolio_members_org_insert (INSERT); portfolio_members_org_delete (DELETE) |
| portfolios | portfolios_org_insert (INSERT); portfolios_org_update (UPDATE); portfolios_org_delete (DELETE) |
| provisional_sources | provisional_sources_admin_write (INSERT); provisional_sources_admin_update (UPDATE) |
| source_citations | source_citations_admin_write (INSERT) |
| source_tier_opinions | source_tier_opinions_update_platform_admin (UPDATE) |
| source_trust_events | source_trust_events_admin_insert (INSERT) |
| sources | sources_admin_insert (INSERT); sources_admin_update (UPDATE); sources_admin_delete (DELETE) |
| staged_updates | staged_updates_admin_write (INSERT); staged_updates_admin_update (UPDATE) |
| user_item_state | user_item_state_insert (INSERT); user_item_state_update (UPDATE); user_item_state_delete (DELETE) |
| user_watchlist | user_watchlist_insert (INSERT); user_watchlist_delete (DELETE) |
| workspace_item_overrides | overrides_insert_org (INSERT); overrides_update_org (UPDATE); overrides_delete_org (DELETE) |
| workspace_settings | settings_write_admin (INSERT); settings_update_admin (UPDATE) |
| workspace_tags | workspace_tags_org_insert (INSERT); workspace_tags_org_delete (DELETE) |

Out-of-band (4, guarded block): intelligence_summaries.summaries_write_service (INSERT), intelligence_summaries.summaries_update_service (UPDATE), intelligence_changes.changes_write_service (INSERT), sector_contexts.sector_contexts_write_service (INSERT).

Anon table-level write grants, before: INSERT 44 tables, UPDATE 35, DELETE 31 [CONFIRMED: AT1]. After: expected 0, 0, 0 [HYPOTHESIS until applied: the self-check asserts it at apply time and aborts otherwise].

## AT1 cells this closes

Cell id = table.P1.command (anon). 110 anon write cells had an applicable policy. Before, the refusal came from the policy (R:rls 59, R0 31, NX 20 as coded in the register) or from a policy helper; after, every one is refused by the table grant (permission denied for table). The 23 write cells AT1 section 11 records as refused on a policy helper or on the table by accident (code R:grant with an applicable policy) are the ones whose mechanism changes from a side effect to the guard:

community_group_members.P1.INSERT, community_group_members.P1.UPDATE, community_post_signoff_requests.P1.UPDATE, item_assignments.P1.UPDATE, item_notes.P1.UPDATE, item_workspace_tags.P1.INSERT, item_workspace_tags.P1.DELETE, org_memberships.P1.INSERT, org_memberships.P1.UPDATE, org_memberships.P1.DELETE, org_watchlist.P1.INSERT, org_watchlist.P1.UPDATE, org_watchlist.P1.DELETE, portfolio_members.P1.INSERT, portfolio_members.P1.DELETE, portfolios.P1.INSERT, portfolios.P1.UPDATE, portfolios.P1.DELETE, workspace_item_overrides.P1.INSERT, workspace_item_overrides.P1.UPDATE, workspace_item_overrides.P1.DELETE, workspace_tags.P1.INSERT, workspace_tags.P1.DELETE.

(AT1 section 11 counts 24 cells; the 24th is community_post_signoff_requests SELECT, a read cell, outside this lane.)

All 110 cells, by table (INSERT, UPDATE, DELETE as listed):

- admin_action_cooldowns, canonical_source_candidates, community_group_invitations, community_group_members, community_groups, community_thread_entities, community_topic_groups, community_topics, connection_theme_runs, connection_themes, holdings_quality, integrity_flags, intelligence_items, item_assignments, moderation_reports, notification_preferences, org_invitations, org_memberships, org_watchlist, portfolios, sources, user_item_state, workspace_item_overrides (23 tables, 69 cells): INSERT UPDATE DELETE
- community_post_signoff_requests, item_disputes, item_notes, item_timelines, monitoring_queue, provisional_sources, staged_updates, workspace_settings, intelligence_summaries (9 tables, 18 cells): INSERT UPDATE
- community_member_profiles, community_posts: DELETE
- ingest_rejections, pending_jurisdiction_review, source_tier_opinions: UPDATE
- intelligence_changes, item_changelog, item_supersessions, sector_contexts, source_citations, source_trust_events: INSERT
- item_cross_references, item_workspace_tags, portfolio_members, user_watchlist, workspace_tags: INSERT DELETE
- notifications: INSERT DELETE

## Red then green

- `verify()` in the static test returns [] for the real file; the mutation test reports "missing [admin_action_cooldowns.service role full access]" for a dropped ALTER, "extra [ghost.ghost_policy]" for an invented one, "an ALTER POLICY sets TO public", and "the grant hygiene block must run after the last ALTER POLICY" for a reordered file. [CONFIRMED: `node --test`]
- The classification twin rejects a literal true and an anon role test (`auth.role() = 'anon'`) and accepts the deparsed forms pg_policies prints.

## What is NOT done

- Not applied. The migration-proof job applies it on the local stack before any production apply; this lane ran no SQL (no local Postgres in this environment). The self-check SQL, the regex in `pg_temp.sec7_requires_auth` and the message text "permission denied for table" are therefore checked statically and by the shared fixture checker, not executed. [HYPOTHESIS until the proof job runs] [CLOSED: PR 1047]
- The helpers' EXECUTE grants (SEC-4) are not touched. [NOT-WORK: fact, no action]
- SELECT policies and anon SELECT are not touched. [NOT-WORK: fact, no action]
- Not run: the whole suite, the fitness runner, tsc (CI is the gate, ADR-040). [NOT-WORK: build-mode hold, COMMON rule 9]

## Open items

- If the migration-proof job or the apply aborts, the error names the policy; a policy absent live or with different roles is drift between the tree and the database, to be reported, not worked around. [NOT-WORK: fact, no action]
- A column-level anon INSERT or UPDATE grant on any public table (seen nowhere in the tree or in AT1) would abort the self-check with the table named; it is not revoked here. [CLOSED: PR 1047]
