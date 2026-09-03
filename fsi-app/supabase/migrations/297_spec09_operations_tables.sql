-- 297 — spec 09 Operations domain tables: DQI and primary-data share (§1.4), auxiliary energy profiles
-- (§1.5), grid connection queue (§1.6). Lane SPEC-09, wave 3, 2026-09-03
-- (docs/specs/09-domain-extensions.md; docs/plans/wave3-lanes-2026-09-03.md).
--
-- Same posture as migration 296 in full — read that migration's header before this one; it is not
-- repeated here beyond what differs. In particular: surrogate uuid PKs (never `entity_id` as a column
-- name — entity_kind, migration 282, has no kind for a row of this shape), the shared, canonical
-- origin_class/derivation vocabularies (not spec 09's own narrower illustrative CHECKs), and
-- SELECT-only-to-authenticated RLS with no write policy.
--
-- ── tce_data_quality's `tce_id` — ANOTHER NAMED ENTITY-KIND GAP, DIFFERENT FROM 296's ────────────────
-- Spec §1.4 keys this table to `tce_id text NOT NULL REFERENCES entities(entity_id) -- transport chain
-- element`. A transport chain element (ISO 14083's own grain: one leg of one shipment) is finer than
-- anything the v1 entity_kind roster represents — it is not a corridor (a corridor is the LANE, not one
-- shipment's traversal of it), not a node, not an asset in the sense the enum means. Unlike 296's FK
-- columns (which all resolve to a kind that DOES exist — corridor, organisation, instrument), this one
-- has no home in entity_kind today. `tce_id` here is `text NOT NULL`, un-FK'd, a caller-supplied
-- identifier (a shipment/leg reference) — named as a gap, not silently downgraded: a future entity_kind
-- widening (a twelfth value, e.g. `shipment_leg`) is the durable fix, and is explicitly out of this
-- lane's write set (entities/entity_kind is COMMUNITY-A's and CORR's territory).

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist — migration 282 must be applied first';
  END IF;
END $$;

-- ── tce_data_quality (spec §1.4, DQI / ISO 14083 GLEC v3) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tce_data_quality (
  dqi_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tce_id           text NOT NULL CHECK (length(tce_id) > 0),  -- see header: no entity_kind fits yet
  reliability                smallint NOT NULL CHECK (reliability BETWEEN 1 AND 5),
  completeness               smallint NOT NULL CHECK (completeness BETWEEN 1 AND 5),
  temporal_correlation       smallint NOT NULL CHECK (temporal_correlation BETWEEN 1 AND 5),
  geographical_correlation   smallint NOT NULL CHECK (geographical_correlation BETWEEN 1 AND 5),
  technological_correlation  smallint NOT NULL CHECK (technological_correlation BETWEEN 1 AND 5),
  primary_data_share numeric NOT NULL CHECK (primary_data_share BETWEEN 0 AND 1),
  primary_evidence   text,     -- what makes it primary: carrier telemetry, fuel receipt, verified MRV
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tce_data_quality IS
  'Spec 09 §1.4: DQI per TRANSPORT CHAIN ELEMENT (ISO 14083 grain), never per shipment — averaging to the '
  'shipment "destroys the thing the auditor wants to see" (spec text). One row per element; a shipment''s '
  'DQI is rolled up by src/lib/spec09/dqi.mjs as a SHARE AND A DISTRIBUTION over its rows, never a mean, '
  'and never collapsed to a single letter grade.';
COMMENT ON COLUMN public.tce_data_quality.tce_id IS
  'Caller-supplied transport-chain-element identifier (e.g. a shipment leg reference). NOT an entities FK '
  '— see this migration''s header note; no entity_kind value represents this grain today.';
COMMENT ON COLUMN public.tce_data_quality.reliability IS
  'ISO 14083 / GLEC v3 axis, 1 best .. 5 worst — deliberately the ecoinvent pedigree shape (spec text). '
  'Five sibling axes below carry the same scale.';
COMMENT ON COLUMN public.tce_data_quality.primary_data_share IS
  '0..1 share of this element''s activity data that is PRIMARY (carrier telemetry, fuel receipt, verified '
  'MRV) rather than secondary/default. Rolled up across a shipment''s elements by tonne-km, never averaged '
  'row-count-wise (src/lib/spec09/dqi.mjs rollupDqi()).';

CREATE INDEX IF NOT EXISTS tce_data_quality_tce_idx ON public.tce_data_quality (tce_id);

-- ── auxiliary_energy_profiles (spec §1.5, stationary auxiliary load) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auxiliary_energy_profiles (
  profile_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_type    text NOT NULL CHECK (load_type IN
                 ('reefer_genset','airport_climate_hold','warehouse_hvac','museum_spec_hold',
                  'battery_conditioning','dehumidification')),
  node_id      text REFERENCES public.entities(entity_id),
  kw_draw      numeric NOT NULL CHECK (kw_draw >= 0),
  duty_cycle   numeric NOT NULL CHECK (duty_cycle BETWEEN 0 AND 1),
  setpoint_c   numeric,
  setpoint_rh_pct numeric CHECK (setpoint_rh_pct IS NULL OR setpoint_rh_pct BETWEEN 0 AND 100),
  hours_typical numeric NOT NULL CHECK (hours_typical >= 0),
  grid_intensity_source text,   -- Ember or EEA gCO2/kWh at that node
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auxiliary_energy_profiles IS
  'Spec 09 §1.5: STATIONARY auxiliary load (never a per-tonne-km factor) — "a 72-hour climate-controlled '
  'airport hold for a museum loan can exceed the flight leg''s own emissions" (spec text). '
  'src/lib/spec09/auxiliary-energy.mjs computes kWh consumed = kw_draw * duty_cycle * hours_typical; '
  'converting that to gCO2e requires grid_intensity_source, which this table names but does not itself '
  'carry a value for (joins to regional_data_facts where a matching row exists — out of this migration''s '
  'scope to guarantee).';
COMMENT ON COLUMN public.auxiliary_energy_profiles.node_id IS
  'entities(entity_id), kind expected = node. Not DB-enforced — see migration 296''s header note (same '
  'restraint, this table''s own FK). Nullable per spec text.';
COMMENT ON COLUMN public.auxiliary_energy_profiles.setpoint_c IS
  'e.g. 21±1°C for a real museum loan condition (spec text worked example). No CHECK range: a valid '
  'setpoint spans far below zero (pharma cold chain) to well above ambient (some industrial holds).';

CREATE INDEX IF NOT EXISTS auxiliary_energy_profiles_node_idx ON public.auxiliary_energy_profiles (node_id) WHERE node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS auxiliary_energy_profiles_load_type_idx ON public.auxiliary_energy_profiles (load_type);

-- ── grid_connection_queues (spec §1.6, the electrification gate, not a cost line) ───────────────────────
CREATE TABLE IF NOT EXISTS public.grid_connection_queues (
  queue_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id text NOT NULL REFERENCES public.entities(entity_id),
  dso_name        text NOT NULL CHECK (length(dso_name) > 0),
  capacity_band_mw text NOT NULL CHECK (length(capacity_band_mw) > 0),
  queue_months_p50 numeric CHECK (queue_months_p50 IS NULL OR queue_months_p50 >= 0),
  queue_months_p90 numeric CHECK (queue_months_p90 IS NULL OR queue_months_p90 >= 0),
  as_of           date NOT NULL,
  obs_status      text NOT NULL DEFAULT 'A' CHECK (obs_status IN (
    'A','P','E','I','F','B','D','U','V','G','M','O','L','H','Q','N'
  )),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- p90 (worse case) can never read faster than p50 (typical case) when both are present.
  CONSTRAINT grid_connection_queues_percentiles_ordered CHECK (
    queue_months_p50 IS NULL OR queue_months_p90 IS NULL OR queue_months_p90 >= queue_months_p50
  )
);

COMMENT ON TABLE public.grid_connection_queues IS
  'Spec 09 §1.6: the DSO transformer-connection queue — "commonly 24 to 36 months... the binding constraint '
  'on electrification, a region with cheap power and a 36-month queue is BLOCKED for a 2027 electrification '
  'decision regardless of €/kWh" (spec text). src/lib/spec09/grid-queue.mjs treats this as a GATE '
  '(BLOCKED/CLEAR against a decision horizon), never folds it into a €/kWh cost line.';
COMMENT ON COLUMN public.grid_connection_queues.jurisdiction_id IS
  'entities(entity_id), kind expected = jurisdiction. Not DB-enforced — see migration 296''s header note.';
COMMENT ON COLUMN public.grid_connection_queues.obs_status IS
  'SDMX CL_OBS_STATUS (src/lib/contracts/vocabularies.mjs OBS_STATUS), the SAME 16-code vocabulary the rest '
  'of this product uses for observation availability — not a bespoke status for this table. Default '
  '''A'' (Normal) matches this codebase''s existing convention for a freshly-observed row (cf. migration 106 '
  'regional_data_facts).';

CREATE INDEX IF NOT EXISTS grid_connection_queues_jurisdiction_idx ON public.grid_connection_queues (jurisdiction_id);

-- ── RLS — SELECT-only to authenticated, no write policy (see migration 296's header) ────────────────────
ALTER TABLE public.tce_data_quality ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auxiliary_energy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grid_connection_queues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tce_data_quality_read ON public.tce_data_quality;
CREATE POLICY tce_data_quality_read ON public.tce_data_quality FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auxiliary_energy_profiles_read ON public.auxiliary_energy_profiles;
CREATE POLICY auxiliary_energy_profiles_read ON public.auxiliary_energy_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS grid_connection_queues_read ON public.grid_connection_queues;
CREATE POLICY grid_connection_queues_read ON public.grid_connection_queues FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.tce_data_quality, public.auxiliary_energy_profiles, public.grid_connection_queues TO authenticated;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols int;
  n_rows int;
  rejected boolean;
  ok_jur text := 'cl:jurisdiction:0000000000000201';
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='tce_data_quality';
  IF n_cols <> 10 THEN RAISE EXCEPTION 'ABORT: tce_data_quality has % columns, expected 10', n_cols; END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='auxiliary_energy_profiles';
  IF n_cols <> 10 THEN RAISE EXCEPTION 'ABORT: auxiliary_energy_profiles has % columns, expected 10', n_cols; END IF;

  SELECT count(*) INTO n_cols FROM information_schema.columns WHERE table_schema='public' AND table_name='grid_connection_queues';
  IF n_cols <> 9 THEN RAISE EXCEPTION 'ABORT: grid_connection_queues has % columns, expected 9', n_cols; END IF;

  -- Adversarial proof — grid_connection_queues must REFUSE p90 < p50 (a queue that reads FASTER at the
  -- worse-case percentile than the typical one is a malformed row, not a real observation).
  INSERT INTO public.entities (entity_id, kind, canonical_name) VALUES (ok_jur, 'jurisdiction', 'selftest jurisdiction') ON CONFLICT DO NOTHING;
  BEGIN
    INSERT INTO public.grid_connection_queues (jurisdiction_id, dso_name, capacity_band_mw, queue_months_p50, queue_months_p90, as_of)
      VALUES (ok_jur, 'selftest DSO', '1-5MW', 30, 10, '2026-09-01');
    rejected := false;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'ABORT: grid_connection_queues accepted queue_months_p90 < queue_months_p50';
  END IF;

  DELETE FROM public.entities WHERE entity_id = ok_jur;

  SELECT count(*) INTO n_rows FROM public.tce_data_quality; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: tce_data_quality not empty'; END IF;
  SELECT count(*) INTO n_rows FROM public.auxiliary_energy_profiles; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: auxiliary_energy_profiles not empty'; END IF;
  SELECT count(*) INTO n_rows FROM public.grid_connection_queues; IF n_rows <> 0 THEN RAISE EXCEPTION 'ABORT: grid_connection_queues not empty'; END IF;

  RAISE NOTICE 'migration 297 OK: 3 tables created (tce_data_quality, auxiliary_energy_profiles, grid_connection_queues), adversarial CHECK proven live, RLS on, 0 rows';
END $$;
