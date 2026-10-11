# 2026-10-10, lane SEC-9 (sec9-dead-anon-grants): anon SELECT grants follow policy; 49 relations with no anon-or-public policy lose the grant

Rows worked: batch2 SEC-9 section (no finding line carries `[WORK: SEC-9]` on origin/master: `git grep -n "\[WORK: SEC-9\]" origin/master -- docs/audits docs/ops/session-log.d` outside the dispo1 table returned nothing, so there is no `file:line` row to close). The count of 92 is the coordinator's live read after 382 (batch2); this lane reproduced it from the tree.

## Accomplished

1. `fsi-app/supabase/migrations/384_dead_anon_select_grants.sql` (NOT APPLIED; the executor applies it before merge; the number is 384 because 383 is applied). Header lists all 92 tables with the policy that admits anon (kept) or "no anon policy" (revoked). Part 1 precondition (every listed relation exists; no revoked one has an anon-or-public SELECT/ALL policy; every kept one has one). Part 2 `REVOKE SELECT ... FROM PUBLIC, anon` and `GRANT SELECT ... TO authenticated, service_role` for the 49 revoked (44 tables, 5 views), 382's form. Part 3 enumeration assertion: no public relation anon can SELECT lacks an anon-or-public policy, and the set anon can SELECT equals the explicit kept set (43). Self-check in a block that always rolls back: catalog legs, then every revoked relation attacked as anon (42501), service_role and authenticated (ok), every by-design table read as anon (ok), every kept authenticated-only table read as anon (zero rows or 42501).
2. `fsi-app/supabase/migrations/384_dead_anon_select_grants.test.mjs`: static proof. Re-derives the anon SELECT grant state of the migration tree below 384 (CREATE, DROP, RENAME, GRANT, REVOKE in file order), classifies against `policyState` (381), and requires the three arrays in the migration to equal the derivation.
3. `fsi-app/scripts/proof/attacks/attacks.json`: attack `sec9-anon-select-grants-have-an-anon-policy` (95 steps) in the PROOF-4 chain-proof suite: three catalog counts (anon grant without an anon policy; revoked set holding anon SELECT; anon-readable set outside the kept set), 49 anon refusals, 30 kept authenticated-only anon reads (zero rows or 42501), 13 by-design anon controls.

## Read and reused

Read: root `CLAUDE.md`, COMMON and the SEC-9 section and batch 2b ordering note of batch2, migration 382 in full (reused: the REVOKE/GRANT-back form, the pg_temp try/expect helpers renamed `sec9_*`, the rolled-back self-check shape, the enumeration assertion), the SEC-8 log, the 381 test (`policyState`, `REQUIRES_AUTH`, imported), `_lib/applied-status.mjs` (`headerProblems`, imported), `_lib/fixture-inserts.mjs` (`stripSql`, imported), AT1 (`docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md` lines 14, 152, 195 and the cell legend), `docs/inventories/out-of-band-objects.md`, `attacks.json` sec7 and sec8 entries, `attack-engine.mjs` expectation vocabulary, `supabase-server.ts` readers that use the anon-key client. Nothing new was built where a mechanism existed; the only new code is the grant-state parser (`anonSelectState`), because no module derived grants from the tree.

## Findings

- [CONFIRMED: `anonSelectState` over the migration tree below 384, run in this lane] 92 public relations (87 tables, 5 views) hold an anon SELECT grant; the coordinator's live count after 382 is the same 92.
- [CONFIRMED: classification run in this lane] 13 relations have a policy an unauthenticated request can satisfy (published intelligence items and the child tables whose policy is EXISTS over a published item; public community groups with posts and thread entities): kept. 30 have an anon-or-public policy whose predicate needs an authenticated identity (28 from the tree, plus the two out-of-band ones below): kept. 49 have no anon-or-public SELECT policy: revoked.
- [CONFIRMED: AT1 lines 152 and 195, probed live; `docs/inventories/out-of-band-objects.md` lists the policies] intelligence_summaries (`summaries_read_authenticated`) and sector_contexts (`sector_contexts_read_authenticated`) carry live-only SELECT policies the tree does not hold; AT1 reads anon S=R0/pp1 on both, so a policy applies to anon and answers zero rows. They are kept, not revoked, and the migration's precondition re-checks them live.
- [CONFIRMED: AT1 cross-check run in this lane, every classified table compared with its AT1 anon policy count] The only disagreements with the tree are those two tables and admin_action_cooldowns (AT1 pp1; migration 381 narrowed its policy to authenticated, service_role after AT1, so the tree is right and AT1 is stale on that cell).
- [CONFIRMED: reading `supabase-server.ts`] Two anon-key client reads sit on revoked tables: `fetchPriceStatsByItemIds` (published_price_statistics) and the sector_contexts read in `fetchDashboardData`. Both already received zero rows; after 384 they receive 42501. The first logs the error and returns an empty map, the second reads `data || []`, so the rendered result is unchanged.
- [HYPOTHESIS: Postgres checks relation privileges for tables inside a policy subquery as the querying role; not run here, no database] This is why community_group_members (an authenticated-only policy) stays granted: the kept community_posts and community_thread_entities policies subquery it, and revoking it would turn anon's answer on those tables into 42501. The migration's self-check legs read every kept table as anon and fail the apply if any of the 13 by-design ones is refused.
- [CONFIRMED: test over the tree policies] No kept policy reads a revoked table in its predicate.

## Red then green

- Red: before the migration file existed (empty placeholder), the new test file reported the header, array-equality, header-lists-every-table, self-check and attack-presence assertions failing (seen in the first generator run). Green: `node --test fsi-app/supabase/migrations/384_dead_anon_select_grants.test.mjs` 35 pass (18 of this lane's plus the 17 of the 381 test it imports), with the red mutation tests (dropped array entry, extra entry, a by-design table moved to the revoke list, a new ungoverned grant, a dead table reclassified) all reporting. `attacks-manifest.test.mjs`, `run-attacks.test.mjs`, `attack-engine.test.mjs` pass with the new attack (52 pass).
- The SQL itself (self-check and attack steps) runs in the PR's migration-proof and chain-proof jobs (COMMON rules 5 and 9: no database here, CI is the gate).

## Decisions

- Rule of keeping: a relation keeps anon SELECT iff `pg_policies` holds a SELECT or ALL policy whose roles include anon or the implicit public (the brief's rule). Of those, 13 are satisfiable by anon (by design) and 30 are authenticated-only predicates; the migration asserts the distinction in its self-check (rows for the 13, zero rows or 42501 for the 30).
- No policy is changed here: grant follows policy only. Narrowing the 30 policies is a rewrite (SEC-7 form) with a dependency constraint, recorded below.

## NOT done

- Narrow the 30 kept authenticated-only tables: `ALTER POLICY ... TO authenticated, service_role` and then revoke anon, except community_group_members, which the kept community_posts and community_thread_entities policies subquery (the closure is computed by the new test). The list is the `v_authonly` array in migration 384. [WORK: owed]
- Point `fetchPriceStatsByItemIds` (published_price_statistics) and the sector_contexts read in `fetchDashboardData` at the service or session client, so they stop asking the anon-key client for authenticated-only data; both are `fsi-app/src/lib/supabase-server.ts`, outside this lane's write set. [WORK: owed]
- The executor applies 384 (NOT APPLIED header) and then fires chain proof, where the new attack runs; it is red until the apply. [NOT-WORK: executor applies after CI, as for 381 and 382]

## Open items

- Migration number 384 is taken by this lane; a later lane that authors a migration in the same wave renumbers at merge. [NOT-WORK: scope statement, the migration-number-collision check names it at merge]
