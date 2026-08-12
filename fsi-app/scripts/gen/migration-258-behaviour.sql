-- Behavioural proof for migration 258, run against a throwaway cluster.
-- Every block asserts a constraint BITES. A block that silently succeeds where it should fail is the
-- failure: a CHECK that does not reject is decoration, and decoration is worse than nothing because it
-- is cited in review as though it were enforcement.

\set ON_ERROR_STOP off

DO $$
DECLARE ok boolean;
BEGIN
  -- ── 1. A valid modal factor inserts. ───────────────────────────────────────────────────────────────
  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction,
     quantity_basis, wtt_co2e, ttw_co2e, wtw_co2e, gwp_basis,
     source_key, derivation, origin_class, pedigree, method_version, as_at_date, valid_from)
  VALUES
    ('modal_default','modal','road','artic_33_44t','diesel','GB',
     'tonne_km', 0.020, 0.080, 0.100, 'AR6_GWP100',
     'desnz_ghg_factors','statutory_fixed','official', 3, 'v1', DATE '2026-06-01', DATE '2026-01-01');
  RAISE NOTICE 'PASS 1: valid modal factor accepted';
END $$;

-- ── 2. Scope: a modal factor may not carry an operator. ──────────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction, operator_key,
     quantity_basis, wtw_co2e, gwp_basis, source_key, derivation, origin_class, pedigree,
     method_version, as_at_date, valid_from)
  VALUES ('modal_default','modal','road','artic','diesel','GB','MAERSK',
     'tonne_km', 0.1, 'AR6_GWP100','desnz_ghg_factors','statutory_fixed','official',3,'v1',
     DATE '2026-06-01', DATE '2026-01-01');
  RAISE EXCEPTION 'FAIL 2: modal factor with operator_key was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 2: modal + operator_key rejected';
END $$;

-- ── 3. Pedigree floor: a modal default may not claim primary-grade pedigree. ─────────────────────────
DO $$
BEGIN
  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction,
     quantity_basis, wtw_co2e, gwp_basis, source_key, derivation, origin_class, pedigree,
     method_version, as_at_date, valid_from)
  VALUES ('modal_default','modal','road','artic','diesel','GB',
     'tonne_km', 0.1, 'AR6_GWP100','desnz_ghg_factors','statutory_fixed','official', 1, 'v1',
     DATE '2026-06-01', DATE '2026-01-01');
  RAISE EXCEPTION 'FAIL 3: modal_default with pedigree 1 was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 3: pedigree floor rejected a flattering default';
END $$;

-- ── 4. WTW decomposition must add up. ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction,
     quantity_basis, wtt_co2e, ttw_co2e, wtw_co2e, gwp_basis, source_key, derivation, origin_class,
     pedigree, method_version, as_at_date, valid_from)
  VALUES ('modal_default','modal','road','artic','diesel','GB',
     'tonne_km', 0.02, 0.08, 0.500, 'AR6_GWP100','desnz_ghg_factors','statutory_fixed','official',3,'v1',
     DATE '2026-06-01', DATE '2026-01-01');
  RAISE EXCEPTION 'FAIL 4: inconsistent WTT+TTW vs WTW was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 4: WTW decomposition mismatch rejected';
END $$;

-- ── 5. `multimodal` is a corridor value, never a factor value. ───────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction,
     quantity_basis, wtw_co2e, gwp_basis, source_key, derivation, origin_class, pedigree,
     method_version, as_at_date, valid_from)
  VALUES ('modal_default','modal','multimodal','artic','diesel','GB',
     'tonne_km', 0.1, 'AR6_GWP100','desnz_ghg_factors','statutory_fixed','official',3,'v1',
     DATE '2026-06-01', DATE '2026-01-01');
  RAISE EXCEPTION 'FAIL 5: multimodal factor was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 5: multimodal rejected as a factor mode';
END $$;

-- ── 6. A proxy estimate must name its donor. ─────────────────────────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction,
     quantity_basis, wtw_co2e, gwp_basis, source_key, derivation, origin_class, pedigree,
     method_version, as_at_date, valid_from)
  VALUES ('proxy_estimate','modal','rail','freight','diesel','GB',
     'tonne_km', 0.1, 'unstated','desnz_ghg_factors','estimated','modelled',4,'v1',
     DATE '2026-06-01', DATE '2026-01-01');
  RAISE EXCEPTION 'FAIL 6: donorless proxy_estimate was ACCEPTED';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 6: proxy without a donor rejected';
