-- 258 — emission factors, the source licence register, and the licence gate as an enforced
-- database object (2026-08-12).
--
-- WHAT THIS REPLACES. The two hardcoded allowlists that the F1-F5 foundation modules carried while their
-- consumer tables did not exist. src/lib/contracts/source-licence.mjs held the licence verdicts and
-- src/lib/contracts/factor-tier.mjs held the tier hierarchy, both enforced only in application code, and
-- both carried an F25 LEGACY_ALLOWLIST entry naming THIS migration as the landing point that deletes
-- them. Those entries are deleted in the same commit as this file. If you are reading this and they are
-- still in F25-module-liveness.mjs, that is a review failure, not a follow-up.
--
-- THE DESIGN DECISION THAT SHAPES EVERYTHING BELOW: emission factors do not share one key.
--
-- The obvious schema is (corridor_id, mode) and it is wrong for four of the five tiers. UK DESNZ and US
-- EPA publish by mode, vehicle class and fuel with NO lane. EMSA THETIS-MRV aggregates to an operator.
-- Clean Cargo aggregates to a carrier and a trade lane. Only carrier primary data is about a specific
-- movement. Forcing all four shapes through one key gives you either a corridor column that is NULL for
-- the whole of v1, which is the orphaned-field class Phase 0.3 exists to delete, or invented corridors on
-- factors that were never lane-specific, which is worse: a missing claim is a gap, a fabricated one is a
-- defect that survives audit because it looks complete.
--
-- So the table carries scope_kind as a discriminator and a per-kind CHECK saying which dimensions that
-- kind REQUIRES and which it FORBIDS. A modal default physically cannot store an operator. A carrier lane
-- factor physically cannot omit its corridor.
--
-- WHAT IS DELIBERATELY NOT HERE, each with its reason:
--
--   NO FACTOR ROWS. This migration creates the structure and seeds the LICENCE REGISTER only. The DESNZ
--   and EPA numbers are a separate unit with their own verification, because a factor row asserts a
--   physical quantity and a schema does not. Shipping structure and data together would mean one review
--   covering both a design and several hundred numbers, and the numbers would not get read.
--
--   NO corridors TABLE, and no foreign key from emission_factors.corridor_id. The corridor identity
--   FUNCTIONS land here because they are pure and content-addressed: cl_corridor_id() derives a key from
--   the route itself, so the key is self-validating and needs no parent row to be meaningful. The
--   corridors ENTITY, with its attributes and its FK, belongs to the spine unit. A CHECK on the key
--   pattern gives the integrity a premature FK would give, without pulling an unspecified entity model
--   forward.
--
--   NO ANTITRUST k-ANONYMITY CONSTRAINT. It was drafted and removed. k>=5 distinct organisations and the
--   25% dominance cap protect a CROSS-ORGANISATION BENCHMARK. A verified_operator_avg is one operator's
--   own ships aggregated from EMSA THETIS-MRV, which is statutory public per-ship disclosure under
--   Regulation (EU) 2015/757 Article 21. There is no confidentiality interest to protect and no
--   competitor whose data is being pooled. Putting the constraint here anyway would enforce nothing real
--   and would teach the next reader that these constraints are decoration. It belongs on the benchmark
--   surface, where the pooling actually happens.
--
--   NOTHING SCHEDULED, NOTHING ARMED. No pg_cron entry, no pg_net call, no trigger that reaches outside
--   the database. The only trigger here refuses writes.
--
-- APPEND-ONLY, AND WHY IT IS A TRIGGER RATHER THAN A CONVENTION. A factor that has been used to compute a
-- served number must never change in place, or every historical claim silently becomes a different claim
-- and the audit trail describes a state that no longer exists. Correction happens by inserting the
-- corrected row and pointing superseded_by at it. The trigger permits exactly two columns to change,
-- superseded_by and valid_to, which are the supersession mechanism itself.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'ABORT: pgcrypto is required — cl_corridor_id() uses digest() and must match Node createHash(sha256)';
  END IF;
END $$;

