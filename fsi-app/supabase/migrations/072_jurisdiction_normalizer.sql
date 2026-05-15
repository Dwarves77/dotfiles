-- 072_jurisdiction_normalizer.sql
-- Deterministic jurisdiction normalizer + trigger + one-shot backfill.
--
-- Closes the gap surfaced by docs/jurisdiction-normalization-audit-2026-05-11.md:
-- intelligence_items.jurisdictions accumulated 396 distinct raw values
-- across 626 rows because three write paths (cold-start Haiku classifier,
-- staged_updates materializer, community promote route) emit free text.
--
-- This migration:
--   1. Installs _normalize_jurisdictions(TEXT[]) — pure SQL function that
--      splits comma-fragmented composites, trims, uppercases, applies the
--      legacy-to-ISO mapping from src/lib/jurisdictions/iso.ts (plus US
--      state names and a few extras), dedupes, sorts.
--   2. Installs a BEFORE INSERT OR UPDATE trigger on intelligence_items
--      that normalizes both jurisdictions and jurisdiction_iso columns.
--   3. Runs a one-shot backfill across all existing rows.
--
-- Reads are unchanged. The function preserves any token it cannot map
-- (uppercased and trimmed) so the long tail of county/city/agency names
-- is NOT silently dropped — it just lands in canonical case. A future
-- migration can disposition those into a separate flags column once the
-- operator signs off on dropping vs reclassifying them.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Normalizer function
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._normalize_jurisdictions(input TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  el        TEXT;
  parts     TEXT[];
  part      TEXT;
  key       TEXT;
  mapped    TEXT;
  result    TEXT[] := ARRAY[]::TEXT[];
  i         INT;
  is_composite BOOLEAN;
  prev_lower TEXT;
BEGIN
  IF input IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  FOREACH el IN ARRAY input LOOP
    IF el IS NULL THEN CONTINUE; END IF;

    -- Split on comma, semicolon, or pipe to break composites like
    -- "Boston, MA" or "California; Oregon" into separate tokens.
    parts := regexp_split_to_array(el, '[,;|]');
    is_composite := array_length(parts, 1) > 1;
    prev_lower := NULL;

    FOR i IN 1 .. coalesce(array_length(parts, 1), 0) LOOP
      part := btrim(parts[i]);
      IF part = '' THEN
        CONTINUE;
      END IF;

      key := lower(part);
      mapped := NULL;

      -- ─── US state 2-letter code disambiguation
      -- Bare 2-letter codes are ambiguous: "CA" could be California
      -- (US-CA) or Canada (ISO 3166-1). Resolve to US-{state} ONLY when
      -- this is the 2nd+ token of a comma/semicolon/pipe composite AND
      -- the preceding token does not itself look like a country (i.e.,
      -- the "Boston, MA" pattern). Otherwise treat as a country code.
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
      -- Lookup: legacy strings → ISO. Mirrors LEGACY_TO_ISO_MAP in
      -- src/lib/jurisdictions/iso.ts plus extensions for the patterns
      -- observed in the 2026-05-11 audit (US state names, region
      -- buckets, the bare "uk"/"usa" variants). 2-letter codes here
      -- are treated as ISO 3166-1 country codes (the composite-split
      -- US-state path above caught the "City, ST" case already).
      mapped := CASE key
        -- ─── Legacy lower-case ISO/region (mirrors iso.ts:LEGACY_TO_ISO_MAP)
        WHEN 'us' THEN 'US'
        WHEN 'usa' THEN 'US'
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
        -- ─── Additional country names observed in audit
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
        -- ─── US state names (long tail in audit pattern F)
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
        -- ─── UK devolved nations
        WHEN 'england' THEN 'GB-ENG'
        WHEN 'scotland' THEN 'GB-SCT'
        WHEN 'wales' THEN 'GB-WLS'
        WHEN 'northern ireland' THEN 'GB-NIR'
        WHEN 'northern_ireland' THEN 'GB-NIR'
        ELSE NULL
      END;
      END IF;

      -- Bare uppercase 2-letter codes that arrive standalone (not the
      -- 2nd+ token of a composite) pass through as ISO 3166-1 country
      -- codes. Lowercase "us"/"eu"/etc. are already covered by the
      -- CASE above; this handles "DE" / "AT" / "AR" arriving already
      -- in canonical ISO shape.
      IF mapped IS NULL AND length(part) = 2 AND part ~ '^[A-Z]{2}$' THEN
        mapped := part;
      END IF;
      -- Pass-through canonical ISO 3166-2 codes already in correct form.
      IF mapped IS NULL AND part ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$' THEN
        mapped := part;
      END IF;

      IF mapped IS NOT NULL THEN
        IF NOT (mapped = ANY(result)) THEN
          result := array_append(result, mapped);
        END IF;
      ELSE
        -- Preserve unmapped tokens uppercased and trimmed. This keeps
        -- region buckets (asia, latam, meaf), county/city names,
        -- agency names, and other long-tail values in the data instead
        -- of dropping them silently. They land in canonical case so
        -- duplicate-by-case collapses ("US" vs "us" no longer count
        -- as two distinct values).
        DECLARE
          canon TEXT := upper(part);
        BEGIN
          IF NOT (canon = ANY(result)) THEN
            result := array_append(result, canon);
          END IF;
        END;
      END IF;
    END LOOP;
  END LOOP;

  -- Stable output order so downstream diffs are deterministic.
  SELECT array_agg(x ORDER BY x) INTO result FROM unnest(result) AS x;
  IF result IS NULL THEN
    result := ARRAY[]::TEXT[];
  END IF;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public._normalize_jurisdictions(TEXT[]) IS
  'Normalize a jurisdiction TEXT[]: split on [,;|], trim, map legacy strings (lowercase ISO/region/country/state names) to canonical ISO 3166-1/2 codes, uppercase unmapped tokens, dedupe, sort. Mirrors src/lib/jurisdictions/iso.ts:legacyToIso() with extensions for US state names and audited long-tail values. Pure/IMMUTABLE.';

-- ──────────────────────────────────────────────────────────────────────
-- 2. BEFORE INSERT OR UPDATE trigger on intelligence_items
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._intelligence_items_normalize_jurisdictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.jurisdictions IS NOT NULL THEN
    NEW.jurisdictions := public._normalize_jurisdictions(NEW.jurisdictions);
  END IF;
  IF NEW.jurisdiction_iso IS NOT NULL THEN
    NEW.jurisdiction_iso := public._normalize_jurisdictions(NEW.jurisdiction_iso);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intelligence_items_normalize_jurisdictions
  ON public.intelligence_items;

CREATE TRIGGER trg_intelligence_items_normalize_jurisdictions
  BEFORE INSERT OR UPDATE OF jurisdictions, jurisdiction_iso
  ON public.intelligence_items
  FOR EACH ROW
  EXECUTE FUNCTION public._intelligence_items_normalize_jurisdictions();

-- ──────────────────────────────────────────────────────────────────────
-- 3. One-shot backfill
-- ──────────────────────────────────────────────────────────────────────
-- Trigger will fire on the UPDATE and normalize each row. Filter limits
-- the rewrite to rows that have content; SET-with-same-value is a no-op
-- for trigger purposes but the explicit assignment is needed so the
-- trigger sees jurisdictions / jurisdiction_iso in OF list.

UPDATE public.intelligence_items
   SET jurisdictions     = jurisdictions,
       jurisdiction_iso  = jurisdiction_iso
 WHERE (jurisdictions IS NOT NULL AND array_length(jurisdictions, 1) IS NOT NULL)
    OR (jurisdiction_iso IS NOT NULL AND array_length(jurisdiction_iso, 1) IS NOT NULL);
