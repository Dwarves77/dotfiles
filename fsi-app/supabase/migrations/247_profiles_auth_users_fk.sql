-- subject: Recovered 2026-10-07 from supabase_migrations.schema_migrations (ledger version 20260802153524, name 247_profiles_auth_users_fk): the foreign key from profiles.id to auth.users.id (audit D3, 2026-08-02). APPLIED.
-- recovered: 2026-10-07 from supabase_migrations.schema_migrations (lane MIG-HIST-1)
-- ledger version: 20260802153524
-- ledger name: 247_profiles_auth_users_fk
-- applied status: APPLIED (a ledger row exists; applied 2026-08-02 per the version timestamp)
-- file number: 247 (assigned by lane MIG-HIST-1: the ledger version carries no file number; the nearest free gap number on master)
-- scope: FULL (every stored statement of the ledger row)
-- coverage: No master migration holds this constraint.
-- removal: never in git on any ref (no trace in git or docs beyond the ledger); no removal commit exists. Applied live 2026-08-02 (direct apply, [HYPOTHESIS] never written down)
-- body-sha256: e11be3b6dbdd32f38f4e36ebb1a4d6410dd61b93dd1f6161f2e8f45c4d3e3c6b
-- DO NOT APPLY: production already holds this change under the ledger row above. This file exists so the repo describes the database.
-- ---- recovered statements below, verbatim from schema_migrations.statements ----
-- 247: enforce the profiles.id == auth.users.id invariant (audit D3, 2026-08-02).
-- user_item_state RLS (mig 239) predicates auth.uid() = user_id against a
-- profiles(id) FK; nothing structurally guaranteed profiles.id lives in the
-- auth id space. Verified pre-apply: 2/2 profiles match auth.users, 0 orphans.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_auth_users_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT profiles_id_auth_users_fkey ON public.profiles IS
  'profiles.id must be an auth.users id (audit D3, 2026-08-02). The auth.uid() = user_id RLS policies on user_item_state and siblings are only correct while the two id spaces coincide; this makes that structural.';