-- ── The source licence register ──────────────────────────────────────────────────────────────────────
-- The application gate (mayEmbedAsSeed / assertEmbeddable) and this table are the SAME verdicts, because
-- the seed below is generated from the module rather than transcribed.
CREATE TABLE IF NOT EXISTS public.data_sources (
  source_key      text PRIMARY KEY,
  name            text NOT NULL,
  redistribution  text NOT NULL CHECK (redistribution IN ('permitted', 'conditional', 'unverified', 'prohibited')),
  embeddable      boolean NOT NULL,
  licence         text,
  attribution     text,
  url             text,
  verified_on     date,
  blocker         text,       -- why a prohibited source is prohibited
  ask_who         text,       -- for a conditional source: who discharges the condition
  ask_what        text,       -- and what exactly to ask them
  substitute      text,       -- the licence-safe replacement, where one exists
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- embeddable is DERIVED from redistribution, never independently set. Storing both without binding
  -- them is how a prohibited source ends up flagged embeddable by a careless UPDATE.
  CONSTRAINT data_sources_embeddable_matches_verdict CHECK (embeddable = (redistribution = 'permitted'))
);

COMMENT ON TABLE public.data_sources IS
  'Licence verdicts per data source. Generated from src/lib/contracts/source-licence.mjs. '
  'Unregistered sources fail closed: absence from this table means NOT embeddable, never unknown.';

-- >>> GENERATED: data_source_seed >>>
-- GENERATED by src/lib/contracts/source-licence.mjs renderDataSourceSeedSql(). DO NOT EDIT BY HAND.
-- Drift-guarded: the guard regenerates this block and byte-compares against the migration.
-- Register verified 2026-08-12. 27 sources: 15 embeddable, 3 conditional/unverified, 9 prohibited.
INSERT INTO public.data_sources
  (source_key, name, redistribution, embeddable, licence, attribution, url, verified_on, blocker, ask_who, ask_what, substitute)
