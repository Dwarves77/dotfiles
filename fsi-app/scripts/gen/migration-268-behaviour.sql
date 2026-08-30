-- Behavioural proof for migration 268 (market_series), run against a throwaway cluster — same posture
-- as migration-258-behaviour.sql: every block asserts a constraint BITES. A block that silently succeeds
-- where it should fail is the failure; a CHECK that does not reject is decoration.
--
-- Uses 'eurostat' as source_key for the VALID-row cases below — an already-registered, licence-clear
-- public.data_sources row (migration 258's seed), chosen ONLY to prove the FK/CHECK machinery, not
-- because market_series' real EU Weekly Oil Bulletin producer uses it (that producer's own source_key,
-- 'ec_weekly_oil_bulletin', is NOT yet registered — see migration 268's own header and
-- src/lib/market/series-registry.mjs).

\set ON_ERROR_STOP off

-- ── 1. A valid, fully-enveloped row inserts. ─────────────────────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.market_series
    (series_key, label, value_numeric, unit, currency, derivation, origin_class,
     source_key, source_ref, n_observations, as_at_date, reference_period)
  VALUES
    ('eu-oil-bulletin:automotive-diesel', 'Automotive gas oil / diesel (EU average, before taxes)',
     1493.60, 'EUR/1000L', 'EUR', 'observed', 'official',
     'eurostat', 'behaviour-proof row 1', 24, DATE '2026-08-24', '2026-08-24');
  RAISE NOTICE 'PASS 1: valid market_series row accepted';
END $$;

-- ── 2. UNIQUE(series_key, reference_period): a second row for the SAME pair is rejected. ────────────
DO $$
BEGIN
  INSERT INTO public.market_series
    (series_key, label, value_numeric, unit, currency, derivation, origin_class,
     source_key, source_ref, as_at_date, reference_period)
  VALUES
    ('eu-oil-bulletin:automotive-diesel', 'Automotive gas oil / diesel (EU average, before taxes)',
     1500.00, 'EUR/1000L', 'EUR', 'observed', 'official',
     'eurostat', 'behaviour-proof row 2 (duplicate key)', DATE '2026-08-24', '2026-08-24');
  RAISE EXCEPTION 'FAIL 2: duplicate (series_key, reference_period) was ACCEPTED';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS 2: duplicate (series_key, reference_period) rejected';
END $$;

-- ── 3. The SAME series_key with a DIFFERENT reference_period is a distinct, valid row. ──────────────
DO $$
BEGIN
  INSERT INTO public.market_series
    (series_key, label, value_numeric, unit, currency, derivation, origin_class,
     source_key, source_ref, as_at_date, reference_period)
  VALUES
    ('eu-oil-bulletin:automotive-diesel', 'Automotive gas oil / diesel (EU average, before taxes)',
     1487.10, 'EUR/1000L', 'EUR', 'observed', 'official',
     'eurostat', 'behaviour-proof row 3 (different week)', DATE '2026-08-17', '2026-08-17');
  RAISE NOTICE 'PASS 3: same series_key, different reference_period accepted (the key is the PAIR)';
END $$;

-- ── 4. origin_class CHECK bites on an invalid value. ─────────────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.market_series
    (series_key, label, origin_class, reference_period)
  VALUES ('eu-oil-bulletin:eurosuper-95', 'Euro-Super 95', 'not-a-real-value', '2026-08-24');
  RAISE EXCEPTION 'FAIL 4: invalid origin_class was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 4: invalid origin_class rejected';
END $$;

-- ── 5. derivation CHECK bites on an invalid value. ───────────────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.market_series
    (series_key, label, derivation, reference_period)
  VALUES ('eu-oil-bulletin:eurosuper-95', 'Euro-Super 95', 'not-a-real-value', '2026-08-24');
  RAISE EXCEPTION 'FAIL 5: invalid derivation was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 5: invalid derivation rejected';
END $$;

-- ── 6. series_key format CHECK bites on an upper-case / malformed key. ───────────────────────────────
DO $$
BEGIN
  INSERT INTO public.market_series (series_key, label, reference_period)
  VALUES ('EU-Oil-Bulletin:Diesel!', 'bad key', '2026-08-24');
  RAISE EXCEPTION 'FAIL 6: malformed series_key was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 6: malformed series_key rejected';
END $$;

-- ── 7. n_observations positivity CHECK bites on zero/negative. ──────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.market_series (series_key, label, n_observations, reference_period)
  VALUES ('eu-oil-bulletin:eurosuper-95', 'Euro-Super 95', 0, '2026-08-31');
  RAISE EXCEPTION 'FAIL 7: n_observations=0 was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 7: non-positive n_observations rejected';
END $$;

-- ── 8. source_key FK bites on an unregistered source (the fail-closed licence gate). ────────────────
DO $$
BEGIN
  INSERT INTO public.market_series (series_key, label, source_key, reference_period)
  VALUES ('eu-oil-bulletin:eurosuper-95', 'Euro-Super 95', 'ec_weekly_oil_bulletin', '2026-08-31');
  RAISE EXCEPTION 'FAIL 8: unregistered source_key was ACCEPTED — the licence gate did not fail closed';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'PASS 8: unregistered source_key (ec_weekly_oil_bulletin) rejected by the FK — this is the ' ||
    'EXPECTED state until an operator registers it in public.data_sources (see migration 268''s header)';
END $$;

-- ── 9. series_key/label NOT NULL — a row with neither identity column is refused. ───────────────────
DO $$
BEGIN
  INSERT INTO public.market_series (reference_period) VALUES ('2026-09-07');
  RAISE EXCEPTION 'FAIL 9: a row with no series_key/label was ACCEPTED';
EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS 9: missing series_key/label rejected';
END $$;

-- ── 10. Row count sanity: exactly 2 rows landed (the two PASS-1/PASS-3 inserts). ────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.market_series WHERE series_key = 'eu-oil-bulletin:automotive-diesel';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 10: expected 2 automotive-diesel rows (two distinct weeks), found %', n; END IF;
  RAISE NOTICE 'PASS 10: exactly the 2 expected rows landed';
END $$;
