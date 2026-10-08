-- subject: Recovered 2026-10-07 from supabase_migrations.schema_migrations (ledger version 20260721222204, name next_uncensused_portal_candidates): the EXECUTE grant on next_uncensused_portal_candidates, the one statement of this ledger row that no master migration holds. APPLIED.
-- recovered: 2026-10-07 from supabase_migrations.schema_migrations (lane MIG-HIST-1)
-- ledger version: 20260721222204
-- ledger name: next_uncensused_portal_candidates
-- applied status: APPLIED (a ledger row exists; applied 2026-07-21 per the version timestamp)
-- file number: 241 (assigned by lane MIG-HIST-1: the ledger version carries no file number; the nearest free gap number on master)
-- scope: RESIDUE (only the statement named in the subject line)
-- coverage: The function itself is held by 256_migration_homes_and_vault_capture_key.sql item 5; the stored COMMENT ON FUNCTION is a comment and is not recreated.
-- removal: original file 223_next_uncensused_portal_candidates.sql, added in commit 35ddfe6 (2026-07-21) on branch corpus-integrity/intake-census (PR 370), renumbered to 241, then removed by git rm in commits 1fc17af and 842fd22 on branch lane/finishmig-2026-09-11 after the coordinator ruled it dead weight because 256 (PR 443) already held the function (docs/ops/session-log.md lines 18770 to 18784)
-- body-sha256: 4080f14dcd7f847e0bfb079b97ef4f30107a92c5bc6cdc646e88f59d9d3dea44
-- DO NOT APPLY: production already holds this change under the ledger row above. This file exists so the repo describes the database.
-- ---- recovered statements below, verbatim from schema_migrations.statements ----
grant execute on function public.next_uncensused_portal_candidates(uuid, int, boolean, timestamptz, uuid)
  to authenticated, service_role;