VALUES
  ('desnz_ghg_factors', 'UK DESNZ/Defra GHG conversion factors', 'permitted', true, 'OGL v3.0', 'Contains public sector information licensed under the Open Government Licence v3.0.', 'https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('eurostat', 'Eurostat', 'permitted', true, 'CC BY 4.0 (Decision 2011/833/EU)', 'Source: Eurostat', 'https://ec.europa.eu/eurostat/about-us/policies/copyright', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('ec_weekly_oil_bulletin', 'European Commission Weekly Oil Bulletin (DG ENER)', 'permitted', true, 'CC BY 4.0 (Decision 2011/833/EU)', 'Source: European Commission, Weekly Oil Bulletin (DG Energy). © European Union — reused under Decision 2011/833/EU (CC BY 4.0); changes indicated.', 'https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en', '2026-08-30'::date, NULL, NULL, NULL, NULL),
  ('eia', 'US Energy Information Administration', 'permitted', true, 'US public domain (17 USC 105)', 'Source: U.S. Energy Information Administration', 'https://www.eia.gov/about/copyrights_reuse.php', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('bls', 'US Bureau of Labor Statistics', 'permitted', true, 'US public domain', 'Source: U.S. Bureau of Labor Statistics', 'https://www.bls.gov/bls/linksite.htm', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('ember', 'Ember', 'permitted', true, 'CC BY 4.0', 'Source: Ember, licensed under CC BY 4.0', 'https://ember-energy.org/creative-commons/', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('eea', 'European Environment Agency', 'permitted', true, 'CC BY 4.0', 'Source: European Environment Agency (EEA), licensed under CC BY 4.0', 'https://www.eea.europa.eu/en/legal-notice', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('eurlex', 'EUR-Lex / Official Journal', 'permitted', true, 'CC BY 4.0 (Decision 2011/833/EU)', '© European Union, https://eur-lex.europa.eu — reused under Decision 2011/833/EU. Only the Official Journal of the European Union is authentic.', 'https://commission.europa.eu/legal-notice_en', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('gleif_lei', 'GLEIF LEI', 'permitted', true, 'CC0 1.0', NULL, 'https://www.gleif.org/en/meta/lei-data-terms-of-use', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('pvgis', 'PVGIS (JRC)', 'permitted', true, 'No restrictions stated', 'Source: PVGIS, European Commission Joint Research Centre', 'https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/general-information/usage-conditions-data-protection_en', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('worldbank', 'World Bank datasets (excl. CPPI)', 'permitted', true, 'CC BY 4.0', 'The World Bank', 'https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('epa_egrid', 'US EPA eGRID and GHG Emission Factors Hub', 'permitted', true, 'US public domain', 'Source: U.S. Environmental Protection Agency', 'https://www.epa.gov/egrid', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('nga_wpi', 'NGA World Port Index', 'permitted', true, 'US public domain', 'Source: US National Geospatial-Intelligence Agency, World Port Index', 'https://msi.nga.mil/Publications/WPI', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('geonames', 'GeoNames', 'permitted', true, 'CC BY 4.0', 'Source: GeoNames, licensed under CC BY 4.0', 'https://www.geonames.org/about.html', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('wikidata', 'Wikidata', 'permitted', true, 'CC0 1.0', NULL, 'https://www.wikidata.org/wiki/Wikidata:Licensing', '2026-08-12'::date, NULL, NULL, NULL, NULL),
  ('emsa_thetis_mrv', 'EMSA THETIS-MRV', 'conditional', false, 'EMSA site disclaimer, no dataset-specific licence found', 'Source: EMSA THETIS-MRV. Reproduced with acknowledgement of source.', 'https://www.emsa.europa.eu/disclaimer.html', '2026-08-12'::date, NULL, 'EMSA information desk, and DG CLIMA Unit B2 (maritime MRV)', 'Does the THETIS-MRV public emission report fall under the EU reuse policy (Decision 2011/833/EU / CC BY 4.0)?', NULL),
  ('worldbank_cppi', 'World Bank Container Port Performance Index', 'conditional', false, 'CC BY 3.0 IGO with third-party carve-out', 'The World Bank, Container Port Performance Index. License: CC BY 3.0 IGO.', 'https://documents1.worldbank.org/curated/en/099060324114539683/txt/P175833-38923075-0337-4387-be64-a5ea7b90e0e6.txt', '2026-08-12'::date, NULL, 'World Bank Transport Global Practice (CPPI team), pubrights@worldbank.org', 'Does CC BY 3.0 IGO extend to the CPPI index scores and rankings TABLE, or only the narrative?', NULL),
  ('clean_cargo_aggregate', 'Clean Cargo aggregate trade-lane averages (public report)', 'conditional', false, 'Proprietary, notification-based', 'Smart Freight Centre is acknowledged as the source.', 'https://smart-freight-centre-media.s3.amazonaws.com/documents/Clean_Cargo_-_2023_Global_Ocean_Container_Emissions_Report.pdf', '2026-08-12'::date, NULL, 'info@smartfreightcentre.org', 'Does the report''s written-notification clause operate as a standing licence for a SaaS product, or will SFC require a commercial agreement? Also: is the clause still present in the current edition?', NULL),
  ('glec_framework', 'GLEC Framework default emission factor tables', 'prohibited', false, 'Proprietary, © Smart Freight Centre', NULL, 'https://smart-freight-centre-media.s3.amazonaws.com/documents/GLEC_FRAMEWORK_v3.2_21_10_25_1.pdf', '2026-08-12'::date, '"No use of this publication may be made for resale or for any other commercial purpose whatsoever, without prior permission in writing from Smart Freight Centre." Free to download is not free to reuse.', NULL, NULL, 'desnz_ghg_factors'),
  ('iso_14083', 'EN ISO 14083:2023 default values and tables', 'prohibited', false, 'ISO single registered end-user licence', NULL, 'https://www.iso.org/terms-conditions-licence-agreement.html', '2026-08-12'::date, 'The strictest terms in the set. A single NAMED end-user licence that cannot be shared even within our own legal entity, and "integration, embedding, encoding, structuring, transformation, or operationalization of the ISO Publication within any digital or software-based environment" requires SEPARATE licensing. Structured extraction and text/data mining are also barred.', NULL, NULL, 'desnz_ghg_factors'),
  ('clean_cargo_carrier', 'Clean Cargo carrier-specific trade-lane factors', 'prohibited', false, 'Members-only platform', NULL, 'https://www.bsr.org/files/clean-cargo/BSR-Clean-Cargo-Emissions-Report-2021.pdf', '2026-08-12'::date, 'Carrier-specific factors are "only accessible to members". No public licence. Whether a member may re-serve them to its own customers is UNVERIFIED, and membership cost is unpublished.', NULL, NULL, 'emsa_thetis_mrv'),
  ('iea_datasets', 'IEA datasets (end-use prices, grid factors, data annexes)', 'prohibited', false, 'IEA Terms of Use for Non-CC Material', NULL, 'https://www.iea.org/terms/terms-of-use-for-non-cc-material', '2026-08-12'::date, 'Explicit and describes our exact use case: prohibits disseminating in entirety free or for a fee, prohibits databases "substantially derived from" the material or that "could constitute a substitute", and caps downloadable raw data at five data points.', NULL, NULL, 'ember'),
  ('un_locode', 'UN/LOCODE', 'prohibited', false, 'UN Terms and Conditions of Use', NULL, 'https://unlocode.unece.org/terms', '2026-08-12'::date, '"personal, non-commercial use, without any right to resell or redistribute them", and compiling or creating derivative works is prohibited. No open licence exists anywhere.', NULL, NULL, 'nga_wpi'),
  ('scac', 'SCAC codes (NMFTA)', 'prohibited', false, 'NMFTA proprietary + ®', NULL, 'https://nmfta.org/scac/scac-ip/', '2026-08-12'::date, '"No part of the SCAC database may be reproduced or utilized in any form or by any means… without written permission from NMFTA", and may not be "made accessible in any form to any outside parties" without a licence.', NULL, NULL, 'gleif_lei'),
  ('iata_codes', 'IATA airline designators and location identifiers', 'prohibited', false, 'IATA subscription licence', NULL, 'https://www.iata.org/contentassets/da0281244bb942feb143a22b0e6b7179/iata-airline-designators-and-location-identifiers--terms-conditions.pdf', '2026-08-12'::date, 'The clearest prohibition in the set, and it names our use twice: no redistribution "including without limitation, its clients", and "use or integration of the Codes in any commercial product or service… is strictly prohibited".', NULL, NULL, 'gleif_lei'),
  ('imo_register', 'IMO ship numbers via the S&P Global register', 'prohibited', false, 'S&P Global permitted-use terms', NULL, 'https://www.imonumbers.ihs.com/Home/DataUse', '2026-08-12'::date, '"not permitted to use these Numbers in any commercial database, commercial web-site or commercial data product" without prior written agreement; automated extraction "strictly forbidden".', NULL, NULL, 'emsa_thetis_mrv'),
  ('sbti_dashboard', 'SBTi Target Dashboard', 'prohibited', false, 'No data licence published', NULL, 'https://sciencebasedtargets.org/reports/sbti-monitoring-report-2022/important-notice', '2026-08-12'::date, '"This does not represent a license to repackage or resell any of the data"; express permission required from BOTH SBTi and CDP.', NULL, NULL, NULL)
ON CONFLICT (source_key) DO UPDATE SET
  name          = EXCLUDED.name,
  redistribution= EXCLUDED.redistribution,
  embeddable    = EXCLUDED.embeddable,
  licence       = EXCLUDED.licence,
  attribution   = EXCLUDED.attribution,
  url           = EXCLUDED.url,
  verified_on   = EXCLUDED.verified_on,
  blocker       = EXCLUDED.blocker,
  ask_who       = EXCLUDED.ask_who,
  ask_what      = EXCLUDED.ask_what,
  substitute    = EXCLUDED.substitute;
-- <<< END GENERATED: data_source_seed <<<

-- THE GATE. Every read path that serves data joins through this view rather than trusting a source_key.
CREATE OR REPLACE VIEW public.licence_clear_sources AS
SELECT source_key, name, attribution, licence, url, verified_on
FROM public.data_sources
WHERE embeddable IS TRUE;

COMMENT ON VIEW public.licence_clear_sources IS
  'Sources we may lawfully embed and re-serve. The database half of the licence gate; '
  'src/lib/contracts/source-licence.mjs is the application half, and both derive from one register.';

-- ── Corridor identity ────────────────────────────────────────────────────────────────────────────────
-- Pure, immutable, content-addressed. No table dependency by design: the key IS the route, so it can be
-- minted and compared before the corridors entity exists. Length-prefixed fields kill delimiter
-- injection as a class, and the via[] array is part of the payload so a Cape reroute and a Suez routing
-- hash DIFFERENTLY, which is the collision an external review found in the previous scheme.
-- >>> GENERATED: corridor_id_functions >>>
-- GENERATED by src/lib/contracts/corridor-id.mjs renderCorridorIdSql(). DO NOT EDIT BY HAND.
-- Drift-guarded: the guard regenerates this body and byte-compares against the migration.
CREATE OR REPLACE FUNCTION cl_corridor_field(v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL THEN 'N#'
              ELSE octet_length(v)::text || '#' || v END;
$$;

CREATE OR REPLACE FUNCTION cl_corridor_id(
  p_origin text, p_dest text, p_mode text,
  p_leg_ordinal int DEFAULT NULL, p_routing_key text DEFAULT NULL, p_via text[] DEFAULT '{}'
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'cl:corridor:' || left(encode(digest(
      'v1'
      || cl_corridor_field(upper(btrim(p_origin, E' 	
')))
      || cl_corridor_field(upper(btrim(p_dest, E' 	
')))
      || cl_corridor_field(lower(btrim(p_mode, E' 	
')))
      || cl_corridor_field(p_leg_ordinal::text)
      || cl_corridor_field(lower(btrim(p_routing_key, E' 	
')))
      || cl_corridor_field(coalesce(array_length(p_via, 1), 0)::text)
      || coalesce((SELECT string_agg(cl_corridor_field(upper(btrim(x, E' 	
'))), '' ORDER BY ord)
                     FROM unnest(p_via) WITH ORDINALITY AS t(x, ord)), '')
    , 'sha256'), 'hex'), 16);
$$;
-- <<< END GENERATED: corridor_id_functions <<<

-- ── Emission factors ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.emission_factors (
    factor_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tier            text NOT NULL,
    scope_kind      text NOT NULL,

    -- Scope dimensions. Which of these are required and which are forbidden is decided per scope_kind by
    -- the generated CHECK block below, not by convention.
    -- No inline CHECK here on purpose: the mode vocabulary is codegen'd into the generated
    -- constraints block below, from LEG_MODE_CODES. An inline copy is a second definition that
    -- drifts, which is the exact defect this generator exists to prevent.
    mode            text NOT NULL,
    vehicle_class   text,
    energy_carrier  text,
    jurisdiction    text,       -- ISO 3166-1 alpha-2, or 'EU' / 'GLOBAL'
    grid_region     text,       -- for electrified modes, where grid intensity decides the answer
    operator_key    text,
    corridor_id     text CHECK (corridor_id IS NULL OR corridor_id ~ '^cl:corridor:[0-9a-f]{16}$'),
    movement_ref    text,

    -- The number, decomposed. ISO 14083 reports well-to-wake, which is well-to-tank plus tank-to-wake.
    -- Storing only the total makes the split unrecoverable, and the split is what FuelEU Maritime and the
    -- EU ETS actually regulate. Sources vary in what they publish, so at least one is required rather
    -- than all three.
    quantity_basis  text NOT NULL,
    wtt_co2e        numeric CHECK (wtt_co2e >= 0),
    ttw_co2e        numeric CHECK (ttw_co2e >= 0),
    wtw_co2e        numeric CHECK (wtw_co2e >= 0),

    -- Gas species where published, and the GWP basis that converted them. CO2e is a calculation, not a
    -- measurement, and its coefficients change between IPCC assessment reports.
    co2_fossil      numeric CHECK (co2_fossil >= 0),
    co2_biogenic    numeric CHECK (co2_biogenic >= 0),
    ch4             numeric CHECK (ch4 >= 0),
    n2o             numeric CHECK (n2o >= 0),
    gwp_basis       text NOT NULL,

    -- Assumptions baked into a published factor. Without these, a vehicle-km figure cannot be converted
    -- to tonne-km honestly, and the conversion is where most real-world error enters.
    load_factor_pct    numeric CHECK (load_factor_pct > 0 AND load_factor_pct <= 100),
    empty_running_pct  numeric CHECK (empty_running_pct >= 0 AND empty_running_pct < 100),

    -- Provenance and the number envelope.
    source_key      text NOT NULL REFERENCES public.data_sources(source_key),
    source_ref      text,       -- the table, row or page within the source, so a reader can check it
    donor           text,       -- required for proxy_estimate: what was borrowed from
    n_observations  integer CHECK (n_observations > 0),
-- >>> GENERATED: envelope_columns >>>
-- GENERATED by src/lib/contracts/factor-tier.mjs renderEnvelopeColumnsSql(). DO NOT EDIT BY HAND.
    derivation text NOT NULL CHECK (derivation IN ('statutory_fixed', 'statutory_formula', 'observed', 'transacted_index', 'assessed', 'calculated', 'interpolated', 'modelled', 'estimated')),
    origin_class text NOT NULL CHECK (origin_class IN ('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official')),
    pedigree smallint NOT NULL CHECK (pedigree BETWEEN 1 AND 5),
    pedigree_reliability smallint CHECK (pedigree_reliability BETWEEN 1 AND 5),
    pedigree_completeness smallint CHECK (pedigree_completeness BETWEEN 1 AND 5),
    pedigree_temporal_correlation smallint CHECK (pedigree_temporal_correlation BETWEEN 1 AND 5),
    pedigree_geographical_correlation smallint CHECK (pedigree_geographical_correlation BETWEEN 1 AND 5),
    pedigree_technological_correlation smallint CHECK (pedigree_technological_correlation BETWEEN 1 AND 5),
    method_version text NOT NULL,
-- <<< END GENERATED: envelope_columns <<<

    -- Time. as_at_date is when the source asserted it; valid_from/valid_to is the movement window it
    -- applies to. They are different questions and conflating them makes point-in-time restatement
    -- impossible, which is a reporting requirement rather than a nicety.
    as_at_date      date NOT NULL,
    valid_from      date NOT NULL,
    valid_to        date,
    superseded_by   uuid REFERENCES public.emission_factors(factor_id),
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT emission_factors_has_a_number CHECK (num_nonnulls(wtt_co2e, ttw_co2e, wtw_co2e) >= 1),
    -- When all three are stated they must agree. A published split that does not add up is a
    -- transcription error, and it is far cheaper to reject at write than to explain at audit.
    CONSTRAINT emission_factors_wtw_decomposition CHECK (
      wtt_co2e IS NULL OR ttw_co2e IS NULL OR wtw_co2e IS NULL
      OR abs(wtw_co2e - (wtt_co2e + ttw_co2e)) <= 1e-9 * greatest(wtw_co2e, 1)
    ),
    CONSTRAINT emission_factors_valid_window CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT emission_factors_proxy_needs_donor CHECK (tier <> 'proxy_estimate' OR donor IS NOT NULL),
    CONSTRAINT emission_factors_not_self_superseded CHECK (superseded_by IS NULL OR superseded_by <> factor_id),
-- >>> GENERATED: tier_constraints >>>
-- GENERATED by src/lib/contracts/factor-tier.mjs renderTierConstraintsSql(). DO NOT EDIT BY HAND.
    -- LEG modes only. `multimodal` is a corridor-level value: a factor is per leg, so a multimodal
    -- factor is a category error rather than a missing row.
    CONSTRAINT emission_factors_mode CHECK (mode IN ('road', 'rail', 'ocean', 'inland_waterway', 'air')),
    CONSTRAINT emission_factors_tier CHECK (tier IN ('carrier_primary', 'verified_operator_avg', 'programme_lane_avg', 'modal_default', 'proxy_estimate')),
    CONSTRAINT emission_factors_scope_kind CHECK (scope_kind IN ('movement', 'carrier_lane', 'operator_lane', 'modal')),
    CONSTRAINT emission_factors_quantity_basis CHECK (quantity_basis IN ('tonne_km', 'vehicle_km', 'teu_km', 'tonne', 'litre', 'kg', 'kwh', 'mj')),
    CONSTRAINT emission_factors_gwp_basis CHECK (gwp_basis IN ('AR4_GWP100', 'AR5_GWP100', 'AR6_GWP100', 'AR6_GWP20', 'unstated')),
    -- 1 = BEST (ecoinvent/Weidema, as ISO 14083 uses it). A tier may not claim a better pedigree than
    -- its floor, so a modelled default can never be stored as though it were primary data.
    CONSTRAINT emission_factors_pedigree_floor CHECK (
    (tier = 'carrier_primary' AND pedigree >= 1)
    OR
    (tier = 'verified_operator_avg' AND pedigree >= 2)
    OR
    (tier = 'programme_lane_avg' AND pedigree >= 2)
    OR
    (tier = 'modal_default' AND pedigree >= 3)
    OR
    (tier = 'proxy_estimate' AND pedigree >= 4)
    ),
    CONSTRAINT emission_factors_scope_movement CHECK (
      scope_kind <> 'movement' OR (movement_ref IS NOT NULL)
    ),
    CONSTRAINT emission_factors_scope_carrier_lane CHECK (
      scope_kind <> 'carrier_lane' OR (operator_key IS NOT NULL AND corridor_id IS NOT NULL AND movement_ref IS NULL)
    ),
    CONSTRAINT emission_factors_scope_operator_lane CHECK (
      scope_kind <> 'operator_lane' OR (operator_key IS NOT NULL AND movement_ref IS NULL)
    ),
    CONSTRAINT emission_factors_scope_modal CHECK (
      scope_kind <> 'modal' OR (vehicle_class IS NOT NULL AND energy_carrier IS NOT NULL AND jurisdiction IS NOT NULL AND operator_key IS NULL AND corridor_id IS NULL AND movement_ref IS NULL)
    )
-- <<< END GENERATED: tier_constraints <<<
);

COMMENT ON TABLE public.emission_factors IS
  'Emission factors across five tiers and four scope kinds. Append-only: correct by inserting a new row '
  'and setting superseded_by, never by editing a factor a served number was computed from.';

-- ── Append-only enforcement ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emission_factors_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'emission_factors is append-only: supersede the row instead of deleting it (factor_id=%)', OLD.factor_id;
  END IF;
  -- Only the supersession columns may move. Comparing the rest as a whole row means a column added later
  -- is protected by default rather than by remembering to extend this list.
  IF (to_jsonb(NEW) - 'superseded_by' - 'valid_to') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_by' - 'valid_to') THEN
    RAISE EXCEPTION 'emission_factors is append-only: only superseded_by and valid_to may change (factor_id=%)', OLD.factor_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS emission_factors_append_only_trg ON public.emission_factors;
CREATE TRIGGER emission_factors_append_only_trg
  BEFORE UPDATE OR DELETE ON public.emission_factors
  FOR EACH ROW EXECUTE FUNCTION public.emission_factors_append_only();

-- ── Indexes ──────────────────────────────────────────────────────────────────────────────────────────
-- The v1 read path is entirely modal lookup, so that composite comes first. The partial indexes cost
-- almost nothing while their columns are NULL for every row, and exist so the operator and lane tiers do
-- not need a migration on the day they are first populated.
CREATE INDEX IF NOT EXISTS emission_factors_modal_lookup_idx
  ON public.emission_factors (mode, jurisdiction, energy_carrier, vehicle_class, valid_from DESC)
  WHERE scope_kind = 'modal' AND superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS emission_factors_operator_idx
  ON public.emission_factors (operator_key, mode, valid_from DESC) WHERE operator_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS emission_factors_corridor_idx
  ON public.emission_factors (corridor_id, mode, valid_from DESC) WHERE corridor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS emission_factors_source_idx ON public.emission_factors (source_key);

-- ── Read model ───────────────────────────────────────────────────────────────────────────────────────
-- SQL owns ELIGIBILITY. JS owns SELECTION. See renderFactorCandidateViewSql() for why the winner is NOT
-- picked here: one doctrine implemented twice in two languages is the gate_a_* defect F24 was built to
-- find, and this module exists specifically to prevent JS and SQL disagreeing.
-- >>> GENERATED: candidate_view >>>
-- GENERATED by src/lib/contracts/factor-tier.mjs renderFactorCandidateViewSql(). DO NOT EDIT BY HAND.
-- Ranks are codegen'd from FACTOR_TIERS and SCOPE_KINDS so the view and the JS resolver cannot disagree.
CREATE OR REPLACE VIEW public.emission_factor_candidates AS
SELECT
  f.*,
  CASE f.tier
    WHEN 'carrier_primary' THEN 1
    WHEN 'verified_operator_avg' THEN 2
    WHEN 'programme_lane_avg' THEN 3
    WHEN 'modal_default' THEN 4
    WHEN 'proxy_estimate' THEN 5
  END AS tier_rank,
  CASE f.scope_kind
    WHEN 'movement' THEN 1
    WHEN 'carrier_lane' THEN 2
    WHEN 'operator_lane' THEN 3
    WHEN 'modal' THEN 4
  END AS scope_specificity
FROM public.emission_factors f
WHERE f.superseded_by IS NULL                 -- a superseded row is history, never a candidate
  AND f.as_at_date <= current_date            -- a future-dated row is an entry error, not the best factor
  AND f.source_key IN (SELECT source_key FROM public.licence_clear_sources);
-- <<< END GENERATED: candidate_view <<<

COMMENT ON VIEW public.emission_factor_candidates IS
  'Licence-clear, in-window, non-superseded factors decorated with tier_rank and scope_specificity. '
  'Eligibility only. resolveActiveFactor() in src/lib/contracts/factor-tier.mjs picks the winner.';

-- ── RLS and grants ───────────────────────────────────────────────────────────────────────────────────
-- Deliberately NOT granted to anon. These are reference data for the served product, and the default for
-- a new surface is the narrower grant; widening later is a decision someone makes on purpose.
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emission_factors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_sources_read ON public.data_sources;
CREATE POLICY data_sources_read ON public.data_sources FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS emission_factors_read ON public.emission_factors;
CREATE POLICY emission_factors_read ON public.emission_factors FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.data_sources, public.emission_factors TO authenticated;
GRANT SELECT ON public.licence_clear_sources, public.emission_factor_candidates TO authenticated;

-- No INSERT/UPDATE/DELETE policy is created. Writes arrive through the service role, which bypasses RLS,
-- so the seed loader still works while no end-user session can write a factor.

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_sources int;
  n_clear   int;
  probe_a   text;
  probe_b   text;
BEGIN
  SELECT count(*) INTO n_sources FROM public.data_sources;
  SELECT count(*) INTO n_clear   FROM public.licence_clear_sources;
  IF n_sources = 0 THEN
    RAISE EXCEPTION 'ABORT: data_sources seeded zero rows';
  END IF;
  IF n_clear = 0 THEN
    RAISE EXCEPTION 'ABORT: no licence-clear sources — the gate would refuse every factor';
  END IF;
  IF n_clear >= n_sources THEN
    RAISE EXCEPTION 'ABORT: every source reads as embeddable (% of %) — the register lost its prohibited entries', n_clear, n_sources;
  END IF;

  -- The corridor collision the scheme exists to prevent: same endpoints, different routing.
  probe_a := cl_corridor_id('CNSHA', 'NLRTM', 'ocean', 1, 'suez', ARRAY['EGSUZ']);
  probe_b := cl_corridor_id('CNSHA', 'NLRTM', 'ocean', 1, 'cape',  ARRAY['ZACPT']);
  IF probe_a = probe_b THEN
    RAISE EXCEPTION 'ABORT: cl_corridor_id collides on routing — Suez and Cape hashed identically';
  END IF;
  IF probe_a !~ '^cl:corridor:[0-9a-f]{16}$' THEN
    RAISE EXCEPTION 'ABORT: cl_corridor_id returned a malformed key: %', probe_a;
  END IF;

  RAISE NOTICE 'migration 258 OK: % sources (% licence-clear), corridor identity live, emission_factors empty by design', n_sources, n_clear;
END $$;
