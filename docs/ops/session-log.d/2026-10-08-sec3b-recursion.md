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

## The class, scanned and fixed (coordinator grant: same PR, same migration)

A scan of every `CREATE POLICY ... ON <table>` in the migration tree whose body reads the same table in a `FROM` or `JOIN` found, besides the three fixed above: `community_group_members_insert_admin` and `community_group_members_update_self_prefs` (029), `notifications_update_self_read` (032), and `user_profiles_update_self` (027; the table was consolidated away by 075). Migration 046 had already moved the SELECT and DELETE policies of `community_group_members` onto SECURITY DEFINER helpers; nothing in the tree replaces the two below.

- Fixed in 370: `community_group_members_insert_admin`, original: `FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM community_group_members m2 WHERE m2.group_id = community_group_members.group_id AND m2.user_id = auth.uid() AND m2.role = 'admin'))`. Now `WITH CHECK (public.user_group_role(group_id) = 'admin')`.
- Fixed in 370: `community_group_members_update_self_prefs`, original: `FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND role = (SELECT m.role FROM community_group_members m WHERE m.group_id = community_group_members.group_id AND m.user_id = auth.uid()))`. Now `WITH CHECK (user_id = auth.uid() AND role = public.user_group_role(group_id))`; USING unchanged.
- Neither reduces to an existing predicate with the same meaning: `user_is_group_admin` is true for moderator as well as admin (it would widen the insert policy), `user_is_group_member` returns a boolean, and the update policy compares the row's role to the caller's role. So the lane added `public.user_group_role(p_group uuid) returns text` in 370, the same shape as `user_org_role` and `user_is_group_member` (SECURITY DEFINER, pinned search_path, REVOKE FROM PUBLIC, GRANT authenticated and service_role). Semantics unchanged; this is the one place the brief's "existing predicate" wording was not literally possible, stated here.
- Self-check, one leg per policy as the intended role (`ok:1`, rejecting `err:42P17%`): a group admin (the group owner, who holds role admin) inserts a member; a member updates their own `starred`. Plus three refusals that must stay refusals and must not be recursion: a plain member inserting a member, a moderator inserting a member (moderator is not admin for this policy), a member raising their own role to admin through the preferences policy (`err:42501`). The catalog assertion now also fails the apply if any policy on `community_group_members` names `community_group_members`.
- STOPPED, not fixed: `notifications_update_self_read` (032). Original, quoted: `FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND kind = (SELECT n.kind FROM notifications n WHERE n.id = notifications.id) AND payload = (SELECT n.payload FROM notifications n WHERE n.id = notifications.id) AND created_at = (SELECT n.created_at FROM notifications n WHERE n.id = notifications.id))`. It does not reduce to an own-row condition: the three subqueries lock `kind`, `payload` and `created_at` to their STORED values (the file comment: "WITH CHECK locks user_id, kind, payload, and created_at to their stored values so users cannot mutate notification content"), which a policy can only express by reading the stored row. Replacing it with `user_id = auth.uid()` alone would drop that lock (a user could rewrite their own notification content). Options for the coordinator, none applied: (a) a SECURITY DEFINER predicate `notification_content_unchanged(id, kind, payload, created_at)` that compares to the stored row (semantics kept, same pattern); (b) enforce the lock with column privileges (`GRANT UPDATE (read_at) ON notifications TO authenticated`, the 364 pattern) and reduce the policy to `user_id = auth.uid()` (semantics kept at the grant layer, plus a guard trigger). The catalog assertion deliberately does not cover `notifications` until this is ruled. [HYPOTHESIS, not executed] that the policy raises 42P17 for a user-session statement; the notification routes' client use was not checked.
- `371_definer_hygiene.sql` (coordinator grant): `user_org_role` and `user_group_role` added to class D with `user_can_write_in_org` (they are used only in INSERT, UPDATE and DELETE policies, where an anon write is refused either way); its header count line notes the two additions (60 definers); `371_definer_hygiene.test.mjs` lists both in `CLASS_D` and asserts 48 callable definers (was 46).
- Tests: `370_privilege_table_policies.test.mjs` 29 to 33 (policy re-pointing and original-meaning test, `user_group_role` shape test, self-check legs test; the 42P17 leg count is now 8). Red then green: with the 370 and 371 SQL restored to the previous commit, 6 fail (the new community tests, the self-check test, and 371's class D and completeness tests); with the changes, 55 of 55 across 370 and 371.

## Decisions

1. Amend 370 in place rather than add 371: it is unapplied and has no ledger row (coordinator ruling), so the policies are corrected in the same migration that first exercises them.
2. `LIMIT 1` in `user_org_role`: `(org_id, user_id)` is unique, so it is belt and braces for the scalar subquery contract.
3. Anon: the three policies now call a function anon cannot execute, so an anon write on `org_memberships` is refused with 42501 "permission denied for function" instead of by the old predicate; still a refusal, and SEC-3a closes anon table writes anyway.

## NOT done

- Nothing applied, nothing executed against Postgres. `notifications_update_self_read` (above). F70 is not on master at the time of writing; `user_org_role` follows the stated shape (REVOKE FROM PUBLIC, GRANT authenticated, search_path pinned to public, pg_temp) so it should satisfy it.

### UX compliance
- No `.tsx` or `.css` file changed in this lane; there is no screen, block or control to report.
