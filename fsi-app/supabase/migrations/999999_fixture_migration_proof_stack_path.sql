-- subject: FIXTURE for the migration-proof stack path (lane MIG-CI, 2026-10-08). THROWAWAY: it exists on this branch for one commit so the migration-proof job can be seen going red on a CHECK violation, and is removed in the next commit. NOT APPLIED, and never to be applied anywhere.
-- status: NOT APPLIED (fixture)
select 1;
DO $$
BEGIN
  CREATE TEMP TABLE migration_proof_fixture (kind text CHECK (kind IN ('a', 'b'))) ON COMMIT DROP;
  INSERT INTO migration_proof_fixture VALUES ('c');
END $$;