END $$;

-- ── 7. Append-only: a value may not be edited in place. ──────────────────────────────────────────────
DO $$
BEGIN
  UPDATE public.emission_factors SET wtw_co2e = 0.999 WHERE tier = 'modal_default';
  RAISE EXCEPTION 'FAIL 7: in-place edit of a served value was ACCEPTED';
EXCEPTION WHEN raise_exception THEN
  IF sqlerrm LIKE 'FAIL 7%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS 7: in-place value edit refused by the append-only trigger';
END $$;

-- ── 8. Append-only: DELETE is refused, supersession is the mechanism. ────────────────────────────────
DO $$
DECLARE new_id uuid;
BEGIN
  BEGIN
    DELETE FROM public.emission_factors WHERE tier = 'modal_default';
    RAISE EXCEPTION 'FAIL 8a: DELETE was ACCEPTED';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'FAIL 8a%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 8a: DELETE refused';
  END;

  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction,
     quantity_basis, wtw_co2e, gwp_basis, source_key, derivation, origin_class, pedigree,
     method_version, as_at_date, valid_from)
  VALUES ('modal_default','modal','road','artic_33_44t','diesel','GB',
     'tonne_km', 0.095, 'AR6_GWP100','desnz_ghg_factors','statutory_fixed','official',3,'v2',
     DATE '2026-07-01', DATE '2026-07-01')
  RETURNING factor_id INTO new_id;

  UPDATE public.emission_factors SET superseded_by = new_id
   WHERE method_version = 'v1' AND superseded_by IS NULL;
  RAISE NOTICE 'PASS 8b: supersession accepted (the one permitted mutation)';
END $$;

-- ── 9. The licence gate: a prohibited source never reaches the candidate view. ───────────────────────
DO $$
DECLARE n_all int; n_candidates int;
BEGIN
  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction,
     quantity_basis, wtw_co2e, gwp_basis, source_key, derivation, origin_class, pedigree,
     method_version, as_at_date, valid_from)
  VALUES ('modal_default','modal','sea','container_8000teu','vlsfo','GLOBAL',
     'tonne_km', 0.008, 'AR5_GWP100','glec_framework','modelled','partner',3,'v1',
     DATE '2026-06-01', DATE '2026-01-01');

  SELECT count(*) INTO n_all        FROM public.emission_factors WHERE source_key = 'glec_framework';
  SELECT count(*) INTO n_candidates FROM public.emission_factor_candidates WHERE source_key = 'glec_framework';
  IF n_all <> 1 THEN RAISE EXCEPTION 'FAIL 9: setup did not insert the prohibited-source row'; END IF;
  IF n_candidates <> 0 THEN RAISE EXCEPTION 'FAIL 9: a prohibited source reached the candidate view'; END IF;
  RAISE NOTICE 'PASS 9: prohibited source stored but GATED OUT of the served view';
END $$;

-- ── 10. Future-dated rows and superseded rows are not candidates. ────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  INSERT INTO public.emission_factors
    (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction,
     quantity_basis, wtw_co2e, gwp_basis, source_key, derivation, origin_class, pedigree,
     method_version, as_at_date, valid_from)
  VALUES ('modal_default','modal','air','freighter_narrowbody','jet_a1','GB',
     'tonne_km', 1.2, 'AR6_GWP100','desnz_ghg_factors','statutory_fixed','official',3,'future',
     current_date + 30, DATE '2026-01-01');

  SELECT count(*) INTO n FROM public.emission_factor_candidates WHERE method_version = 'future';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 10a: a future-dated row is serving as a candidate'; END IF;
  RAISE NOTICE 'PASS 10a: future-dated row excluded';

  SELECT count(*) INTO n FROM public.emission_factor_candidates WHERE method_version = 'v1' AND source_key = 'desnz_ghg_factors';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 10b: a superseded row is still a candidate'; END IF;
  RAISE NOTICE 'PASS 10b: superseded row excluded';
END $$;

-- ── 11. Ranks reach the view, and they match the module. ────────────────────────────────────────────
SELECT tier, scope_kind, tier_rank, scope_specificity, method_version
FROM public.emission_factor_candidates ORDER BY tier_rank, scope_specificity;
