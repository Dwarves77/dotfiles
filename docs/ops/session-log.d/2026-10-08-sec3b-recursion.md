# 2026-10-08, lane SEC-3b-R (sec3b-recursion): migration 370 amended in place, the org_memberships admin policies no longer read their own table (42P17)

## Finding

- Apply of migration 370 aborted (rolled back, no ledger row): self-check leg 3A (an admin UPDATEs `org_memberships.role` to `owner` as role authenticated) raised 42P17 "infinite recursion detected in policy for relation org_memberships" instead of the guard's 42501. Reported by the coordinator.
- [CONFIRMED by reading `fsi-app/supabase/migrations/006_rls_multi_tenant.sql`, the only migration that defines policies on `org_memberships` besides 370] three policies evaluate the actor's role with a subquery on the same table. The recursing policy, quoted:

```
CREATE POLICY "membership_update_admin"
  ON org_memberships FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships m
      WHERE m.org_id = org_memberships.org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
    OR auth.role() = 'service_role'
  );
```

  `membership_write_admin` (INSERT, WITH CHECK) and `membership_delete_admin` (DELETE, USING) carry the identical `EXISTS (SELECT 1 FROM org_memberships m ...)`. Under RLS the planner expands the policies of the relation it is already expanding, and the subquery reads that relation again, so Postgres refuses the statement. `membership_read` (SELECT) is not part of it: it calls `user_belongs_to_org()`, a SECURITY DEFINER function, so it has no subquery. [CONFIRMED: grep of all migrations for `POLICY ... ON org_memberships`: 006 and nothing else.]
- Why it never showed: every app writer of `org_memberships` uses the service-role client (BYPASSRLS) or a SECURITY DEFINER function (`create_org_for_self`, `accept_invitation`), so no user-session statement ever evaluated these policies. Migration 370's self-check was the first statement to do so.

## Accomplished (migration 370 amended in place; it is unapplied, no ledger row)

- `public.user_org_role(p_org uuid) returns text`: SECURITY DEFINER, `search_path = public, pg_temp`, STABLE, reads the caller's role in that org through `auth.uid()`; `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO authenticated, service_role`. Same shape as `user_belongs_to_org`, the pattern `membership_read` already uses.
- `ALTER POLICY` on `membership_write_admin` (WITH CHECK), `membership_update_admin` (USING) and `membership_delete_admin` (USING): `public.user_org_role(org_id) IN ('owner', 'admin') OR (select auth.role()) = 'service_role'`. Semantics unchanged (the caller is an owner or admin of that row's org, or the service role); no policy on `org_memberships` reads `org_memberships` any more.
- Preconditions now also require the three policies to exist by name. Header gained a "THE RECURSION FIX" block quoting the cause; the first line (subject) names it.
- Self-check: three new legs before 3A, "recursion class", an admin INSERT, UPDATE (`SET role = role`) and DELETE as role authenticated each must return `ok:1` and must not match `err:42P17%`. Leg 3A still requires `err:42501:%org_membership_role_guard%`, so it can only pass by reaching the guard; the control "the owner grants owner" still requires `ok:1` (an owner's legitimate promotion). After the rolled-back block, two catalog assertions fail the apply if any policy on `org_memberships` names `org_memberships` or if the three admin policies do not all use `user_org_role`.
- `370_privilege_table_policies.test.mjs`: item 3's "policies stay" assertion now forbids only DROP; the item 6 policy list test reads the viewer ALTERs by content (the three new ALTERs are not viewer ALTERs); five new `recursion:` tests (29 tests in all).
- `docs/inventories/migrations.md` regenerated (370's subject line changed).

## Read and reused

- Read: the coordinator message, `006_rls_multi_tenant.sql` (policies and `user_belongs_to_org`), 046 (the community recursion fix: SECURITY DEFINER helpers called from policies, the precedent), 191, 259, 249, 043 (no other policy on `org_memberships`), the whole of 370 and its test. Reused: the `user_belongs_to_org` / `user_is_group_admin` helper pattern from 006 and 046; `ALTER POLICY` as in 259 and 370 item 6; the existing `sec3b_try` and `sec3b_expect` self-check helpers.

## Red then green

- `node --test supabase/migrations/370_privilege_table_policies.test.mjs` with the SQL file restored to master's 370: 25 pass, 4 fail (the ALTER of the three policies, the `user_org_role` definition, the final-policy-state scan, the self-check recursion legs). With the amendment: 29 of 29 pass.
- Not red-then-green at the database: nothing here runs Postgres (none on this machine). The 42P17 itself was observed by the executor at apply; the fix is proven here statically and by the self-check at the next apply. [HYPOTHESIS until the apply] that the three `ALTER POLICY` statements clear the recursion for leg 3A; the self-check is written to fail the apply otherwise.

## The class, scanned (read-only; decision-ready, NOT fixed here)

A scan of every `CREATE POLICY ... ON <table>` in the migration tree whose body reads the same table in a `FROM` or `JOIN` found, besides the three fixed here: `community_group_members_insert_admin` and `community_group_members_update_self_prefs` (migration 029) and `notifications_update_self_read` (migration 032). Migration 046 replaced the select and delete policies of `community_group_members` with SECURITY DEFINER helpers but nothing in the tree replaces these three, and `user_profiles_update_self` (027) belongs to a table migration 075 consolidated away. [HYPOTHESIS, not executed] each of the three would raise 42P17 for a user-session statement the same way; the community routes use the cookie-bound client, so the exposure is live if those policies are as defined. The fix has the shape used here (a SECURITY DEFINER predicate, `user_is_group_admin` already exists for the group-member case). Left for the coordinator to route; the new static test covers `org_memberships` only.

## Decisions

1. Amend 370 in place rather than add 371: it is unapplied and has no ledger row (coordinator ruling), so the policies are corrected in the same migration that first exercises them.
2. `LIMIT 1` in `user_org_role`: `(org_id, user_id)` is unique, so it is belt and braces for the scalar subquery contract.
3. Anon: the three policies now call a function anon cannot execute, so an anon write on `org_memberships` is refused with 42501 "permission denied for function" instead of by the old predicate; still a refusal, and SEC-3a closes anon table writes anyway.

## NOT done

- Nothing applied, nothing executed against Postgres. The three same-class community policies above. F70 is not on master at the time of writing; `user_org_role` follows the stated shape (REVOKE FROM PUBLIC, GRANT authenticated, search_path pinned to public, pg_temp) so it should satisfy it.

### UX compliance
- No `.tsx` or `.css` file changed in this lane; there is no screen, block or control to report.
