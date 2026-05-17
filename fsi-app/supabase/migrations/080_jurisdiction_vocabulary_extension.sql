-- Migration 080 — Jurisdiction vocabulary extension + RC-7 rejection logic
--
-- Date: 2026-05-16
-- Workstream: Sprint 1 Phase 4a, RC-7 (uncontrolled jurisdiction vocabulary)
-- Pre-work: docs/sprint-1/phase-3-jurisdiction-vocabulary.md
-- Operator decisions: docs/sprint-1/phase-3-operator-decision.md
-- SQL review amendments: 2026-05-16 (CRITICAL #1/#2, HIGH #1, MED #2/#3, LOW #1)
--
-- Background
-- ----------
-- Chrome audit RC-7 confirmed: 342 distinct values in
-- intelligence_items.jurisdictions vs the expected canonical 30-100.
-- Causes: 6 tokens for US federal alone (FEDERAL / UNITED_STATES /
-- US_FEDERAL / UNITED STATES FEDERAL / UNITED STATES - FEDERAL / US),
-- CZECH REPUBLIC vs CZECH_REPUBLIC, NEW YORK STATE / NEW_YORK_STATE,
-- sub-jurisdictional fragments (CARSON_RIVER_WATERSHED, BLACKSTONE
-- RIVER, BIHOR COUNTY), and ~50 long-tail cities without country
-- mapping.
--
-- The migration 072 trigger's CASE table covers ~70 entries plus US
-- state names plus UK devolved nations. Unmapped tokens are preserved
-- uppercase. RC-7 closes by extending the CASE to ~250 entries AND
-- changing the trigger's ELSE branch to surface rejected tokens to the
-- caller so they can be routed to ingest_rejections or
-- pending_jurisdiction_review.
--
-- This migration:
--   1. DROPs the migration 072 _normalize_jurisdictions(TEXT[]) and
--      recreates it with signature
--      RETURNS TABLE(canonical TEXT[], rejected TEXT[]).
--      Signature change is required so the trigger has a clean contract
--      for reading rejected tokens; sentinel-prefixing the canonical
--      array or duplicating the classification logic in the trigger
--      both create drift hazards. Operator-preferred fix per the
--      2026-05-16 SQL review CRITICAL #1.
--   2. CREATE OR REPLACEs the dependent trigger function
--      _intelligence_items_normalize_jurisdictions() to consume the new
--      TABLE shape and discard rejected for the 4a-only window.
--      Migration 082 replaces this function with one that ROUTES rejected
--      via _classify_jurisdiction_token to the new operator queue tables.
--      Note: PostgreSQL's pg_depend does NOT track PL/pgSQL function-call
--      dependencies, so DROP CASCADE on _normalize_jurisdictions does not
--      auto-drop the trigger function; we replace it explicitly.
--   3. Leaves the trigger trg_intelligence_items_normalize_jurisdictions
--      in place; it points at the trigger function which has been
--      CREATE OR REPLACEd, so no DROP TRIGGER / CREATE TRIGGER is needed.
--   4. Adds _classify_jurisdiction_token(TEXT) helper used by the
--      migration 082 trigger to decide which operator queue a rejected
--      token belongs in.
--
-- CASE additions cover: US federal variants (decision 4 carryforward),
-- 'u.s.a' / 'u.s.a.' periods-with-spaces variants (LOW #1), state-name
-- aliases, ~45 city-to-ISO-3166-2 parent mappings (Biloxi -> US-MS;
-- Brooklyn / Manhattan / Queens / Bronx / Staten Island -> US-NYC per
-- HIGH #1 since all five boroughs share NYC's regulatory frame including
-- LL97), ~50 missing country names (BANGLADESH -> BD, etc.), Canadian
-- provinces, Australian states, OECD / ASEAN / ICAO canonical free-text
-- per operator's mid-decision additions.
--
-- _classify_jurisdiction_token routes per operator decisions 2/3/4:
-- continents (decision 2) and region buckets (decision 3) and undefined
-- org groups (decision 4 partial REJECT) go to pending_jurisdiction_review.
-- RC-7 fragments (hydrological / institutional / sub-jurisdictional /
-- unparseable per decision 5) go to ingest_rejections.
-- CARIBBEAN and AMERICAS reclassified as region_bucket per MED #2/#3.
--
-- Reversibility
-- -------------
-- Manual rollback: drop the new function + trigger function + trigger +
-- _classify_jurisdiction_token, then re-paste migration 072's body.
-- The signature change makes simple CREATE OR REPLACE rollback impossible.
--
-- Phase 5 backfill re-normalizes every existing row through the new
-- CASE. Phase 6 ingest gets the per-write enforcement.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Drop old normalizer (signature change requires drop + recreate).
--    No CASCADE needed: PostgreSQL pg_depend does not track PL/pgSQL
--    function-call dependencies, so the trigger function from migration
--    072 remains in place. We replace its body via CREATE OR REPLACE
--    below so the next trigger fire resolves to the new TABLE shape.
-- ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public._normalize_jurisdictions(TEXT[]);

-- ──────────────────────────────────────────────────────────────────────
-- 2. Extended _normalize_jurisdictions returning (canonical, rejected).
-- ──────────────────────────────────────────────────────────────────────

CREATE FUNCTION public._normalize_jurisdictions(input TEXT[])
RETURNS TABLE(canonical TEXT[], rejected TEXT[])
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  el           TEXT;
  parts        TEXT[];
  part         TEXT;
  key          TEXT;
  mapped       TEXT;
  canon_acc    TEXT[] := ARRAY[]::TEXT[];
  reject_acc   TEXT[] := ARRAY[]::TEXT[];
  i            INT;
  is_composite BOOLEAN;
BEGIN
  IF input IS NULL THEN
    canonical := ARRAY[]::TEXT[];
    rejected  := ARRAY[]::TEXT[];
    RETURN NEXT;
    RETURN;
  END IF;

  FOREACH el IN ARRAY input LOOP
    IF el IS NULL THEN CONTINUE; END IF;
    parts := regexp_split_to_array(el, '[,;|]');
    is_composite := array_length(parts, 1) > 1;

    FOR i IN 1 .. coalesce(array_length(parts, 1), 0) LOOP
      part := btrim(parts[i]);
      IF part = '' THEN CONTINUE; END IF;

      key := lower(part);
      mapped := NULL;

      -- US state 2-letter code disambiguation (unchanged from 072)
      IF is_composite AND i > 1 AND length(key) = 2 AND key ~ '^[a-z]{2}$' THEN
        mapped := CASE key
          WHEN 'al' THEN 'US-AL' WHEN 'ak' THEN 'US-AK' WHEN 'az' THEN 'US-AZ'
          WHEN 'ar' THEN 'US-AR' WHEN 'ca' THEN 'US-CA' WHEN 'co' THEN 'US-CO'
          WHEN 'ct' THEN 'US-CT' WHEN 'de' THEN 'US-DE' WHEN 'fl' THEN 'US-FL'
          WHEN 'ga' THEN 'US-GA' WHEN 'hi' THEN 'US-HI' WHEN 'id' THEN 'US-ID'
          WHEN 'il' THEN 'US-IL' WHEN 'in' THEN 'US-IN' WHEN 'ia' THEN 'US-IA'
          WHEN 'ks' THEN 'US-KS' WHEN 'ky' THEN 'US-KY' WHEN 'la' THEN 'US-LA'
          WHEN 'me' THEN 'US-ME' WHEN 'md' THEN 'US-MD' WHEN 'ma' THEN 'US-MA'
          WHEN 'mi' THEN 'US-MI' WHEN 'mn' THEN 'US-MN' WHEN 'ms' THEN 'US-MS'
          WHEN 'mo' THEN 'US-MO' WHEN 'mt' THEN 'US-MT' WHEN 'ne' THEN 'US-NE'
          WHEN 'nv' THEN 'US-NV' WHEN 'nh' THEN 'US-NH' WHEN 'nj' THEN 'US-NJ'
          WHEN 'nm' THEN 'US-NM' WHEN 'ny' THEN 'US-NY' WHEN 'nc' THEN 'US-NC'
          WHEN 'nd' THEN 'US-ND' WHEN 'oh' THEN 'US-OH' WHEN 'ok' THEN 'US-OK'
          WHEN 'or' THEN 'US-OR' WHEN 'pa' THEN 'US-PA' WHEN 'ri' THEN 'US-RI'
          WHEN 'sc' THEN 'US-SC' WHEN 'sd' THEN 'US-SD' WHEN 'tn' THEN 'US-TN'
          WHEN 'tx' THEN 'US-TX' WHEN 'ut' THEN 'US-UT' WHEN 'vt' THEN 'US-VT'
          WHEN 'va' THEN 'US-VA' WHEN 'wa' THEN 'US-WA' WHEN 'wv' THEN 'US-WV'
          WHEN 'wi' THEN 'US-WI' WHEN 'wy' THEN 'US-WY'
          ELSE NULL
        END;
      END IF;

      IF mapped IS NULL THEN
        mapped := CASE key
          -- ─── Existing 072 mappings (preserved verbatim) ───────────────
          WHEN 'us' THEN 'US'
          WHEN 'usa' THEN 'US'
          WHEN 'u.s.a' THEN 'US'        -- LOW #1: periods-with-spaces variant
          WHEN 'u.s.a.' THEN 'US'       -- LOW #1: periods-with-spaces variant
          WHEN 'united states' THEN 'US'
          WHEN 'united states of america' THEN 'US'
          WHEN 'eu' THEN 'EU'
          WHEN 'european union' THEN 'EU'
          WHEN 'eu-27' THEN 'EU'
          WHEN 'uk' THEN 'GB'
          WHEN 'united kingdom' THEN 'GB'
          WHEN 'great britain' THEN 'GB'
          WHEN 'global' THEN 'GLOBAL'
          WHEN 'international' THEN 'GLOBAL'
          WHEN 'worldwide' THEN 'GLOBAL'
          WHEN 'singapore' THEN 'SG'
          WHEN 'hong kong' THEN 'HK'
          WHEN 'japan' THEN 'JP'
          WHEN 'south korea' THEN 'KR'
          WHEN 'korea' THEN 'KR'
          WHEN 'china' THEN 'CN'
          WHEN 'china (prc)' THEN 'CN'
          WHEN 'prc' THEN 'CN'
          WHEN 'canada' THEN 'CA'
          WHEN 'australia' THEN 'AU'
          WHEN 'imo' THEN 'IMO'
          WHEN 'icao' THEN 'ICAO'
          WHEN 'germany' THEN 'DE'
          WHEN 'france' THEN 'FR'
          WHEN 'italy' THEN 'IT'
          WHEN 'spain' THEN 'ES'
          WHEN 'netherlands' THEN 'NL'
          WHEN 'belgium' THEN 'BE'
          WHEN 'switzerland' THEN 'CH'
          WHEN 'sweden' THEN 'SE'
          WHEN 'norway' THEN 'NO'
          WHEN 'denmark' THEN 'DK'
          WHEN 'finland' THEN 'FI'
          WHEN 'ireland' THEN 'IE'
          WHEN 'portugal' THEN 'PT'
          WHEN 'austria' THEN 'AT'
          WHEN 'poland' THEN 'PL'
          WHEN 'india' THEN 'IN'
          WHEN 'brazil' THEN 'BR'
          WHEN 'mexico' THEN 'MX'
          WHEN 'argentina' THEN 'AR'
          WHEN 'chile' THEN 'CL'
          WHEN 'colombia' THEN 'CO'
          WHEN 'peru' THEN 'PE'
          WHEN 'south africa' THEN 'ZA'
          WHEN 'united arab emirates' THEN 'AE'
          WHEN 'uae' THEN 'AE'
          WHEN 'saudi arabia' THEN 'SA'
          WHEN 'turkey' THEN 'TR'
          WHEN 'indonesia' THEN 'ID'
          WHEN 'thailand' THEN 'TH'
          WHEN 'vietnam' THEN 'VN'
          WHEN 'malaysia' THEN 'MY'
          WHEN 'philippines' THEN 'PH'
          WHEN 'new zealand' THEN 'NZ'
          WHEN 'lithuania' THEN 'LT'
          WHEN 'iran' THEN 'IR'
          WHEN 'kenya' THEN 'KE'
          WHEN 'croatia' THEN 'HR'
          WHEN 'puerto rico' THEN 'PR'
          -- US state names (preserved from 072)
          WHEN 'alabama' THEN 'US-AL'
          WHEN 'alaska' THEN 'US-AK'
          WHEN 'arizona' THEN 'US-AZ'
          WHEN 'arkansas' THEN 'US-AR'
          WHEN 'california' THEN 'US-CA'
          WHEN 'colorado' THEN 'US-CO'
          WHEN 'connecticut' THEN 'US-CT'
          WHEN 'delaware' THEN 'US-DE'
          WHEN 'florida' THEN 'US-FL'
          WHEN 'georgia' THEN 'US-GA'
          WHEN 'hawaii' THEN 'US-HI'
          WHEN 'idaho' THEN 'US-ID'
          WHEN 'illinois' THEN 'US-IL'
          WHEN 'indiana' THEN 'US-IN'
          WHEN 'iowa' THEN 'US-IA'
          WHEN 'kansas' THEN 'US-KS'
          WHEN 'kentucky' THEN 'US-KY'
          WHEN 'louisiana' THEN 'US-LA'
          WHEN 'maine' THEN 'US-ME'
          WHEN 'maryland' THEN 'US-MD'
          WHEN 'massachusetts' THEN 'US-MA'
          WHEN 'michigan' THEN 'US-MI'
          WHEN 'minnesota' THEN 'US-MN'
          WHEN 'mississippi' THEN 'US-MS'
          WHEN 'missouri' THEN 'US-MO'
          WHEN 'montana' THEN 'US-MT'
          WHEN 'nebraska' THEN 'US-NE'
          WHEN 'nevada' THEN 'US-NV'
          WHEN 'new hampshire' THEN 'US-NH'
          WHEN 'new jersey' THEN 'US-NJ'
          WHEN 'new mexico' THEN 'US-NM'
          WHEN 'new york' THEN 'US-NY'
          WHEN 'north carolina' THEN 'US-NC'
          WHEN 'north dakota' THEN 'US-ND'
          WHEN 'ohio' THEN 'US-OH'
          WHEN 'oklahoma' THEN 'US-OK'
          WHEN 'oregon' THEN 'US-OR'
          WHEN 'pennsylvania' THEN 'US-PA'
          WHEN 'rhode island' THEN 'US-RI'
          WHEN 'south carolina' THEN 'US-SC'
          WHEN 'south dakota' THEN 'US-SD'
          WHEN 'tennessee' THEN 'US-TN'
          WHEN 'texas' THEN 'US-TX'
          WHEN 'utah' THEN 'US-UT'
          WHEN 'vermont' THEN 'US-VT'
          WHEN 'virginia' THEN 'US-VA'
          WHEN 'washington' THEN 'US-WA'
          WHEN 'washington state' THEN 'US-WA'
          WHEN 'west virginia' THEN 'US-WV'
          WHEN 'wisconsin' THEN 'US-WI'
          WHEN 'wyoming' THEN 'US-WY'
          WHEN 'england' THEN 'GB-ENG'
          WHEN 'scotland' THEN 'GB-SCT'
          WHEN 'wales' THEN 'GB-WLS'
          WHEN 'northern ireland' THEN 'GB-NIR'
          WHEN 'northern_ireland' THEN 'GB-NIR'

          -- ─── NEW: Operator-approved additions (Phase 3 + ICAO/OECD/ASEAN) ──

          -- US federal variants (decision 4 carryforward, all collapse to US)
          WHEN 'federal' THEN 'US'
          WHEN 'united_states' THEN 'US'
          WHEN 'us_federal' THEN 'US'
          WHEN 'united states federal' THEN 'US'
          WHEN 'united states - federal' THEN 'US'
          WHEN 'us federal' THEN 'US'

          -- State variants (collapse to ISO 3166-2)
          WHEN 'new york state' THEN 'US-NY'
          WHEN 'new_york_state' THEN 'US-NY'
          WHEN 'new york city' THEN 'US-NYC'    -- platform extension per operator decision 1
          WHEN 'new_york_city' THEN 'US-NYC'
          WHEN 'nyc' THEN 'US-NYC'

          -- Long-tail cities mapped to country/state parent (operator decision 6)
          WHEN 'los angeles' THEN 'US-LAX'      -- platform extension
          WHEN 'san francisco' THEN 'US-CA'
          WHEN 'san_francisco' THEN 'US-CA'
          WHEN 'boston' THEN 'US-MA'
          WHEN 'chicago' THEN 'US-IL'
          WHEN 'philadelphia' THEN 'US-PA'
          WHEN 'houston' THEN 'US-TX'
          WHEN 'biloxi' THEN 'US-MS'
          WHEN 'bay st. louis' THEN 'US-MS'
          WHEN 'albuquerque' THEN 'US-NM'
          WHEN 'atlanta' THEN 'US-GA'
          WHEN 'tucson' THEN 'US-AZ'
          WHEN 'phoenix' THEN 'US-AZ'
          WHEN 'sacramento' THEN 'US-CA'
          WHEN 'oakland' THEN 'US-CA'
          WHEN 'reno' THEN 'US-NV'
          WHEN 'las vegas' THEN 'US-NV'
          WHEN 'seattle' THEN 'US-WA'
          WHEN 'portland' THEN 'US-OR'
          WHEN 'denver' THEN 'US-CO'
          WHEN 'miami' THEN 'US-FL'
          WHEN 'dallas' THEN 'US-TX'
          WHEN 'detroit' THEN 'US-MI'
          WHEN 'baltimore' THEN 'US-MD'
          WHEN 'pittsburgh' THEN 'US-PA'
          WHEN 'memphis' THEN 'US-TN'
          WHEN 'nashville' THEN 'US-TN'
          WHEN 'newark' THEN 'US-NJ'
          -- NYC five boroughs all collapse to US-NYC per SQL review HIGH #1.
          -- NYC's regulatory frame (LL97, LL84, LL97 enforcement) applies
          -- to all five boroughs uniformly; routing them to US-NY fragments
          -- NYC-municipal content across two jurisdictions.
          WHEN 'brooklyn' THEN 'US-NYC'
          WHEN 'manhattan' THEN 'US-NYC'
          WHEN 'queens' THEN 'US-NYC'
          WHEN 'bronx' THEN 'US-NYC'
          WHEN 'the bronx' THEN 'US-NYC'
          WHEN 'staten island' THEN 'US-NYC'
          WHEN 'staten_island' THEN 'US-NYC'
          WHEN 'buffalo' THEN 'US-NY'
          WHEN 'rochester' THEN 'US-NY'
          WHEN 'san diego' THEN 'US-CA'
          WHEN 'san jose' THEN 'US-CA'
          WHEN 'berkeley' THEN 'US-CA'
          WHEN 'richmond' THEN 'US-VA'
          WHEN 'washington dc' THEN 'US-DC'
          WHEN 'district of columbia' THEN 'US-DC'
          WHEN 'antwerp' THEN 'BE'
          WHEN 'bruges' THEN 'BE'
          WHEN 'brussels' THEN 'BE'
          WHEN 'diest' THEN 'BE'
          WHEN 'london' THEN 'GB-ENG'
          WHEN 'paris' THEN 'FR'
          WHEN 'berlin' THEN 'DE'
          WHEN 'munich' THEN 'DE'
          WHEN 'hamburg' THEN 'DE'
          WHEN 'barcelona' THEN 'ES'
          WHEN 'milan' THEN 'IT'
          WHEN 'tokyo' THEN 'JP'
          WHEN 'osaka' THEN 'JP'
          WHEN 'seoul' THEN 'KR'
          WHEN 'shanghai' THEN 'CN'
          WHEN 'beijing' THEN 'CN'
          WHEN 'mumbai' THEN 'IN'
          WHEN 'delhi' THEN 'IN'
          WHEN 'sao paulo' THEN 'BR'
          WHEN 'rio de janeiro' THEN 'BR'
          WHEN 'buenos aires' THEN 'AR'
          WHEN 'mexico city' THEN 'MX'
          WHEN 'dubai' THEN 'AE'
          WHEN 'abu dhabi' THEN 'AE'
          WHEN 'riyadh' THEN 'SA'
          WHEN 'johannesburg' THEN 'ZA'
          WHEN 'cape town' THEN 'ZA'
          WHEN 'sydney' THEN 'AU'
          WHEN 'melbourne' THEN 'AU'
          WHEN 'brisbane' THEN 'AU'
          WHEN 'auckland' THEN 'NZ'
          WHEN 'wellington' THEN 'NZ'

          -- Country names not in 072
          WHEN 'bangladesh' THEN 'BD'
          WHEN 'bulgaria' THEN 'BG'
          WHEN 'cyprus' THEN 'CY'
          WHEN 'czech republic' THEN 'CZ'
          WHEN 'czech_republic' THEN 'CZ'
          WHEN 'czechia' THEN 'CZ'
          WHEN 'democratic republic of the congo' THEN 'CD'
          WHEN 'drc' THEN 'CD'
          WHEN 'egypt' THEN 'EG'
          WHEN 'estonia' THEN 'EE'
          WHEN 'ethiopia' THEN 'ET'
          WHEN 'guam' THEN 'US-GU'
          WHEN 'hungary' THEN 'HU'
          WHEN 'iceland' THEN 'IS'
          WHEN 'israel' THEN 'IL'
          WHEN 'latvia' THEN 'LV'
          WHEN 'luxembourg' THEN 'LU'
          WHEN 'malta' THEN 'MT'
          WHEN 'morocco' THEN 'MA'
          WHEN 'nigeria' THEN 'NG'
          WHEN 'pakistan' THEN 'PK'
          WHEN 'qatar' THEN 'QA'
          WHEN 'republic of korea' THEN 'KR'
          WHEN 'romania' THEN 'RO'
          WHEN 'serbia' THEN 'RS'
          WHEN 'slovakia' THEN 'SK'
          WHEN 'slovenia' THEN 'SI'
          WHEN 'taiwan' THEN 'TW'
          WHEN 'ukraine' THEN 'UA'
          WHEN 'united_kingdom' THEN 'GB'
          WHEN 'american samoa' THEN 'US-AS'
          WHEN 'bonaire' THEN 'BQ'

          -- Canadian provinces (ISO 3166-2)
          WHEN 'alberta' THEN 'CA-AB'
          WHEN 'british columbia' THEN 'CA-BC'
          WHEN 'manitoba' THEN 'CA-MB'
          WHEN 'new brunswick' THEN 'CA-NB'
          WHEN 'newfoundland and labrador' THEN 'CA-NL'
          WHEN 'nova scotia' THEN 'CA-NS'
          WHEN 'northwest territories' THEN 'CA-NT'
          WHEN 'nunavut' THEN 'CA-NU'
          WHEN 'ontario' THEN 'CA-ON'
          WHEN 'prince edward island' THEN 'CA-PE'
          WHEN 'quebec' THEN 'CA-QC'
          WHEN 'saskatchewan' THEN 'CA-SK'
          WHEN 'yukon' THEN 'CA-YT'
          WHEN 'montreal' THEN 'CA-QC'
          WHEN 'toronto' THEN 'CA-ON'
          WHEN 'vancouver' THEN 'CA-BC'

          -- Australian states (ISO 3166-2)
          WHEN 'new south wales' THEN 'AU-NSW'
          WHEN 'nsw' THEN 'AU-NSW'
          WHEN 'queensland' THEN 'AU-QLD'
          WHEN 'qld' THEN 'AU-QLD'
          WHEN 'victoria' THEN 'AU-VIC'
          WHEN 'vic' THEN 'AU-VIC'
          WHEN 'south australia' THEN 'AU-SA'
          WHEN 'western australia' THEN 'AU-WA'
          WHEN 'tasmania' THEN 'AU-TAS'
          WHEN 'northern territory' THEN 'AU-NT'
          WHEN 'australian capital territory' THEN 'AU-ACT'
          WHEN 'act' THEN 'AU-ACT'

          -- New canonical free-text (operator decision 4 + ICAO addition)
          WHEN 'oecd' THEN 'OECD'
          WHEN 'asean' THEN 'ASEAN'
          WHEN 'icao member states (193)' THEN 'ICAO'

          ELSE NULL
        END;
      END IF;

      -- Standalone bare uppercase 2-letter codes (unchanged from 072)
      IF mapped IS NULL AND length(part) = 2 AND part ~ '^[A-Z]{2}$' THEN
        mapped := part;
      END IF;
      -- Pass-through canonical ISO 3166-2 codes (widened to 4-char subdiv
      -- so US-NYC, US-LAX, AU-NSW, AU-ACT, AU-QLD pass through cleanly)
      IF mapped IS NULL AND part ~ '^[A-Z]{2}-[A-Z0-9]{1,4}$' THEN
        mapped := part;
      END IF;

      IF mapped IS NOT NULL THEN
        IF NOT (mapped = ANY(canon_acc)) THEN
          canon_acc := array_append(canon_acc, mapped);
        END IF;
      ELSE
        -- CHANGED from 072: previously ELSE preserved-uppercased into
        -- result. Now ELSE surfaces the unmapped token via the
        -- `rejected` array. The migration 082 trigger reads `rejected`
        -- and routes per _classify_jurisdiction_token to either
        -- ingest_rejections or pending_jurisdiction_review.
        --
        -- In the 4a-only window (migration 081 ships docs, migration
        -- 082 is Phase 4b), the trigger function from migration 072
        -- (recreated below) discards `rejected` silently because the
        -- target tables don't exist yet. This is acceptable: ingest
        -- is paused during the migration window, so no new tokens
        -- need routing until migration 082 wires it.
        IF NOT (part = ANY(reject_acc)) THEN
          reject_acc := array_append(reject_acc, part);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  SELECT array_agg(x ORDER BY x) INTO canon_acc FROM unnest(canon_acc) AS x;
  IF canon_acc IS NULL THEN
    canon_acc := ARRAY[]::TEXT[];
  END IF;
  SELECT array_agg(x ORDER BY x) INTO reject_acc FROM unnest(reject_acc) AS x;
  IF reject_acc IS NULL THEN
    reject_acc := ARRAY[]::TEXT[];
  END IF;

  canonical := canon_acc;
  rejected  := reject_acc;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public._normalize_jurisdictions(TEXT[]) IS
  'Normalize a jurisdiction TEXT[]: split on [,;|], trim, map to canonical ISO 3166-1/2 codes or free-text canonical (EU/GLOBAL/IMO/ICAO/OECD/ASEAN). Returns TABLE(canonical TEXT[], rejected TEXT[]): canonical holds the mapped values (sorted, deduped); rejected holds tokens the CASE did not map. Migration 080 extended the CASE to ~250 entries and CHANGED the ELSE branch: unmapped tokens are surfaced to the caller via the rejected array (previously preserved uppercased into result). The trigger in migration 082 reads rejected and routes per _classify_jurisdiction_token to ingest_rejections (RC-7 fragments) or pending_jurisdiction_review (continents, region buckets, undefined groups). The 4a-only trigger (recreated from migration 072) discards rejected silently because the target tables ship in 082.';

-- ──────────────────────────────────────────────────────────────────────
-- 3. Replace the trigger function body to consume the new TABLE shape.
--    The trigger from migration 072 already points at this function and
--    stays in place; only the body changes. The 4a version discards
--    `rejected`; migration 082 replaces this function again with one
--    that INSERTs rejected into the operator queue tables.
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._intelligence_items_normalize_jurisdictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.jurisdictions IS NOT NULL THEN
    SELECT canonical INTO NEW.jurisdictions
    FROM public._normalize_jurisdictions(NEW.jurisdictions);
    -- rejected is discarded in 4a; migration 082 replaces this
    -- function with one that routes rejected via
    -- _classify_jurisdiction_token to the operator queue tables.
  END IF;
  IF NEW.jurisdiction_iso IS NOT NULL THEN
    SELECT canonical INTO NEW.jurisdiction_iso
    FROM public._normalize_jurisdictions(NEW.jurisdiction_iso);
  END IF;
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 4. Classification helper: decides where a rejected token goes.
--    Used by the trigger in migration 082 to route dropped tokens.
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._classify_jurisdiction_token(token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t TEXT;
BEGIN
  IF token IS NULL THEN RETURN 'unparseable'; END IF;
  t := upper(btrim(token));
  IF t = '' THEN RETURN 'unparseable'; END IF;

  -- Continents go to pending_jurisdiction_review. CARIBBEAN and AMERICAS
  -- moved to region_bucket per SQL review MED #2/#3: CARIBBEAN is a
  -- region of North America, not a continent; AMERICAS spans two
  -- continents. Both still route to pending_jurisdiction_review, just
  -- under a more accurate taxonomy bucket.
  IF t IN (
    'ASIA','EUROPE','AFRICA','NORTH AMERICA','SOUTH AMERICA','OCEANIA','ANTARCTICA'
  ) THEN RETURN 'continent'; END IF;

  IF t IN (
    'LATAM','LATIN AMERICA','LATIN_AMERICA','MEAF','MIDDLE EAST','MIDDLE EAST AND AFRICA','NORTH_AMERICA','SOUTH_AMERICA','ASIA PACIFIC','ASIA_PACIFIC','ASIA-PACIFIC','APAC','EMEA','EMEAS','ANZ','PACIFIC RIM','SUBSAHARAN AFRICA','EASTERN EUROPE','WESTERN EUROPE','CENTRAL ASIA','SOUTHEAST ASIA','SOUTH ASIA','EAST ASIA','MENA','NORDIC','BALKANS','CARIBBEAN','AMERICAS','EAST_ASIA_PACIFIC','EUROPE_CENTRAL_ASIA','LATIN_AMERICA_CARIBBEAN','MIDDLE_EAST_NORTH_AFRICA','SOUTH_ASIA'
  ) THEN RETURN 'region_bucket'; END IF;

  IF t IN (
    'DEVELOPING_COUNTRIES','DEVELOPING COUNTRIES','ASIAN_DEVELOPMENT_BANK_MEMBERS','ASIAN DEVELOPMENT BANK MEMBERS','G7','G20','BRICS','UN_MEMBER_STATES','EU_MEMBER_STATES','EU MEMBER STATES','BALTIC_REGION','BALTIC REGION','NORTHEAST_REGION','NORTHEAST REGION','MERCOSUR','COMMONWEALTH','EEA','OECD_MEMBER_STATES','OECD MEMBER STATES','EASA_MEMBER_STATES','EASA MEMBER STATES','UN MEMBER STATES','IEA MEMBER STATES','IMO MEMBER STATES','IMO_MEMBER_STATES','SMALL_ISLAND_DEVELOPING_STATES','MULTIPLE STATES','MULTI-STATE','MULTI-JURISDICTIONAL','ALL US STATES','EUROPEAN UNION MEMBER STATES','MULTI_NATIONAL','EUROPEAN_UNION'
  ) THEN RETURN 'undefined_group'; END IF;

  -- Hydrological / natural features go to ingest_rejections.
  IF t ~ '(WATERSHED|RIVER|BASIN|LAKE|GULF|SEA|STRAIT|OCEAN|HARBOR|HARBOUR|VALLEY|MOUNTAIN|FJORD|DELTA)' THEN
    RETURN 'non_geographic';
  END IF;

  -- Agency / org names go to ingest_rejections.
  IF t ~ '(MINISTRY|AUTHORITY|AGENCY|COMMISSION|DEPARTMENT|OFFICE OF|PARLIAMENT|DOB|EPA|CARB|NMA|SDIR|CCC|UNFCCC|UNCTAD|MARITIME ADMINISTRATION|AVIATION ADMINISTRATION|SENATE|HOUSE OF|GOV\.|CONGRESS|COUNCIL|COURT|REGULATOR|BUREAU|BOARD|ASSEMBLY)' THEN
    RETURN 'institutional';
  END IF;

  -- Sub-jurisdictional county-level fragments go to ingest_rejections.
  IF t ~ 'COUNTY$' OR t ~ '^[A-Z ]+\.\s*[A-Z]+' THEN
    RETURN 'below_granularity';
  END IF;

  -- Default: unparseable (operator triages from ingest_rejections).
  RETURN 'unparseable';
END;
$$;

COMMENT ON FUNCTION public._classify_jurisdiction_token(TEXT) IS
  'Classify a jurisdiction token that did not match the CASE table. Returns one of: continent / region_bucket / undefined_group (routes to pending_jurisdiction_review); non_geographic / institutional / below_granularity / unparseable (routes to ingest_rejections). Used by the BEFORE INSERT/UPDATE trigger in migration 082.';

COMMIT;
