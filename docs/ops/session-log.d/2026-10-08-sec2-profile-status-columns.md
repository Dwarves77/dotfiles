# 2026-10-08, lane SEC-2 (sec2-profile-status-columns): a user cannot self-authorise as a verifier or set their own tier, score or verification badges (migration 367)

## Finding

- [CONFIRMED by code read] `api/community/signoff/[id]/decide/route.ts` and migration 153's RLS treat `profiles.verifier_status = 'active'` as verifier authorisation. After migration 364 (SEC-1, PR 991) an authenticated user still holds column UPDATE on `verifier_status`, so a signed-in user can set it to 'active' on their own row through PostgREST. The same applies to `verification_tier`, `membership_tier` and `contribution_score` (migration 007 RLS gates community reads on the tiers) [CONFIRMED by code read; the live catalog was not queried, rule 5 of the common terms].
- [CONFIRMED by code read] the INSERT path has the same hole: `profiles_self_insert` (165) plus the column INSERT grant 364 leaves on these four. Closed in the same migration.
- Vocabulary [CONFIRMED, migration 075 CHECK]: `none`, `pending`, `active`, `revoked`. There is no `rejected`. The design said "NULL or 'rejected'"; the vocabulary's equivalent is `revoked` (the existing UI offers the request button for exactly `none` and `revoked`), and the column is NOT NULL so NULL is accepted only defensively.

## Accomplished

- `fsi-app/supabase/migrations/367_profiles_status_columns.sql` (header NOT APPLIED; requires 364 applied first and aborts in its preconditions if the 364 function, the enabled trigger, or the column-only grant state is missing).
  - Layer 1: column-level `REVOKE INSERT` and `REVOKE UPDATE` on `verifier_status`, `verification_tier`, `membership_tier`, `contribution_score` from PUBLIC, anon, authenticated (a column revoke bites because 364 already replaced the table-level grant).
  - Layer 2: `CREATE OR REPLACE FUNCTION public.profiles_privilege_guard()`, the same function the 364 trigger already calls (no second function, no second trigger). Adds the four columns to the UPDATE comparison and the INSERT default check ('none', 'unverified', 'free', 0); the 364 logic and the `current_user` sanction idiom are unchanged.
  - `public.request_verification()`: SECURITY DEFINER, `search_path = public, pg_temp`, no parameter, `auth.uid()` only, row locked with FOR UPDATE. From none, NULL or revoked it sets `pending` and returns `pending`; from `pending` it is a NO-OP returning `pending` (idempotent, a double click is not an error); from `active` it is REFUSED with 55000; no `auth.uid()` is 42501; no profile row is P0002. EXECUTE revoked from PUBLIC and anon, granted to authenticated.
  - Self-check in the migration transaction, rolled back by a sentinel exception: as authenticated with a fixture sub, UPDATE of each of the four is refused by column privilege; the RPC moves none to pending, is a no-op from pending, is refused from active, works from revoked; anon and a no-sub authenticated call are refused; an own-row INSERT with `verifier_status = 'active'` is refused and a plain one accepted; with the column grants restored inside the rolled-back block every UPDATE and INSERT is refused by the trigger (message must name `profiles_privilege_guard`) and `is_platform_admin` is still refused by the same function; the RPC still works with the grants restored and the guard on; service_role sets all four; `job_title` still updates; the privilege catalog is asserted afterwards.
