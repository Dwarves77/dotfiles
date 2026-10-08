-- subject: Recovered 2026-10-07 from supabase_migrations.schema_migrations (ledger version 20260801131707, name enable_pg_net_for_capture_worker): the pg_net extension that the capture-worker edge function invocation needs. APPLIED.
-- recovered: 2026-10-07 from supabase_migrations.schema_migrations (lane MIG-HIST-1)
-- ledger version: 20260801131707
-- ledger name: enable_pg_net_for_capture_worker
-- applied status: APPLIED (a ledger row exists; applied 2026-08-01 per the version timestamp)
-- file number: 242 (assigned by lane MIG-HIST-1: the ledger version carries no file number; the nearest free gap number on master)
-- scope: FULL (every stored statement of the ledger row)
-- coverage: No master migration creates the extension (searched all master migrations for CREATE EXTENSION pg_net).
-- removal: never in git on any ref: a search of every ref for this name returns only the PROOF-1 commit 83e85a37 (applied-migrations.json); no removal commit exists. Applied live 2026-08-01 (db-layer census 2026-08-11, Finding 4, lists pg_net as installed)
-- body-sha256: 65a347c1cac13dac52e6b2f5c2ca4c2471a0750355fbdc2d7cc2f1f02388a5f3
-- DO NOT APPLY: production already holds this change under the ledger row above. This file exists so the repo describes the database.
-- ---- recovered statements below, verbatim from schema_migrations.statements ----

-- Enables pg_net so DB-only executor sessions can invoke the capture-worker edge function via SQL.
-- Part of the operator-approved capture-worker build, 2026-08-01.
CREATE EXTENSION IF NOT EXISTS pg_net;

