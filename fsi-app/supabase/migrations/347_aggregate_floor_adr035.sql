-- subject: Migration 347 (Lane L15, coordinator brief docs/dispatches/lane-briefs/2026-10-03/brief-l15.md; ADR-035
-- "One aggregate anonymity floor": >= 10 distinct organisations and <= 25% max share, every aggregate in the
-- product). AUTHORED, NOT APPLIED (two-track policy, CLAUDE.md standing rule 3). The coordinator applies this via
-- the Supabase CLI after push and before merge. Requires migration 287 (`sensitive_field_policy`,
-- `publish_aggregate`) and migration 294 (the community_benchmark_responses policy row) already live.
--
-- WHAT THIS DOES. Every `public.sensitive_field_policy` row carried k_min = 5 (spec 08 section 5.1's original
-- floor), and the table's CHECK allowed anything >= 5. ADR-035 raised the floor to 10 and the JS side
-- (src/lib/aggregate/anonymity-floor.mjs FLOOR) already enforces 10, but the database gate
-- `publish_aggregate()` reads `k_min` from this table and so still granted cohorts of 5 to 9. This migration
-- raises the stored floor and makes the table refuse any lower value. `publish_aggregate()` itself is NOT
-- redefined: it reads `pol.k_min`, so the new value takes effect with no function change.
--
-- (1) drop the inline CHECK (k_min >= 5) from migration 287 (Postgres auto-name
--     `sensitive_field_policy_k_min_check`; dropped with IF EXISTS);
-- (2) raise every row below 10 to 10;
-- (3) column default 5 -> 10;
-- (4) add `sensitive_field_policy_k_min_adr035` CHECK (k_min >= 10);
-- (5) self-check: no row below k_min 10 or above max_share_pct 25.
--
-- NOTE: re-applying migrations 287/294 from scratch AFTER this one would fail their own k_min = 5 seeds; apply
-- order is 287, 294, then 347, which is the only supported order.

BEGIN;

ALTER TABLE public.sensitive_field_policy DROP CONSTRAINT IF EXISTS sensitive_field_policy_k_min_check;

UPDATE public.sensitive_field_policy SET k_min = 10 WHERE k_min < 10;

ALTER TABLE public.sensitive_field_policy ALTER COLUMN k_min SET DEFAULT 10;

ALTER TABLE public.sensitive_field_policy
  ADD CONSTRAINT sensitive_field_policy_k_min_adr035 CHECK (k_min >= 10);

DO $$
DECLARE
  n_low_k integer;
  n_high_share integer;
BEGIN
  SELECT count(*) INTO n_low_k FROM public.sensitive_field_policy WHERE k_min < 10;
  SELECT count(*) INTO n_high_share FROM public.sensitive_field_policy WHERE max_share_pct > 25;
  IF n_low_k <> 0 OR n_high_share <> 0 THEN
    RAISE EXCEPTION 'ABORT: migration 347 self-check failed (ADR-035): % row(s) with k_min < 10, % row(s) with max_share_pct > 25', n_low_k, n_high_share;
  END IF;
  RAISE NOTICE 'migration 347 OK: every sensitive_field_policy row has k_min >= 10 and max_share_pct <= 25 (ADR-035)';
END $$;

COMMIT;

-- Rollback: BEGIN;
--   ALTER TABLE public.sensitive_field_policy DROP CONSTRAINT IF EXISTS sensitive_field_policy_k_min_adr035;
--   ALTER TABLE public.sensitive_field_policy ALTER COLUMN k_min SET DEFAULT 5;
--   ALTER TABLE public.sensitive_field_policy ADD CONSTRAINT sensitive_field_policy_k_min_check CHECK (k_min >= 5);
--   (the raised k_min values are left at 10; restoring 5 is a deliberate, separate ruling)
-- COMMIT;