- Coordinator ruling (same day, after the first draft): the migration also covers the five badge and timestamp fields of the same lifecycle, `verifier_since`, `linkedin_verified`, `linkedin_identity_verified`, `linkedin_workplace_verified`, `linkedin_verification_checked_at` (nine columns in total): column INSERT and UPDATE revoked, the same guard function extended (UPDATE: any change; INSERT: `verifier_since` and `linkedin_verification_checked_at` must be NULL, the three booleans must not be TRUE), and the self-check attack arrays, the grant-restore block and the catalog loop cover all nine.
- `367_profiles_status_columns.test.mjs` (17 tests, node builtins only; extended to all nine columns).
- `UserProfilePage.tsx`: the verifier tab now calls `supabase.rpc("request_verification")` (new `requestVerification`; local state follows the status the RPC returns, an error is surfaced through the page's existing error banner). `persist()` and `PersonalTab.onSave` take a new `ProfilePatch` type that omits `verifier_status` and `verifier_since`, so a direct write of either is a compile error.
- `api/auth/linkedin/callback/route.ts`: the profile update (which sets `verification_tier = 'linkedin_verified'` and `linkedin_verified`) now goes through `getServiceSupabase()` instead of the user-session client, with a handled redirect (`profile-upsert-failed`) if the service client cannot be built. Without this, applying 367 would make every LinkedIn import fail with 42501.
- `docs/inventories/migrations.md` regenerated with `scripts/inventories/generate-migrations-inventory.mjs --write` (325 rows, one added by this lane; SEC-1 also adds one, so whichever PR merges second regenerates it).

## Read and reused

- Migration 364 as it stands on the PR 991 branch (the function, trigger, `current_user` idiom, sentinel-rollback self-check shape, test conventions): reused by replacing its function in place. Migrations 007, 075, 153, 165 (column origins, vocabulary, RLS), 076 (SECURITY DEFINER plus `GRANT EXECUTE ... TO authenticated` idiom), `getServiceSupabase` in `src/lib/supabase-service.ts` (the one fail-closed service client; no new client built), the migrations inventory generator, the `UserProfilePage` VerifierTab. Writers of the four columns found by `git grep` over `fsi-app/src` and `fsi-app/scripts`: only these two files.

## Red then green

- With the two source files restored to master, `node --test supabase/migrations/367_profiles_status_columns.test.mjs` fails the UserProfilePage test and the LinkedIn callback test (15 pass, 2 fail). With the changes: 17 pass, 0 fail. The SQL assertions are red trivially without the file (ENOENT).
- Not red against old code, stated for honesty: the generic scan "no `.from('profiles')` write payload names the four columns" passed on the old UserProfilePage too, because the old call passed the column through a `persist(patch)` variable; the two file-specific tests carry that case.

## Writers of the nine columns [CONFIRMED by git grep over fsi-app/src, fsi-app/scripts, fsi-app/.discipline and fsi-app/supabase/seed]

| Column | Writer in code | Disposition |
|---|---|---|
| verifier_status | UserProfilePage.tsx (was a direct update to 'pending') | now the `request_verification()` RPC |
| verification_tier | api/auth/linkedin/callback/route.ts | now the service-role client |
| membership_tier | none | none needed |
| contribution_score | none | none needed |
| verifier_since | none (UserProfilePage and a rendering stub only read it) | none needed; `ProfilePatch` also forbids it in the browser |
| linkedin_verified | api/auth/linkedin/callback/route.ts | now the service-role client (already moved by this lane) |
| linkedin_identity_verified | none | none needed |
| linkedin_workplace_verified | none | none needed |
| linkedin_verification_checked_at | none | none needed |

## Decisions

1. Eligible states for the request: `none` (and NULL) and `revoked`. `revoked` is a withdrawn credential and the UI already offers the button there; an admin-adjudicated re-application path (reject back to `none`) would be a separate design.
2. `pending` again is a no-op, not an error: idempotent for double submit.
3. Scope: the four columns of the original design plus the five badge fields added by the coordinator's ruling. The LinkedIn callback is a write-set expansion (a user-session writer of a revoked column, which the brief's "other callers" clause covers; leaving it would break LinkedIn import the moment 367 applies), flagged in the PR.
4. Column revoke, not table-level revoke plus re-grant: 364 already made the grants column-level, and the precondition asserts that.

## NOT done

- Not applied to any database; nothing run against Postgres (none on this machine). The SQL has been read and statically tested, never executed; the in-migration self-check runs at apply time. [HYPOTHESIS] the fixture `INSERT INTO public.profiles (id)` succeeds on the live table (the same assumption 364 makes).
- PR 985 is superseded by PR 992 (merging), and the PROOF-4 attack registry is not on origin/master in this branch, so no entry was added to `scripts/proof/attacks/attacks.json`. OWED to a PROOF-4 follow-up, exact attack spec: id `status-columns-self-authorise-refused`; as role authenticated with a fixture sub on the chain stack, (a) `UPDATE public.profiles SET verifier_status = 'active' WHERE id = <own>` must fail 42501; (b) the same for `verification_tier = 'staff_verified'`, `membership_tier = 'premium'`, `contribution_score = 9999`; (c) `SELECT public.request_verification()` from `none` must return `pending`; (d) from `active` it must fail 55000; (e) `INSERT INTO public.profiles (id, verifier_status) VALUES (<own>, 'active')` must fail 42501; (f) `UPDATE public.profiles SET linkedin_verified = true` (and each of `verifier_since`, `linkedin_identity_verified`, `linkedin_workplace_verified`, `linkedin_verification_checked_at`) must fail 42501.
- No rendering-guard or UI smoke run (CI runs them); `tsc --noEmit` ran locally with no output.

## Open items

- Merge order: 364 must be applied before 367 (the migration aborts otherwise). Whichever of PR 991 and this PR merges second must regenerate `docs/inventories/migrations.md`.
- Apply order for the executor: 364, then 367, then merge this PR (the code depends on 367: the RPC must exist before `UserProfilePage` calls it, and the LinkedIn write needs `SUPABASE_SERVICE_ROLE_KEY`, already used by other routes).

### UX compliance
- Screen/block: Verifier badge tab on /profile (VerifierTab), unchanged layout.
- Primary goal: ask to be verified. Path: open the Verifier badge tab, one tap on "Request verifier sign-off". Primary action: that one button, shown only for status none or revoked; no new control was added.
- Feedback states: the button shows "Submitting..." while the call runs (existing); on success the headline changes to "Application under review" because local status follows the RPC result; on failure the page's existing error banner shows the database message and the button returns. No control, size or spacing changed, so the 44 px target treatment is as before.
