# 2026-10-09, lane SEC-8 (sec8-read-policy-scope): SELECT policies that were the literal true for {public} now name authenticated and service_role; anon loses table SELECT on those tables

Rows worked: `docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md` line 245 (P1 anon SELECT under literal-true policies) and line 247 (P4 foreign rows). Both carry `[WORK: SEC-8]`; this lane does not edit them (executor applies the tokens at merge).

## Accomplished

1. `fsi-app/supabase/migrations/382_read_policies_name_their_role.sql` (NOT APPLIED; the executor applies it after CI). Narrows 16 policies with `ALTER POLICY ... TO authenticated, service_role` (connection_theme_runs, connection_themes, coverage_gaps, entities, entity_identifiers, entity_refs, entity_scope, monitoring_queue, region_dimension_coverage, regional_data_facts, regions, signposts, source_trust_events, source_verifications, state_cost_facts, theme_briefs), keeps `USING (true)`, revokes SELECT from PUBLIC and anon on the same 16 and grants it to authenticated and service_role. A precondition block (each policy exists, is SELECT, is {public} or already narrowed, is the literal true), an enumeration assertion (no SELECT or ALL policy that applies to anon or public with the literal true predicate remains except the two HELD tables), and a rolled back self-check: catalog legs, anon refused with 42501 "permission denied for table" on every table, authenticated and service_role still read every table, and a second organization built inside the transaction (a member of org B reads zero rows of org A's profile, membership, organization and workspace settings; anon is refused on the org A membership and profile).
2. `fsi-app/scripts/proof/attacks/attacks.json`: new attack `sec8-reference-reads-closed-to-anon` (39 steps) in the PROOF-4 chain-proof suite: 16 anon attacks, 16 authenticated controls, service-role control, cross-organization profile attack and control, anon profiles attack, two catalog counts (both must be 0), and one residue step that reads 2 while sources and source_citations keep their policy. Uses the existing fixtures (`owner_a`, `member_b`); no fixture file changed.

## Read and reused

Read: root `CLAUDE.md`, COMMON and the SEC-8 section of batch2, migration 381 (header, policy-state parser in its test, self-check shape: `sec7_try`/`sec7_expect` reused as `sec8_try`/`sec8_expect`, fixture INSERT statements copied verbatim), 372 and 369 headers (grant hygiene precedent), AT1 sections 1, 2 and 10, `attacks.json` sec7 entries, `attack-engine.mjs` expectation vocabulary, `attacks-manifest.test.mjs`, `route-policy.ts`, and the src readers of each table. Reused: 381's `policyState` (imported from its test) to derive the tree state, 381's self-check pattern, the existing PROOF-4 attack engine and fixtures, the `emission_factors_read` precedent (TO authenticated, USING (true)) for reference data.

## Findings

- [CONFIRMED: policyState over the migration tree below 382, run in this lane] Every SELECT or ALL policy with roles {public} and the literal `true` predicate below 382 is exactly 18 policies: the 17 of AT1 section 10 plus `signposts.signposts_read` (migration 346; 0 rows when AT1 ran, so absent from the AT1 list). After 382's ALTER list the count outside the two HELD tables is 0 (16 before, 0 after).
- [CONFIRMED: grep of docs/decisions and docs/specs for each of the 17 table names with "public" and "anon"] No ADR or spec names any of the 17 tables public; the public routes (`route-policy.ts` PUBLIC_ROUTES) read none of them. The ruling therefore narrows rather than refutes.
- [CONFIRMED: reading `supabase-server.ts`, `ask/route.ts`, `load-detail*.ts`, `notices/route.ts`, `coverage-gaps.ts`, `verification.ts`, `community/*` pages] The readers of the 16 narrowed tables use the service client or the cookie-bound session client (role authenticated); `/api/ask` builds its client with the service role key.
- [CONFIRMED: reading `supabase-server.ts` line 50 and 442, `data.ts` lines 1106 and 1404, migrations 098 and 100] `sources` and `source_citations` have anon-key readers: `fetchSources` (through `getSupabase()`, feeding `fetchSourceData(true)` on /admin), and the SECURITY INVOKER functions `get_source_citation_stats` and `get_research_source_coverage` called through the same anon client. Narrowing their policies today would return zero rows to those paths. They are HELD, named in the migration, the enumeration assertion and the attack's residue step.
- [CONFIRMED: policy text from the tree] AT1 line 247's profiles, org_memberships, organizations, workspace_item_overrides and workspace_settings cells are already organization scoped (profiles_select_own_or_shared_org from 372; membership_read, org_read_members, overrides_read_org, settings_read_org via user_belongs_to_org). AT1 section 1 records one organization in production, so the "1 of 1" cells are the second member of the same organization. Line 247's remaining tables (intelligence_items and children, community_groups, sector_contexts, emission_factors, market_series, published_price_statistics, data_sources) are published platform content, public-by-privacy groups or already authenticated-only reference data behind filtered policies (AT1 codes RA and RD), not per-organization rows.
- [CONFIRMED: file read] The RLS attack script that produced AT1 was a rolled back DO block sent through the Supabase MCP, not a file in the repo; the repo's RLS attack surfaces are the PROOF-4 `attacks.json` suite and each migration's own self-check, which are what this lane extended.

## Red then green

- Red: policyState over the tree below 382 returns 16 literal-true {public} SELECT policies outside the HELD pair (run inline, not saved). Green: after parsing 382's `ALTER POLICY` lines the same count is 0, 16 ALTERs, 0 ALTERs on a policy that is not a literal-true {public} SELECT policy.
- `node --test fsi-app/scripts/proof/attacks/attacks-manifest.test.mjs fsi-app/scripts/proof/attacks/run-attacks.test.mjs`: 38 pass, 0 fail with the new attack (the manifest test validates the schema, the fixture references and that every table the attack names exists in the migration files).
- The SQL itself (self-check and attack steps) runs on the local stack in the PR's migration-proof job (COMMON rule 5 and 9: no database here, CI is the gate).

## Decisions

- Role-named policy keeps `USING (true)` TO authenticated, service_role rather than a membership predicate: the tables are platform reference data with no owner column, the precedent (`emission_factors_read` and three more) uses the same predicate, and a signed-in user who has not created an organization yet must still read regions and entities. The brief's "scoped to authenticated workspace members" is read as authenticated sessions.
- Grant follows policy: the revoke of anon SELECT is part of the migration (ADR-046), so the refusal is a table-GRANT refusal like SEC-7's writes.
- sources and source_citations are HELD because the fix is a src change this lane's write set does not hold.

## NOT done

- Narrowing `sources.sources_read` and `source_citations.source_citations_read`, which needs `fetchSources` in `fsi-app/src/lib/supabase-server.ts` and the callers of `get_source_citation_stats` and `get_research_source_coverage` moved to the service client (or the two functions made SECURITY DEFINER aggregates), then the HELD names removed from 382's enumeration assertion by a follow-up migration and the attack's residue step flipped to 0. [WORK: owed]
- A sibling static test `fsi-app/supabase/migrations/382_read_policies_name_their_role.test.mjs` (the 381 test's tree-derived ALTER list check, header check and fixture-INSERT check through `_lib/fixture-inserts.mjs`): not in this lane's write set. The tree derivation was run inline and the migration carries the same enumeration as an in-database assertion. [WORK: owed]
- The `attacks.json` attack runs in the chain-proof job, which replays the applied set only, so it is red until the executor applies 382; it is run by the executor's chain-proof fire after the apply. [NOT-WORK: executor fires chain proof after the apply, as for the sec7-* attacks]
- AT1 owed legs P2 (org viewer) and P3 (member of another org) cells are TESTS-1's (new fixture files); this lane's only second-organization attack is inside 382's rolled back self-check. [NOT-WORK: scope statement, TESTS-1 owns the P2 and P3 fixtures]

## Open items

- Migration number 382 is taken by this lane; DEAD-1c may also author a migration in the same wave (batch2 item 35), whichever merges second renumbers. [NOT-WORK: scope statement, the migration-number-collision check names it at merge]
