-- Migration 170 (Wave-α Track B8) — ledger repair: record the 15 applied-but-unledgered migrations
-- (107–134 band) in supabase_migrations.schema_migrations
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW. Authored, apply via the DDL protocol — DO NOT apply inline.
-- (Writes only to the migration ledger, mirroring the 136–157 repair; guarded + idempotent.)
--
-- WHY (master-gap-register P2 records/state; DB-3 F1; X.3 verified object-by-object):
--   15 migrations in the 107–134 band are APPLIED (their schema objects exist live) but ABSENT from
--   supabase_migrations.schema_migrations. The 2026-07-07 window repaired the 136–157 band only; the
--   107–134 band was never repaired. Live schema ↔ ledger diverge, so a fresh-DB replay or any ledger
--   audit reads these as un-run.
--
-- VERIFICATION of the exact 15 (read-only diff of schema_migrations vs disk, 2026-07-11):
--   disk 107–134 (excl. 127, which never existed): 107,108,109,110,111,112,113,114,115,116,117,118,
--     128,129,130,131,132,133,134
--   ledger already has:                             113,114,      116,117,      119,120,121,122,123,
--     124,125,126
--   applied-but-unledgered (disk minus ledger, in-band) = EXACTLY:
--     107, 108, 109, 110, 111, 112, 115, 118, 128, 129, 130, 131, 132, 133, 134   (15)
--   (Each confirmed applied by live object existence in X.3 / DB-3 F1 — e.g. 107 trajectory_points column,
--    108 get_market_intel_items, 112 provenance_status, 115 the 3 provenance triggers, 118
--    stamp_prov_origin_trg + intelligence_items_reconciler_update, 128–134 slot rows + the 3 routing RPCs.)
--
-- PATTERN: mirrors the 136–157 repair exactly — insert (version, name) with `statements = NULL` (the same
--   shape the 136-band ledger rows carry live: statements NULL, name set), guarded by NOT EXISTS so the
--   apply is idempotent and never disturbs a row that is already present. It records the LEDGER FACT; it
--   does NOT re-run any DDL (the objects already exist).
--
-- POST-APPLY PROOF (see track-b-proofs.md B8):
--   SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (the 15) ORDER BY version;
--   -> all 15 present. Re-running this migration is a no-op (idempotent).
-- Reversible: rollbacks/170_ledger_repair_107_134_rollback.sql (deletes exactly the 15 ledger rows).

BEGIN;

DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('107', 'intelligence_items_trajectory_points'),
      ('108', 'market_intel_rpc_trajectory_payload'),
      ('109', 'region_dimension_coverage'),
      ('110', 'callout_columns_and_rpc_extension'),
      ('111', 'workspace_overrides_dismissed_at'),
      ('112', 'provenance_invariant_schema'),
      ('115', 'set_provenance_status_trigger'),
      ('118', 'provenance_flip_binding'),
      ('128', 'research_finding_slot_ledger_fix'),
      ('129', 'market_required_slots'),
      ('130', 'technology_required_slots'),
      ('131', 'operations_required_slots'),
      ('132', 'operations_slot_gap_satisfiable'),
      ('133', 'get_technology_items_rpc'),
      ('134', 'fix_research_technology_rpc_columns')
    ) AS t(version, name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = v.version
    ) THEN
      INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
      VALUES (v.version, v.name, NULL);
      RAISE NOTICE 'ledgered version % (%)', v.version, v.name;
    ELSE
      RAISE NOTICE 'version % already ledgered — skipped', v.version;
    END IF;
  END LOOP;
END
$$;

COMMIT;
